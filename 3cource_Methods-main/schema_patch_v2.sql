-- =====================================================
-- Патч схемы v1 -> v2 (выполняется на уже готовой базе)
-- =====================================================
-- Содержит только то, что появилось в версии 2:
--   * register_change с автором и journal-настройкой в пределах транзакции
--   * log_bom_change, берущий автора из bom_change
--   * propagate_bom_insert_to_modifications + триггер
-- Все определения совпадают с schema.sql; скрипт идемпотентен.

-- REGISTER_CHANGE: регистрирует изменение и делает его текущим для транзакции,
-- последующие правки состава этого изделия попадут в журнал с этим изменением.
-- Прежняя версия с двумя аргументами заменяется: перегрузку убираем, вызовы с 2 аргументами
-- продолжают работать через значение по умолчанию p_author.
DROP FUNCTION IF EXISTS register_change(INTEGER, TEXT);

CREATE OR REPLACE FUNCTION register_change(p_id_prod INTEGER, p_change_desc TEXT, p_author TEXT DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
    v_id     INTEGER;
    v_author TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM product WHERE id = p_id_prod) THEN
        RAISE EXCEPTION 'Нет изделия %', p_id_prod;
    END IF;

    IF COALESCE(TRIM(p_change_desc), '') = '' THEN
        RAISE EXCEPTION 'Нужно описание изменения';
    END IF;

    v_author := COALESCE(NULLIF(TRIM(p_author), ''), current_user);

    INSERT INTO bom_change (product_id, change_no, description, author)
    VALUES (
        p_id_prod,
        (SELECT COALESCE(MAX(change_no), 0) + 1 FROM bom_change WHERE product_id = p_id_prod),
        p_change_desc,
        v_author
    )
    RETURNING id INTO v_id;

    UPDATE product SET last_change_id = v_id WHERE id = p_id_prod;
    -- TRUE: настройка живёт до конца транзакции и не утекает в следующий запрос
    PERFORM set_config('bom.change_id', v_id::TEXT, TRUE);

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS log_bom_change() CASCADE;

-- Журналирование правок; изменение берётся из bom.change_id (его ставит register_change),
-- автор — из bom_change.author, если изменение известно, иначе текущий пользователь БД
CREATE OR REPLACE FUNCTION log_bom_change()
RETURNS TRIGGER AS $$
DECLARE
    v_row        bom_item%ROWTYPE;
    v_change_id  INTEGER;
    v_author     TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_row := OLD;
    ELSE
        v_row := NEW;
    END IF;

    -- Изделие удалено целиком: его история удаляется каскадом
    IF NOT EXISTS (SELECT 1 FROM product WHERE id = v_row.parent_product_id) THEN
        RETURN NULL;
    END IF;

    SELECT id, author INTO v_change_id, v_author
    FROM bom_change
    WHERE id = NULLIF(current_setting('bom.change_id', TRUE), '')::INTEGER
      AND product_id = v_row.parent_product_id;

    v_author := COALESCE(v_author, current_user);

    IF TG_OP = 'INSERT' THEN
        INSERT INTO bom_change_log (change_id, parent_product_id, component_id, operation,
                                    new_quantity, new_per_quantity, new_unit_id, new_is_base, changed_by)
        VALUES (v_change_id, NEW.parent_product_id, NEW.component_id, 'add',
                NEW.quantity, NEW.per_quantity, NEW.unit_id, NEW.is_base, v_author);
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO bom_change_log (change_id, parent_product_id, component_id, operation,
                                    old_quantity, new_quantity, old_per_quantity, new_per_quantity,
                                    old_unit_id, new_unit_id, old_is_base, new_is_base, changed_by)
        VALUES (v_change_id, NEW.parent_product_id, NEW.component_id, 'update',
                OLD.quantity, NEW.quantity, OLD.per_quantity, NEW.per_quantity,
                OLD.unit_id, NEW.unit_id, OLD.is_base, NEW.is_base, v_author);
    ELSE
        INSERT INTO bom_change_log (change_id, parent_product_id, component_id, operation,
                                    old_quantity, old_per_quantity, old_unit_id, old_is_base, changed_by)
        VALUES (v_change_id, OLD.parent_product_id, OLD.component_id, 'remove',
                OLD.quantity, OLD.per_quantity, OLD.unit_id, OLD.is_base, v_author);
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_log_bom_change
AFTER INSERT OR UPDATE OR DELETE ON bom_item
FOR EACH ROW
EXECUTE FUNCTION log_bom_change();

-- Позицию добавили в базовое изделие — заводим её унаследованную копию у модификаций,
-- чтобы состав модификаций не отставал от базы
CREATE OR REPLACE FUNCTION propagate_bom_insert_to_modifications()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO bom_item (parent_product_id, component_id, position_no, quantity, per_quantity, unit_id, is_base)
    SELECT m.id, NEW.component_id, NEW.position_no, NEW.quantity, NEW.per_quantity, NEW.unit_id, TRUE
    FROM product m
    WHERE m.base_product_id = NEW.parent_product_id
    ON CONFLICT (parent_product_id, component_id) DO NOTHING;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_propagate_bom_insert
AFTER INSERT ON bom_item
FOR EACH ROW
EXECUTE FUNCTION propagate_bom_insert_to_modifications();

-- Фиксируем версию схемы
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
);

DELETE FROM schema_version;
INSERT INTO schema_version (version) VALUES (2);
