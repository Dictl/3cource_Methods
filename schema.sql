-- =====================================================
-- 1. Базовые таблицы (классификатор, продукты и т.д.)
-- =====================================================

CREATE TABLE IF NOT EXISTS classifier_node (
    id          SERIAL PRIMARY KEY,
    parent_id   INTEGER REFERENCES classifier_node(id) ON DELETE RESTRICT,
    name        TEXT NOT NULL UNIQUE,
    unit        TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product (
    id                  SERIAL PRIMARY KEY,
    classifier_node_id  INTEGER NOT NULL REFERENCES classifier_node(id) ON DELETE RESTRICT,
    sku                 VARCHAR(100) UNIQUE,
    name                TEXT NOT NULL,
    created_at          TIMESTAMP DEFAULT NOW(),
    price               INTEGER NOT NULL,
    supplier            TEXT NOT NULL,
    weight_gram         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS enum_definition (
    id                  SERIAL PRIMARY KEY,
    classifier_node_id  INTEGER NOT NULL UNIQUE REFERENCES classifier_node(id) ON DELETE CASCADE,
    description         TEXT
);

CREATE TABLE IF NOT EXISTS enum_value (
    id                  SERIAL PRIMARY KEY,
    enum_definition_id  INTEGER NOT NULL REFERENCES enum_definition(id) ON DELETE CASCADE,
    value_str           TEXT,
    value_int           INTEGER,
    value_real          FLOAT,
    sort_order          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_attribute_value (
    id                  SERIAL PRIMARY KEY,
    product_id          INTEGER NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    enum_value_id       INTEGER REFERENCES enum_value(id) ON DELETE CASCADE
);

-- =====================================================
-- 2. Единицы измерения
-- =====================================================

CREATE TABLE IF NOT EXISTS unit_dimension (
    id   SERIAL      PRIMARY KEY,
    name VARCHAR(64) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS unit (
    id              SERIAL        PRIMARY KEY,
    dimension_id    INTEGER       NOT NULL REFERENCES unit_dimension(id) ON DELETE CASCADE,
    name            VARCHAR(64)   NOT NULL,
    symbol          VARCHAR(16)   NOT NULL UNIQUE,
    to_base_factor  NUMERIC(20,8) NOT NULL DEFAULT 1,
    to_base_offset  NUMERIC(20,8) NOT NULL DEFAULT 0
);

-- =====================================================
-- 3. Параметры изделий
-- =====================================================

CREATE TABLE IF NOT EXISTS parameter_definition (
    id                   SERIAL       PRIMARY KEY,
    classifier_node_id   INTEGER      NOT NULL REFERENCES classifier_node(id) ON DELETE RESTRICT,
    name                 VARCHAR(128) NOT NULL,
    unit_id              INTEGER      REFERENCES unit(id),
    value_type           VARCHAR(8)   NOT NULL CHECK (value_type IN ('str','int','real','enum')),
    sort_order           INTEGER      NOT NULL DEFAULT 0,

    UNIQUE (classifier_node_id, name)
);

-- =====================================================
-- 4. Значения параметров для продуктов
-- =====================================================

CREATE TABLE IF NOT EXISTS product_parameter_value (
    id                      SERIAL   PRIMARY KEY,
    product_id              INTEGER  NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    parameter_definition_id INTEGER  NOT NULL REFERENCES parameter_definition(id) ON DELETE RESTRICT,
    value_str               TEXT,
    value_int               INTEGER,
    value_real              NUMERIC(12,4),
    value_enum_id           INTEGER  REFERENCES enum_value(id),
    UNIQUE (product_id, parameter_definition_id),
    CONSTRAINT chk_has_value CHECK (
        value_str IS NOT NULL OR
        value_int IS NOT NULL OR
        value_real IS NOT NULL OR
        value_enum_id IS NOT NULL
    )
);

-- =====================================================
-- 5. Ограничения на численные параметры (min/max)
-- =====================================================

CREATE TABLE IF NOT EXISTS parameter_numeric_constraint (
    parameter_definition_id INTEGER PRIMARY KEY REFERENCES parameter_definition(id) ON DELETE CASCADE,
    min_value               NUMERIC(20,6) NOT NULL,
    max_value               NUMERIC(20,6) NOT NULL,
    check (min_value <= max_value)
);

-- Триггерная функция проверки численного значения (приводит int к real и проверяет ограничение)
CREATE OR REPLACE FUNCTION check_numeric_constraint()
RETURNS TRIGGER AS $$
DECLARE
    v_min NUMERIC;
    v_max NUMERIC;
    v_val NUMERIC;
BEGIN
    -- Если значение не числовое, пропускаем
    IF NEW.value_int IS NULL AND NEW.value_real IS NULL THEN
        RETURN NEW;
    END IF;

    -- Получаем ограничения для данного параметра
    SELECT min_value, max_value INTO v_min, v_max
    FROM parameter_numeric_constraint
    WHERE parameter_definition_id = NEW.parameter_definition_id;

    IF FOUND THEN
        -- Приводим значение к NUMERIC
        v_val := COALESCE(NEW.value_int, NEW.value_real);
        IF v_val < v_min OR v_val > v_max THEN
            RAISE EXCEPTION 'Значение параметра % должно быть в диапазоне [%, %]',
                            NEW.parameter_definition_id, v_min, v_max;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_check_numeric_constraint
BEFORE INSERT OR UPDATE ON product_parameter_value
FOR EACH ROW
EXECUTE FUNCTION check_numeric_constraint();

-- =====================================================
-- 6. Наследование параметров (представление, учитывающее иерархию)
-- =====================================================

-- Представление, возвращающее для каждого узла все параметры (свои + унаследованные от родителей)
CREATE OR REPLACE VIEW v_inherited_parameters AS
WITH RECURSIVE node_ancestors AS (
    -- Базовый случай: узел сам за себя
    SELECT
        cn.id AS node_id,
        cn.id AS ancestor_id,
        0 AS depth
    FROM classifier_node cn

    UNION ALL

    -- Поднимаемся вверх по родителям
    SELECT
        na.node_id,
        cn.parent_id AS ancestor_id,
        na.depth + 1
    FROM node_ancestors na
    JOIN classifier_node cn ON cn.id = na.ancestor_id
    WHERE cn.parent_id IS NOT NULL
)
SELECT DISTINCT
    na.node_id AS classifier_node_id,
    pd.id AS parameter_definition_id,
    pd.name,
    pd.unit_id,
    pd.value_type,
    pd.sort_order,
    na.ancestor_id AS defined_at_node_id  -- на каком узле определён параметр (для справки)
FROM node_ancestors na
JOIN parameter_definition pd ON pd.classifier_node_id = na.ancestor_id
ORDER BY na.node_id, pd.sort_order;

-- Триггер на запрет дублирования имён параметров в цепочке наследования.
-- Дубль внутри того же узла ловит UNIQUE (classifier_node_id, name), поэтому сиды с ON CONFLICT можно перезапускать
CREATE OR REPLACE FUNCTION prevent_duplicate_inherited_param()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM v_inherited_parameters
        WHERE classifier_node_id = NEW.classifier_node_id
          AND name = NEW.name
          AND parameter_definition_id != NEW.id
          AND defined_at_node_id != NEW.classifier_node_id
    ) THEN
        RAISE EXCEPTION 'Параметр с именем "%" уже существует для этого узла или унаследован от родителя', NEW.name;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_prevent_duplicate_inherited_param
BEFORE INSERT OR UPDATE ON parameter_definition
FOR EACH ROW
EXECUTE FUNCTION prevent_duplicate_inherited_param();

-- =====================================================
-- 7. Агрегаты параметров (с учётом наследования)
-- =====================================================

-- Представление реального времени
CREATE OR REPLACE VIEW v_parameter_aggregates AS
WITH RECURSIVE node_descendants AS (
    SELECT id AS ancestor_id, id AS descendant_id FROM classifier_node
    UNION ALL
    SELECT nd.ancestor_id, cn.id
    FROM node_descendants nd
    JOIN classifier_node cn ON cn.parent_id = nd.descendant_id
),
-- сначала получаем уникальные (продукт, параметр, значение) без дублирования
product_param_values AS (
    SELECT DISTINCT
        p.id AS product_id,
        p.classifier_node_id AS product_node_id,
        pd.id AS parameter_definition_id,
        pd.name AS param_name,
        pd.value_type,
        ppv.value_int,
        ppv.value_real,
        ppv.value_str,
        ppv.value_enum_id
    FROM product p
    JOIN v_inherited_parameters ip ON ip.classifier_node_id = p.classifier_node_id
    JOIN parameter_definition pd ON pd.id = ip.parameter_definition_id
    LEFT JOIN product_parameter_value ppv
        ON ppv.product_id = p.id AND ppv.parameter_definition_id = pd.id
)
SELECT
    nd.ancestor_id AS classifier_node_id,
    ppv.parameter_definition_id,
    ppv.param_name,
    ppv.value_type,
    COUNT(DISTINCT ppv.product_id) AS total_products,
    COUNT(CASE WHEN (ppv.value_int IS NOT NULL OR ppv.value_real IS NOT NULL OR ppv.value_str IS NOT NULL OR ppv.value_enum_id IS NOT NULL) THEN 1 END) AS filled_count,
    AVG(CASE WHEN ppv.value_type IN ('int','real') THEN COALESCE(ppv.value_int, ppv.value_real) END) AS avg_numeric,
    MIN(CASE WHEN ppv.value_type IN ('int','real') THEN COALESCE(ppv.value_int, ppv.value_real) END) AS min_numeric,
    MAX(CASE WHEN ppv.value_type IN ('int','real') THEN COALESCE(ppv.value_int, ppv.value_real) END) AS max_numeric,
    SUM(CASE WHEN ppv.value_type IN ('int','real') THEN COALESCE(ppv.value_int, ppv.value_real) END) AS sum_numeric
FROM product_param_values ppv
JOIN node_descendants nd ON nd.descendant_id = ppv.product_node_id
GROUP BY nd.ancestor_id, ppv.parameter_definition_id, ppv.param_name, ppv.value_type
ORDER BY nd.ancestor_id, ppv.param_name;

-- Создаём материализованное представление
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_parameter_aggregates AS
SELECT * FROM v_parameter_aggregates;

-- Уникальный индекс для быстрого обновления
CREATE UNIQUE INDEX IF NOT EXISTS mv_parameter_aggregates_pk ON mv_parameter_aggregates (classifier_node_id, parameter_definition_id);

-- Обновляем данные
REFRESH MATERIALIZED VIEW mv_parameter_aggregates;

-- Функция обновления материализованного представления
CREATE OR REPLACE FUNCTION refresh_aggregates()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_parameter_aggregates;
    RAISE NOTICE 'Агрегаты обновлены в %', NOW();
END;
$$;

-- для автоматического обновления
/*
CREATE OR REPLACE FUNCTION trigger_refresh_aggregates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM refresh_aggregates();
    RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER refresh_aggregates_on_change
AFTER INSERT OR UPDATE OR DELETE ON product_parameter_value
EXECUTE FUNCTION trigger_refresh_aggregates();
*/

CREATE OR REPLACE FUNCTION check_parameter_belongs_to_product_class()
RETURNS TRIGGER AS $$
DECLARE
    v_product_node_id INTEGER;
    v_param_node_id   INTEGER;
BEGIN
    SELECT classifier_node_id INTO v_product_node_id
    FROM product WHERE id = NEW.product_id;

    SELECT classifier_node_id INTO v_param_node_id
    FROM parameter_definition WHERE id = NEW.parameter_definition_id;

    -- проверяем что v_param_node_id является предком или равен v_product_node_id
    IF NOT EXISTS (
        WITH RECURSIVE ancestors AS (
            SELECT id, parent_id FROM classifier_node WHERE id = v_product_node_id
            UNION ALL
            SELECT cn.id, cn.parent_id
            FROM classifier_node cn
            JOIN ancestors a ON cn.id = a.parent_id
        )
        SELECT 1 FROM ancestors WHERE id = v_param_node_id
    ) THEN
        RAISE EXCEPTION
            'Параметр (node_id=%) не принадлежит классу продукта (node_id=%)',
            v_param_node_id, v_product_node_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_check_parameter_belongs
BEFORE INSERT OR UPDATE ON product_parameter_value
FOR EACH ROW
EXECUTE FUNCTION check_parameter_belongs_to_product_class();

-- =====================================================
-- 8. Начальные данные
-- =====================================================

-- Сиды вставляют явные id, а сервис выдаёт id как MAX(id) + 1,
-- поэтому SERIAL-последовательности отстают. Подтягиваем их к MAX(id) во всех таблицах схемы.
CREATE OR REPLACE FUNCTION sync_id_sequences()
RETURNS void AS $$
DECLARE
    v_table TEXT;
BEGIN
    FOR v_table IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND column_name = 'id'
          AND column_default LIKE 'nextval(%'
    LOOP
        EXECUTE format(
            'SELECT setval(pg_get_serial_sequence(%L, ''id''), COALESCE(MAX(id), 0) + 1, FALSE) FROM %I',
            quote_ident(v_table), v_table
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;

SELECT sync_id_sequences();

INSERT INTO classifier_node (id, parent_id, name, unit, sort_order) VALUES
(1, NULL, 'Колбасное изделие', 'грамм', 0),
(2, 1, 'Варёные',  'грамм', 1),
(3, 1, 'Копчёные',  'грамм', 2),
(4, 1, 'Цельномышечные',  'грамм', 3),
(5, 2, 'Варёная колбаса',  'грамм', 1),
(6, 2, 'Ливерные продукты',  'грамм', 2),
(7, 3, 'Варёно-копчёные',  'грамм', 1),
(8, 3, 'Полу-копчёные',  'грамм', 2),
(9, 3, 'Сырокопчёные',  'грамм', 3),
(10, 4, 'Ветчина',  'грамм', 1),
(11, 4, 'Карбонат',  'грамм', 2),
(12, 5, 'Высшего сорта',  'грамм', 1),
(13, 5, 'Сосиски/сардельки',  'грамм', 2),
(14, 5, 'Зельц',  'грамм', 3),
(15, 6, 'Ливерная колбаса',  'грамм', 1),
(16, 6, 'Паштет',  'грамм', 2),
(17, 9, 'Салями',  'грамм', 1),
(18, 9, 'Чоризо',  'грамм', 2),
(19, 10, 'Ветчина варёная',  'грамм', 1),
(20, 10, 'Буженина',  'грамм', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO product (id, classifier_node_id, sku, name, price, supplier, weight_gram) VALUES
(1, 12, 'Колбаса варёная Клинский Докторская категория А', 'Колбаса докторская Клинская', 499, 'ОАО «Мясокомбинат Клинский»', 400),
(2, 12, '«Докторская» ГОСТ, колбаса вареная в целлофане', 'Колбаса варёная', 1238, '«Окраина»', 1150),
(3, 12, '«Любительская» ГОСТ, колбаса вареная', 'Колбаса варёная', 158, '«Раменский деликатес»', 200),
(4, 15, 'Колбаса ливерная «Ближние Горки» Яичная ГОСТ', 'Колбаса ливерная «Ближние Горки» Яичная', 139, 'ОАО «Мясокомбинат Клинский»', 300),
(5, 15, 'Колбаса «Атяшево» Ливерная Печеночная', 'Колбаса ливерная печеночная', 100, '«Атяшево»', 250),
(6, 15, 'Колбаса ливерная «Микоян» Традиционная', 'Колбаса ливерная традиционная', 113, '«Раменский деликатес»', 400)
ON CONFLICT (id) DO NOTHING;

INSERT INTO enum_definition (id, classifier_node_id, description) VALUES
    (1, 2, 'Структура'),
    (2, 13, 'Порционирование'),
    (3, 1, 'Оболочка'),
    (4, 3, 'Температура копчения')
ON CONFLICT (classifier_node_id) DO NOTHING;

INSERT INTO enum_value (enum_definition_id, value_str, value_int, value_real, sort_order)
SELECT v.* FROM (VALUES
    (1, 'Гомогенная',    NULL::INTEGER, NULL::FLOAT, 1),
    (1, 'Со шпиком',  NULL, NULL, 2),
    (1, 'С кусочками',   NULL, NULL, 3),
    (2, 'Перекрут', NULL, NULL, 1),
    (2, 'Фиксированная длина',  NULL, NULL, 2),
    (3, 'Натуральная',    NULL, NULL, 1),
    (3, 'Биополимерная', NULL, NULL, 2),
    (3, 'Герметичная',   NULL, NULL, 3),
    (3, 'Текстильная',   NULL, NULL, 4),
    (3, 'Целлофан',   NULL, NULL, 5),
    (3, 'Белок',   NULL, NULL, 6),
    (4, 'Холодное',     25, NULL, 1),
    (4, 'Тёплое', 50, NULL, 2),
    (4, 'Горячее', 120, NULL, 3)
) v(enum_definition_id, value_str, value_int, value_real, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM enum_value ev
    WHERE ev.enum_definition_id = v.enum_definition_id AND ev.value_str = v.value_str
);

INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT v.product_id, ev.id
FROM (VALUES
    (1, 1, 'Гомогенная'),
    (1, 3, 'Целлофан'),
    (3, 1, 'Со шпиком'),
    (3, 3, 'Целлофан')
) v(product_id, enum_definition_id, value_str)
JOIN enum_value ev ON ev.enum_definition_id = v.enum_definition_id AND ev.value_str = v.value_str
WHERE NOT EXISTS (
    SELECT 1 FROM product_attribute_value pav
    WHERE pav.product_id = v.product_id AND pav.enum_value_id = ev.id
);

INSERT INTO unit_dimension (name) VALUES
    ('Масса'), ('Длина'), ('Температура'), ('Время'), ('Концентрация'), ('Безразмерная')
ON CONFLICT DO NOTHING;

INSERT INTO unit (dimension_id, name, symbol, to_base_factor, to_base_offset) VALUES
    (1, 'грамм',             'г',   1,       0),
    (1, 'килограмм',         'кг',  1000,    0),
    (2, 'миллиметр',         'мм',  1,       0),
    (2, 'сантиметр',         'см',  10,      0),
    (2, 'дюйм',              'in',  25.4,    0),
    (3, 'градус Цельсия',    '°C',  1,       273.15),
    (3, 'Кельвин',           'K',   1,       0),
    (4, 'минута',            'мин', 1,       0),
    (4, 'час',               'ч',   60,      0),
    (4, 'сутки',             'сут', 1440,    0),
    (5, 'процент',           '%',   1,       0),
    (6, 'штука',             'шт',  1,       0)
ON CONFLICT DO NOTHING;

-- параметры для узла «Варёное изделие» (2)
INSERT INTO parameter_definition (classifier_node_id, name, unit_id, value_type, sort_order)
SELECT 2, 'Температура варки', id, 'real', 1 FROM unit WHERE symbol='°C'
ON CONFLICT DO NOTHING;

INSERT INTO parameter_definition (classifier_node_id, name, unit_id, value_type, sort_order)
SELECT 2, 'Время варки', id, 'int', 2 FROM unit WHERE symbol='мин'
ON CONFLICT DO NOTHING;

INSERT INTO parameter_definition (classifier_node_id, name, unit_id, value_type, sort_order)
SELECT 2, 'Диаметр батона', id, 'real', 3 FROM unit WHERE symbol='мм'
ON CONFLICT DO NOTHING;

INSERT INTO parameter_definition (classifier_node_id, name, unit_id, value_type, sort_order)
SELECT 2, 'Содержание соли', id, 'real', 4 FROM unit WHERE symbol='%'
ON CONFLICT DO NOTHING;

-- параметры для узла «Копчёное изделие» (3)
INSERT INTO parameter_definition (classifier_node_id, name, unit_id, value_type, sort_order)
SELECT 3, 'Длительность копчения', id, 'real', 1 FROM unit WHERE symbol='ч'
ON CONFLICT DO NOTHING;

INSERT INTO parameter_definition (classifier_node_id, name, unit_id, value_type, sort_order)
SELECT 3, 'Выдержка после копчения', id, 'int', 2 FROM unit WHERE symbol='сут'
ON CONFLICT DO NOTHING;

INSERT INTO parameter_definition (classifier_node_id, name, unit_id, value_type, sort_order)
VALUES (3, 'Порода древесины', NULL, 'str', 3)  -- единица не используется
ON CONFLICT DO NOTHING;

-- параметры для узла «Цельномышечное» (4)
INSERT INTO parameter_definition (classifier_node_id, name, unit_id, value_type, sort_order)
SELECT 4, 'Выдержка посола', id, 'int', 1 FROM unit WHERE symbol='сут'
ON CONFLICT DO NOTHING;

INSERT INTO parameter_definition (classifier_node_id, name, unit_id, value_type, sort_order)
SELECT 4, 'Выход продукта', id, 'real', 2 FROM unit WHERE symbol='%'
ON CONFLICT DO NOTHING;

-- Пример добавления ограничения для параметра «Диаметр батона» (должен быть от 30 до 150 мм)
INSERT INTO parameter_numeric_constraint (parameter_definition_id, min_value, max_value)
SELECT id, 30, 150 FROM parameter_definition WHERE name = 'Диаметр батона' AND classifier_node_id = 2
ON CONFLICT (parameter_definition_id) DO NOTHING;

-- Остальные физические параметры не допускают отрицательных значений.
INSERT INTO parameter_numeric_constraint (parameter_definition_id, min_value, max_value)
SELECT pd.id, limits.min_value, limits.max_value
FROM (VALUES
    ('Температура варки', 0, 100),
    ('Время варки', 0, 1440),
    ('Содержание соли', 0, 100),
    ('Длительность копчения', 0, 72),
    ('Выдержка после копчения', 0, 365),
    ('Выдержка посола', 0, 365),
    ('Выход продукта', 0, 100)
) limits(name, min_value, max_value)
JOIN parameter_definition pd ON pd.name = limits.name
ON CONFLICT (parameter_definition_id) DO UPDATE
SET min_value = EXCLUDED.min_value,
    max_value = EXCLUDED.max_value;

-- =====================================================
-- 9. Несколько примеров значений параметров для проверки наследования и агрегатов
-- =====================================================

-- Для продукта 1 (узел 12 – потомок 2): добавим численное значение параметра «Содержание соли»
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT 1, id, 2.5 FROM parameter_definition WHERE name = 'Содержание соли' AND classifier_node_id = 2
ON CONFLICT DO NOTHING;

-- Для продукта 2 (узел 12): значение «Диаметр батона»
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_int)
SELECT 2, id, 85 FROM parameter_definition WHERE name = 'Диаметр батона' AND classifier_node_id = 2
ON CONFLICT DO NOTHING;

-- Пример enum параметра: для узла 12 нет своего параметра, но наследуется? Наследуются только параметры, определённые на родителях.
-- Параметр «Температура копчения» определён на узле 3, не наследуется узлом 12 (т.к. 12 не потомок 3). Это нормально.

-- Обновим материализованное представление вручную после вставок
SELECT refresh_aggregates();

-- =====================================================
-- 10. Типы изделий
-- =====================================================

-- По отношению к производству: материал / комплектующее / продукция.
-- Продукция по структуре: деталь / сборочная единица / комплект / комплекс.
CREATE TABLE IF NOT EXISTS product_type (
    code             VARCHAR(16) PRIMARY KEY,
    name             TEXT        NOT NULL UNIQUE,
    production_role  VARCHAR(16) NOT NULL CHECK (production_role IN ('material', 'purchased', 'product')),
    can_have_bom     BOOLEAN     NOT NULL   -- материалы и комплектующие не имеют своего состава
);

INSERT INTO product_type (code, name, production_role, can_have_bom) VALUES
    ('material',  'Материал',                 'material',  FALSE),
    ('purchased', 'Комплектующее изделие',    'purchased', FALSE),
    ('part',      'Деталь',                   'product',   TRUE),
    ('assembly',  'Сборочная единица (узел)', 'product',   TRUE),
    ('kit',       'Комплект',                 'product',   TRUE),
    ('complex',   'Комплекс',                 'product',   TRUE)
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- 11. Изменения спецификации и новые поля изделия
-- =====================================================

CREATE TABLE IF NOT EXISTS bom_change (
    id           SERIAL    PRIMARY KEY,
    product_id   INTEGER   NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    change_no    INTEGER   NOT NULL,   -- порядковый номер изменения у изделия
    description  TEXT      NOT NULL,
    author       TEXT      NOT NULL DEFAULT current_user,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (product_id, change_no)
);

-- Изделие: обозначение, тип, ЕИ количества, базовое изделие (для модификаций), последнее изменение.
-- Ограничения объявлены в самих колонках: если колонка уже есть, повторно они не создаются.
ALTER TABLE product
    ADD COLUMN IF NOT EXISTS designation       VARCHAR(64) UNIQUE,
    ADD COLUMN IF NOT EXISTS product_type_code VARCHAR(16) NOT NULL DEFAULT 'part' REFERENCES product_type(code),
    ADD COLUMN IF NOT EXISTS unit_id           INTEGER     REFERENCES unit(id),
    ADD COLUMN IF NOT EXISTS base_product_id   INTEGER     REFERENCES product(id) ON DELETE RESTRICT
                                                           CONSTRAINT chk_product_not_own_base CHECK (base_product_id <> id),
    ADD COLUMN IF NOT EXISTS last_change_id    INTEGER     CONSTRAINT fk_product_last_change
                                                           REFERENCES bom_change(id) ON DELETE SET NULL;

-- Базовая ЕИ класса: в ней сводятся нормы расхода по классу
ALTER TABLE classifier_node
    ADD COLUMN IF NOT EXISTS base_unit_id INTEGER REFERENCES unit(id);

-- =====================================================
-- 12. Материальная спецификация (BOM)
-- =====================================================

-- Норма расхода = quantity / per_quantity на единицу родителя.
-- is_base (флаг базы) бывает только у модификаций: норма берётся из базового изделия.
CREATE TABLE IF NOT EXISTS bom_item (
    id                 SERIAL        PRIMARY KEY,
    parent_product_id  INTEGER       NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    component_id       INTEGER       NOT NULL REFERENCES product(id) ON DELETE RESTRICT,
    position_no        INTEGER       NOT NULL DEFAULT 0,
    quantity           NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
    per_quantity       NUMERIC(18,6) NOT NULL DEFAULT 1 CHECK (per_quantity > 0),
    unit_id            INTEGER       NOT NULL REFERENCES unit(id),
    is_base            BOOLEAN       NOT NULL DEFAULT FALSE,

    UNIQUE (parent_product_id, component_id),
    CHECK (parent_product_id <> component_id)
);

CREATE INDEX IF NOT EXISTS ix_bom_item_component ON bom_item (component_id);

-- Журнал правок состава, заполняется триггером
CREATE TABLE IF NOT EXISTS bom_change_log (
    id                 BIGSERIAL     PRIMARY KEY,
    change_id          INTEGER       REFERENCES bom_change(id) ON DELETE SET NULL,
    parent_product_id  INTEGER       NOT NULL,   -- без FK, чтобы журнал переживал удаление позиции
    component_id       INTEGER       NOT NULL,
    operation          VARCHAR(8)    NOT NULL CHECK (operation IN ('add', 'update', 'remove')),
    old_quantity       NUMERIC(18,6),
    new_quantity       NUMERIC(18,6),
    old_per_quantity   NUMERIC(18,6),
    new_per_quantity   NUMERIC(18,6),
    old_unit_id        INTEGER,
    new_unit_id        INTEGER,
    old_is_base        BOOLEAN,
    new_is_base        BOOLEAN,
    changed_by         TEXT          NOT NULL DEFAULT current_user,
    changed_at         TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_bom_change_log_parent ON bom_change_log (parent_product_id, changed_at);

-- =====================================================
-- 13. Перевод единиц и действующий состав
-- =====================================================

-- Перевод значения между ЕИ одной размерности
CREATE OR REPLACE FUNCTION unit_convert(p_value NUMERIC, p_from_unit INTEGER, p_to_unit INTEGER)
RETURNS NUMERIC AS $$
DECLARE
    v_from unit%ROWTYPE;
    v_to   unit%ROWTYPE;
BEGIN
    IF p_value IS NULL OR p_from_unit IS NULL OR p_to_unit IS NULL OR p_from_unit = p_to_unit THEN
        RETURN p_value;
    END IF;

    SELECT * INTO v_from FROM unit WHERE id = p_from_unit;
    SELECT * INTO v_to   FROM unit WHERE id = p_to_unit;

    IF v_from.dimension_id IS DISTINCT FROM v_to.dimension_id THEN
        RAISE EXCEPTION 'Нельзя перевести «%» в «%»: разные размерности', v_from.symbol, v_to.symbol;
    END IF;

    RETURN (p_value * v_from.to_base_factor + v_from.to_base_offset - v_to.to_base_offset) / v_to.to_base_factor;
END;
$$ LANGUAGE plpgsql STABLE;

-- Состав первого уровня с учётом модификаций: свои позиции + позиции с флагом базы,
-- нормы которых берутся из базового изделия (рекурсивно по цепочке баз)
CREATE OR REPLACE FUNCTION bom_effective(p_product_id INTEGER)
RETURNS TABLE (
    bom_item_id   INTEGER,
    component_id  INTEGER,
    position_no   INTEGER,
    quantity      NUMERIC,
    per_quantity  NUMERIC,
    unit_id       INTEGER,
    is_base       BOOLEAN
) AS $$
#variable_conflict use_column
DECLARE
    v_base INTEGER;
BEGIN
    SELECT p.base_product_id INTO v_base FROM product p WHERE p.id = p_product_id;

    RETURN QUERY
    SELECT b.id, b.component_id, b.position_no, b.quantity::NUMERIC, b.per_quantity::NUMERIC, b.unit_id, FALSE
    FROM bom_item b
    WHERE b.parent_product_id = p_product_id AND NOT b.is_base;

    IF v_base IS NOT NULL THEN
        RETURN QUERY
        SELECT own.id, base.component_id, own.position_no, base.quantity, base.per_quantity, base.unit_id, TRUE
        FROM bom_item own
        JOIN bom_effective(v_base) base ON base.component_id = own.component_id
        WHERE own.parent_product_id = p_product_id AND own.is_base;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- 14. Триггеры спецификации
-- =====================================================

-- Проверка позиции: тип родителя, размерность ЕИ, флаг базы, отсутствие циклов
CREATE OR REPLACE FUNCTION check_bom_item()
RETURNS TRIGGER AS $$
DECLARE
    v_parent_type     product_type%ROWTYPE;
    v_base            INTEGER;
    v_component_unit  INTEGER;
BEGIN
    SELECT pt.* INTO v_parent_type
    FROM product p
    JOIN product_type pt ON pt.code = p.product_type_code
    WHERE p.id = NEW.parent_product_id;

    IF NOT v_parent_type.can_have_bom THEN
        RAISE EXCEPTION 'Изделие типа «%» не может иметь состав', v_parent_type.name;
    END IF;

    SELECT unit_id INTO v_component_unit FROM product WHERE id = NEW.component_id;

    IF v_component_unit IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM unit a
        JOIN unit b ON a.dimension_id = b.dimension_id
        WHERE a.id = NEW.unit_id AND b.id = v_component_unit
    ) THEN
        RAISE EXCEPTION 'ЕИ нормы (unit_id=%) не совпадает по размерности с ЕИ компонента (unit_id=%)',
                        NEW.unit_id, v_component_unit;
    END IF;

    -- Отредактированная унаследованная позиция становится собственной
    IF TG_OP = 'UPDATE' AND OLD.is_base AND NEW.is_base
       AND (NEW.quantity, NEW.per_quantity, NEW.unit_id) IS DISTINCT FROM (OLD.quantity, OLD.per_quantity, OLD.unit_id) THEN
        NEW.is_base := FALSE;
    END IF;

    IF NEW.is_base THEN
        SELECT base_product_id INTO v_base FROM product WHERE id = NEW.parent_product_id;

        IF v_base IS NULL THEN
            RAISE EXCEPTION 'Флаг базы допустим только у модификаций (изделие % не имеет базового)', NEW.parent_product_id;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM bom_effective(v_base) e WHERE e.component_id = NEW.component_id) THEN
            RAISE EXCEPTION 'Компонент % отсутствует в спецификации базового изделия %', NEW.component_id, v_base;
        END IF;
    END IF;

    -- Родитель не должен входить в состав компонента на любой глубине
    IF EXISTS (
        WITH RECURSIVE sub AS (
            SELECT NEW.component_id AS id

            UNION

            SELECT b.component_id
            FROM bom_item b
            JOIN sub ON b.parent_product_id = sub.id
        )
        SELECT 1 FROM sub WHERE id = NEW.parent_product_id
    ) THEN
        RAISE EXCEPTION 'Изделие % уже входит в состав компонента % — получится цикл',
                        NEW.parent_product_id, NEW.component_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_check_bom_item
BEFORE INSERT OR UPDATE ON bom_item
FOR EACH ROW
EXECUTE FUNCTION check_bom_item();

-- Проверка изделия: тип без состава и замкнутая цепочка базовых изделий
CREATE OR REPLACE FUNCTION check_product_bom_rules()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT (SELECT can_have_bom FROM product_type WHERE code = NEW.product_type_code)
       AND EXISTS (SELECT 1 FROM bom_item WHERE parent_product_id = NEW.id) THEN
        RAISE EXCEPTION 'Изделие % имеет состав, тип «%» недопустим', NEW.id, NEW.product_type_code;
    END IF;

    IF NEW.base_product_id IS NOT NULL AND EXISTS (
        WITH RECURSIVE chain AS (
            SELECT NEW.base_product_id AS id

            UNION

            SELECT p.base_product_id
            FROM product p
            JOIN chain c ON p.id = c.id
            WHERE p.base_product_id IS NOT NULL
        )
        SELECT 1 FROM chain WHERE id = NEW.id
    ) THEN
        RAISE EXCEPTION 'Изделие % не может быть модификацией своей же модификации', NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_check_product_bom_rules
BEFORE INSERT OR UPDATE OF product_type_code, base_product_id ON product
FOR EACH ROW
EXECUTE FUNCTION check_product_bom_rules();

-- Позицию убрали из базового изделия — убираем её унаследованные копии у модификаций
CREATE OR REPLACE FUNCTION propagate_bom_delete_to_modifications()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM bom_item b
    USING product m
    WHERE m.base_product_id = OLD.parent_product_id
      AND b.parent_product_id = m.id
      AND b.component_id = OLD.component_id
      AND b.is_base;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_propagate_bom_delete
AFTER DELETE ON bom_item
FOR EACH ROW
EXECUTE FUNCTION propagate_bom_delete_to_modifications();

-- Журналирование правок; изменение берётся из bom.change_id (его ставит register_change)
CREATE OR REPLACE FUNCTION log_bom_change()
RETURNS TRIGGER AS $$
DECLARE
    v_row        bom_item%ROWTYPE;
    v_change_id  INTEGER;
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

    SELECT id INTO v_change_id
    FROM bom_change
    WHERE id = NULLIF(current_setting('bom.change_id', TRUE), '')::INTEGER
      AND product_id = v_row.parent_product_id;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO bom_change_log (change_id, parent_product_id, component_id, operation,
                                    new_quantity, new_per_quantity, new_unit_id, new_is_base)
        VALUES (v_change_id, NEW.parent_product_id, NEW.component_id, 'add',
                NEW.quantity, NEW.per_quantity, NEW.unit_id, NEW.is_base);
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO bom_change_log (change_id, parent_product_id, component_id, operation,
                                    old_quantity, new_quantity, old_per_quantity, new_per_quantity,
                                    old_unit_id, new_unit_id, old_is_base, new_is_base)
        VALUES (v_change_id, NEW.parent_product_id, NEW.component_id, 'update',
                OLD.quantity, NEW.quantity, OLD.per_quantity, NEW.per_quantity,
                OLD.unit_id, NEW.unit_id, OLD.is_base, NEW.is_base);
    ELSE
        INSERT INTO bom_change_log (change_id, parent_product_id, component_id, operation,
                                    old_quantity, old_per_quantity, old_unit_id, old_is_base)
        VALUES (v_change_id, OLD.parent_product_id, OLD.component_id, 'remove',
                OLD.quantity, OLD.per_quantity, OLD.unit_id, OLD.is_base);
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_log_bom_change
AFTER INSERT OR UPDATE OR DELETE ON bom_item
FOR EACH ROW
EXECUTE FUNCTION log_bom_change();

-- =====================================================
-- 15. Процедуры бизнес-логики
-- =====================================================

-- REGISTER_CHANGE: регистрирует изменение и делает его текущим для сеанса,
-- последующие правки состава этого изделия попадут в журнал с этим изменением
CREATE OR REPLACE FUNCTION register_change(p_id_prod INTEGER, p_change_desc TEXT)
RETURNS INTEGER AS $$
DECLARE
    v_id INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM product WHERE id = p_id_prod) THEN
        RAISE EXCEPTION 'Нет изделия %', p_id_prod;
    END IF;

    IF COALESCE(TRIM(p_change_desc), '') = '' THEN
        RAISE EXCEPTION 'Нужно описание изменения';
    END IF;

    INSERT INTO bom_change (product_id, change_no, description)
    VALUES (
        p_id_prod,
        (SELECT COALESCE(MAX(change_no), 0) + 1 FROM bom_change WHERE product_id = p_id_prod),
        p_change_desc
    )
    RETURNING id INTO v_id;

    UPDATE product SET last_change_id = v_id WHERE id = p_id_prod;
    PERFORM set_config('bom.change_id', v_id::TEXT, FALSE);

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- CREATE_MODIFICATION: новое изделие на основе базового,
-- базовая спецификация копируется с флагом базы
CREATE OR REPLACE FUNCTION create_modification(p_id_base INTEGER, p_name VARCHAR, p_designation VARCHAR DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
    v_base  product%ROWTYPE;
    v_id    INTEGER;
BEGIN
    SELECT * INTO v_base FROM product WHERE id = p_id_base;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Нет базового изделия %', p_id_base;
    END IF;

    INSERT INTO product (classifier_node_id, sku, name, price, supplier, weight_gram,
                         designation, product_type_code, unit_id, base_product_id)
    VALUES (v_base.classifier_node_id, NULL, p_name, v_base.price, v_base.supplier, v_base.weight_gram,
            p_designation, v_base.product_type_code, v_base.unit_id, p_id_base)
    RETURNING id INTO v_id;

    PERFORM register_change(v_id, format('Создана модификация изделия %s «%s»', p_id_base, v_base.name));

    INSERT INTO bom_item (parent_product_id, component_id, position_no, quantity, per_quantity, unit_id, is_base)
    SELECT v_id, e.component_id, e.position_no, e.quantity, e.per_quantity, e.unit_id, TRUE
    FROM bom_effective(p_id_base) e;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- FIND_BOM: дерево состава на всю глубину.
-- norm — норма на единицу родителя, total_quantity — расход на 1 изделие верхнего уровня в ЕИ компонента
CREATE OR REPLACE FUNCTION find_bom(p_id_prod INTEGER)
RETURNS TABLE (
    lvl                INTEGER,
    parent_product_id  INTEGER,
    component_id       INTEGER,
    designation        VARCHAR,
    name               TEXT,
    product_type_code  VARCHAR,
    classifier_node_id INTEGER,
    norm               NUMERIC,
    norm_unit          VARCHAR,
    total_quantity     NUMERIC,
    total_unit_id      INTEGER,
    total_unit         VARCHAR,
    is_base            BOOLEAN,
    path               INTEGER[]
) AS $$
    WITH RECURSIVE tree AS (
        -- Базовый случай: состав самого изделия
        SELECT
            1 AS lvl,
            p_id_prod AS parent_product_id,
            e.component_id,
            e.quantity / e.per_quantity AS norm,
            e.unit_id AS norm_unit_id,
            unit_convert(e.quantity / e.per_quantity, e.unit_id, COALESCE(c.unit_id, e.unit_id)) AS total_quantity,
            COALESCE(c.unit_id, e.unit_id) AS total_unit_id,
            e.is_base,
            ARRAY[p_id_prod, e.component_id] AS path,
            ARRAY[e.position_no, e.component_id] AS sort_key
        FROM bom_effective(p_id_prod) e
        JOIN product c ON c.id = e.component_id

        UNION ALL

        -- Спускаемся в состав компонентов
        SELECT
            t.lvl + 1,
            t.component_id,
            e.component_id,
            e.quantity / e.per_quantity,
            e.unit_id,
            t.total_quantity * unit_convert(e.quantity / e.per_quantity, e.unit_id, COALESCE(c.unit_id, e.unit_id)),
            COALESCE(c.unit_id, e.unit_id),
            e.is_base,
            t.path || e.component_id,
            t.sort_key || ARRAY[e.position_no, e.component_id]
        FROM tree t
        CROSS JOIN LATERAL bom_effective(t.component_id) e
        JOIN product c ON c.id = e.component_id
        WHERE e.component_id <> ALL (t.path)
    )
    SELECT
        t.lvl,
        t.parent_product_id,
        t.component_id,
        c.designation,
        c.name,
        c.product_type_code,
        c.classifier_node_id,
        trim_scale(t.norm),
        nu.symbol,
        trim_scale(t.total_quantity),
        t.total_unit_id,
        tu.symbol,
        t.is_base,
        t.path
    FROM tree t
    JOIN product c  ON c.id  = t.component_id
    JOIN unit    nu ON nu.id = t.norm_unit_id
    JOIN unit    tu ON tu.id = t.total_unit_id
    ORDER BY t.sort_key;
$$ LANGUAGE sql STABLE;

-- CALC_BOM: сводные нормы расхода на p_q изделий.
-- p_id_class = NULL — все ресурсы нижнего уровня, иначе — компоненты класса и его подклассов
CREATE OR REPLACE FUNCTION calc_bom(p_id_prod INTEGER, p_q DOUBLE PRECISION DEFAULT 1, p_id_class INTEGER DEFAULT NULL)
RETURNS TABLE (
    component_id       INTEGER,
    designation        VARCHAR,
    name               TEXT,
    classifier_node_id INTEGER,
    class_name         TEXT,
    product_type_code  VARCHAR,
    total_quantity     NUMERIC,
    unit               VARCHAR,
    total_cost         NUMERIC
) AS $$
    WITH RECURSIVE class_tree AS (
        SELECT id FROM classifier_node WHERE id = p_id_class

        UNION ALL

        SELECT cn.id
        FROM classifier_node cn
        JOIN class_tree ct ON cn.parent_id = ct.id
    )
    SELECT
        f.component_id,
        f.designation,
        f.name,
        f.classifier_node_id,
        cn.name,
        f.product_type_code,
        trim_scale(SUM(f.total_quantity) * p_q::NUMERIC),
        f.total_unit,
        ROUND(SUM(f.total_quantity) * p_q::NUMERIC * c.price, 2)   -- цена за ЕИ количества изделия
    FROM find_bom(p_id_prod) f
    JOIN product c          ON c.id  = f.component_id
    JOIN classifier_node cn ON cn.id = f.classifier_node_id
    WHERE CASE
        WHEN p_id_class IS NULL THEN NOT EXISTS (SELECT 1 FROM bom_effective(f.component_id))
        ELSE f.classifier_node_id IN (SELECT id FROM class_tree)
    END
    GROUP BY f.component_id, f.designation, f.name, f.classifier_node_id, cn.name,
             f.product_type_code, f.total_unit, c.price
    ORDER BY cn.name, f.name;
$$ LANGUAGE sql STABLE;

-- Сводные нормы по классам ресурсов; количество приводится к базовой ЕИ класса, если она подходит
CREATE OR REPLACE FUNCTION calc_bom_by_class(p_id_prod INTEGER, p_q DOUBLE PRECISION DEFAULT 1)
RETURNS TABLE (
    classifier_node_id INTEGER,
    class_name         TEXT,
    total_quantity     NUMERIC,
    unit               VARCHAR,
    total_cost         NUMERIC
) AS $$
    SELECT
        r.classifier_node_id,
        r.class_name,
        trim_scale(SUM(unit_convert(r.total_quantity, u.id, COALESCE(bu.id, u.id)))),
        COALESCE(bu.symbol, u.symbol),
        SUM(r.total_cost)
    FROM calc_bom(p_id_prod, p_q) r
    JOIN unit u             ON u.symbol = r.unit
    JOIN classifier_node cn ON cn.id = r.classifier_node_id
    LEFT JOIN unit bu       ON bu.id = cn.base_unit_id AND bu.dimension_id = u.dimension_id
    GROUP BY r.classifier_node_id, r.class_name, COALESCE(bu.symbol, u.symbol)
    ORDER BY r.class_name;
$$ LANGUAGE sql STABLE;

-- =====================================================
-- 16. Пример спецификации: фарш, колбаса, набор, модификация
-- =====================================================

INSERT INTO unit (dimension_id, name, symbol, to_base_factor, to_base_offset) VALUES
    (1, 'тонна', 'т', 1000000, 0),
    (2, 'метр',  'м', 1000,    0)
ON CONFLICT DO NOTHING;

INSERT INTO classifier_node (id, parent_id, name, unit, sort_order) VALUES
(21, NULL, 'Сырьё и материалы',  'кг', 10),
(22, 21, 'Мясное сырьё',  'кг', 1),
(23, 21, 'Специи и добавки',  'кг', 2),
(24, 21, 'Оболочка и упаковка',  NULL, 3),
(25, NULL, 'Полуфабрикаты',  'кг', 11),
(26, NULL, 'Наборы',  'шт', 12)
ON CONFLICT DO NOTHING;

UPDATE classifier_node SET base_unit_id = (SELECT id FROM unit WHERE symbol = 'кг')
WHERE id IN (21, 22, 23, 25) AND base_unit_id IS NULL;

INSERT INTO product (id, classifier_node_id, sku, name, price, supplier, weight_gram, designation, product_type_code, unit_id) VALUES
(7, 22, NULL, 'Говядина жилованная высшего сорта', 650, 'ООО «Мираторг»', 1000, 'СР-01.001', 'material', (SELECT id FROM unit WHERE symbol = 'кг')),
(8, 22, NULL, 'Свинина жилованная полужирная', 420, 'ООО «Мираторг»', 1000, 'СР-01.002', 'material', (SELECT id FROM unit WHERE symbol = 'кг')),
(9, 23, NULL, 'Молоко сухое обезжиренное', 310, 'АО «Молочный союз»', 1000, 'СР-02.001', 'material', (SELECT id FROM unit WHERE symbol = 'кг')),
(10, 23, NULL, 'Соль нитритная', 60, 'ООО «Галит»', 1000, 'СР-02.002', 'material', (SELECT id FROM unit WHERE symbol = 'кг')),
(11, 23, NULL, 'Мускатный орех молотый', 2400, 'ООО «Пряности»', 1000, 'СР-02.003', 'material', (SELECT id FROM unit WHERE symbol = 'кг')),
(12, 24, NULL, 'Оболочка полиамидная Ø60', 35, 'ООО «Атлантис-Пак»', 20, 'УП-01.001', 'purchased', (SELECT id FROM unit WHERE symbol = 'м')),
(13, 24, NULL, 'Клипса алюминиевая', 1, 'ООО «Поли-клип»', 1, 'УП-01.002', 'purchased', (SELECT id FROM unit WHERE symbol = 'шт')),
(14, 25, NULL, 'Фарш «Докторский»', 0, 'Собственное производство', 1000, 'ПФ-01.001', 'part', (SELECT id FROM unit WHERE symbol = 'кг')),
(15, 26, NULL, 'Набор «Мясная классика»', 1100, 'Собственное производство', 1150, 'НБ-01.001', 'kit', (SELECT id FROM unit WHERE symbol = 'шт'))
ON CONFLICT DO NOTHING;

SELECT sync_id_sequences();

-- Готовые колбасы учитываются в штуках, докторская — сборочная единица (фарш + оболочка + клипсы)
UPDATE product SET unit_id = (SELECT id FROM unit WHERE symbol = 'шт') WHERE id BETWEEN 1 AND 6 AND unit_id IS NULL;
UPDATE product SET product_type_code = 'assembly', designation = 'КЛ-01.001' WHERE id = 1 AND designation IS NULL;

DO $$
DECLARE
    v_mod INTEGER;
BEGIN
    -- Пример уже загружен
    IF EXISTS (SELECT 1 FROM bom_item WHERE parent_product_id IN (1, 14, 15)) THEN
        RETURN;
    END IF;

    -- Рецептура фарша на 100 кг
    PERFORM register_change(14, 'Утверждена рецептура фарша «Докторский»');
    INSERT INTO bom_item (parent_product_id, component_id, position_no, quantity, per_quantity, unit_id) VALUES
        (14, 7,  1, 25,   100, (SELECT id FROM unit WHERE symbol = 'кг')),
        (14, 8,  2, 70,   100, (SELECT id FROM unit WHERE symbol = 'кг')),
        (14, 9,  3, 2,    100, (SELECT id FROM unit WHERE symbol = 'кг')),
        (14, 10, 4, 2100, 100, (SELECT id FROM unit WHERE symbol = 'г')),
        (14, 11, 5, 50,   100, (SELECT id FROM unit WHERE symbol = 'г'));

    -- Батон 400 г: фарш с учётом потерь, оболочка, 2 клипсы
    PERFORM register_change(1, 'Утверждена спецификация батона 400 г');
    INSERT INTO bom_item (parent_product_id, component_id, position_no, quantity, per_quantity, unit_id) VALUES
        (1, 14, 1, 440, 1, (SELECT id FROM unit WHERE symbol = 'г')),
        (1, 12, 2, 32,  1, (SELECT id FROM unit WHERE symbol = 'см')),
        (1, 13, 3, 2,   1, (SELECT id FROM unit WHERE symbol = 'шт'));

    PERFORM register_change(15, 'Утверждён состав набора');
    INSERT INTO bom_item (parent_product_id, component_id, position_no, quantity, per_quantity, unit_id) VALUES
        (15, 1, 1, 2, 1, (SELECT id FROM unit WHERE symbol = 'шт')),
        (15, 4, 2, 1, 1, (SELECT id FROM unit WHERE symbol = 'шт'));

    -- Модификация: батон 800 г, фарш и оболочка свои, клипсы наследуются из базы
    v_mod := create_modification(1, 'Колбаса докторская Клинская 800 г', 'КЛ-01.001-01');
    PERFORM register_change(v_mod, 'Батон 800 г: увеличены нормы фарша и оболочки');
    UPDATE bom_item SET quantity = 880 WHERE parent_product_id = v_mod AND component_id = 14;
    UPDATE bom_item SET quantity = 55  WHERE parent_product_id = v_mod AND component_id = 12;
    UPDATE product SET weight_gram = 800, price = 960 WHERE id = v_mod;

    PERFORM set_config('bom.change_id', '', FALSE);
END;
$$;

-- =====================================================
-- 17. Дополнительные реалистичные данные по колбасным изделиям
-- =====================================================

-- Эти параметры определены на корневой категории 1 и поэтому
-- наследуются только товарами из ветки «Колбасное изделие».
INSERT INTO parameter_definition (classifier_node_id, name, unit_id, value_type, sort_order)
SELECT 1, v.name, u.id, v.value_type, v.sort_order
FROM (VALUES
    ('Массовая доля белка', 'real', 5),
    ('Массовая доля жира', 'real', 6),
    ('Срок годности', 'int', 7),
    ('Температура хранения', 'real', 8)
) v(name, value_type, sort_order)
JOIN unit u ON u.symbol = CASE
    WHEN v.name IN ('Массовая доля белка', 'Массовая доля жира') THEN '%'
    WHEN v.name = 'Срок годности' THEN 'сут'
    ELSE '°C'
END
ON CONFLICT (classifier_node_id, name) DO UPDATE
SET unit_id = EXCLUDED.unit_id,
    value_type = EXCLUDED.value_type,
    sort_order = EXCLUDED.sort_order;

INSERT INTO parameter_numeric_constraint (parameter_definition_id, min_value, max_value)
SELECT pd.id, v.min_value, v.max_value
FROM (VALUES
    ('Массовая доля белка', 5, 25),
    ('Массовая доля жира', 5, 50),
    ('Срок годности', 1, 60),
    ('Температура хранения', -5, 8)
) v(name, min_value, max_value)
JOIN parameter_definition pd
  ON pd.classifier_node_id = 1 AND pd.name = v.name
ON CONFLICT (parameter_definition_id) DO UPDATE
SET min_value = EXCLUDED.min_value,
    max_value = EXCLUDED.max_value;

-- Температура и время варки, диаметр батона и содержание соли
-- заданы для всех товаров этой ветки, включая модификацию 800 г.
INSERT INTO product_parameter_value (
    product_id, parameter_definition_id, value_int, value_real
)
SELECT p.id, pd.id, v.value_int, v.value_real
FROM (VALUES
    (1, 'Температура варки', NULL::INTEGER, 72.0::NUMERIC),
    (1, 'Время варки', 90, NULL::NUMERIC),
    (1, 'Диаметр батона', NULL::INTEGER, 65.0::NUMERIC),
    (1, 'Содержание соли', NULL::INTEGER, 2.5::NUMERIC),
    (2, 'Температура варки', NULL::INTEGER, 72.0::NUMERIC),
    (2, 'Время варки', 90, NULL::NUMERIC),
    (2, 'Диаметр батона', NULL::INTEGER, 85.0::NUMERIC),
    (2, 'Содержание соли', NULL::INTEGER, 2.3::NUMERIC),
    (3, 'Температура варки', NULL::INTEGER, 72.0::NUMERIC),
    (3, 'Время варки', 80, NULL::NUMERIC),
    (3, 'Диаметр батона', NULL::INTEGER, 65.0::NUMERIC),
    (3, 'Содержание соли', NULL::INTEGER, 2.5::NUMERIC),
    (4, 'Температура варки', NULL::INTEGER, 75.0::NUMERIC),
    (4, 'Время варки', 60, NULL::NUMERIC),
    (4, 'Диаметр батона', NULL::INTEGER, 60.0::NUMERIC),
    (4, 'Содержание соли', NULL::INTEGER, 2.2::NUMERIC),
    (5, 'Температура варки', NULL::INTEGER, 75.0::NUMERIC),
    (5, 'Время варки', 60, NULL::NUMERIC),
    (5, 'Диаметр батона', NULL::INTEGER, 60.0::NUMERIC),
    (5, 'Содержание соли', NULL::INTEGER, 2.4::NUMERIC),
    (6, 'Температура варки', NULL::INTEGER, 75.0::NUMERIC),
    (6, 'Время варки', 65, NULL::NUMERIC),
    (6, 'Диаметр батона', NULL::INTEGER, 60.0::NUMERIC),
    (6, 'Содержание соли', NULL::INTEGER, 2.4::NUMERIC),
    (16, 'Температура варки', NULL::INTEGER, 72.0::NUMERIC),
    (16, 'Время варки', 105, NULL::NUMERIC),
    (16, 'Диаметр батона', NULL::INTEGER, 65.0::NUMERIC),
    (16, 'Содержание соли', NULL::INTEGER, 2.5::NUMERIC)
) v(product_id, name, value_int, value_real)
JOIN product p ON p.id = v.product_id
JOIN parameter_definition pd
  ON pd.classifier_node_id = 2 AND pd.name = v.name
ON CONFLICT (product_id, parameter_definition_id) DO UPDATE
SET value_int = EXCLUDED.value_int,
    value_real = EXCLUDED.value_real,
    value_str = NULL,
    value_enum_id = NULL;

-- Общие для ветки характеристики состава, срока хранения и хранения.
INSERT INTO product_parameter_value (
    product_id, parameter_definition_id, value_int, value_real
)
SELECT p.id, pd.id, v.value_int, v.value_real
FROM (VALUES
    (1, 'Массовая доля белка', NULL::INTEGER, 12.5::NUMERIC),
    (1, 'Массовая доля жира', NULL::INTEGER, 22.0::NUMERIC),
    (1, 'Срок годности', 20, NULL::NUMERIC),
    (1, 'Температура хранения', NULL::INTEGER, 2.0::NUMERIC),
    (2, 'Массовая доля белка', NULL::INTEGER, 12.0::NUMERIC),
    (2, 'Массовая доля жира', NULL::INTEGER, 22.0::NUMERIC),
    (2, 'Срок годности', 30, NULL::NUMERIC),
    (2, 'Температура хранения', NULL::INTEGER, 2.0::NUMERIC),
    (3, 'Массовая доля белка', NULL::INTEGER, 11.0::NUMERIC),
    (3, 'Массовая доля жира', NULL::INTEGER, 28.0::NUMERIC),
    (3, 'Срок годности', 20, NULL::NUMERIC),
    (3, 'Температура хранения', NULL::INTEGER, 2.0::NUMERIC),
    (4, 'Массовая доля белка', NULL::INTEGER, 8.0::NUMERIC),
    (4, 'Массовая доля жира', NULL::INTEGER, 22.0::NUMERIC),
    (4, 'Срок годности', 7, NULL::NUMERIC),
    (4, 'Температура хранения', NULL::INTEGER, 2.0::NUMERIC),
    (5, 'Массовая доля белка', NULL::INTEGER, 8.5::NUMERIC),
    (5, 'Массовая доля жира', NULL::INTEGER, 25.0::NUMERIC),
    (5, 'Срок годности', 10, NULL::NUMERIC),
    (5, 'Температура хранения', NULL::INTEGER, 2.0::NUMERIC),
    (6, 'Массовая доля белка', NULL::INTEGER, 9.0::NUMERIC),
    (6, 'Массовая доля жира', NULL::INTEGER, 24.0::NUMERIC),
    (6, 'Срок годности', 10, NULL::NUMERIC),
    (6, 'Температура хранения', NULL::INTEGER, 2.0::NUMERIC),
    (16, 'Массовая доля белка', NULL::INTEGER, 12.5::NUMERIC),
    (16, 'Массовая доля жира', NULL::INTEGER, 22.0::NUMERIC),
    (16, 'Срок годности', 20, NULL::NUMERIC),
    (16, 'Температура хранения', NULL::INTEGER, 2.0::NUMERIC)
) v(product_id, name, value_int, value_real)
JOIN product p ON p.id = v.product_id
JOIN parameter_definition pd
  ON pd.classifier_node_id = 1 AND pd.name = v.name
ON CONFLICT (product_id, parameter_definition_id) DO UPDATE
SET value_int = EXCLUDED.value_int,
    value_real = EXCLUDED.value_real,
    value_str = NULL,
    value_enum_id = NULL;

-- Характеристики: структура продукта и тип оболочки.
INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT v.product_id, ev.id
FROM (VALUES
    (1, 1, 'Гомогенная'), (2, 1, 'Гомогенная'), (3, 1, 'Со шпиком'),
    (4, 1, 'С кусочками'), (5, 1, 'Гомогенная'), (6, 1, 'Гомогенная'),
    (1, 3, 'Целлофан'), (2, 3, 'Целлофан'), (3, 3, 'Целлофан'),
    (4, 3, 'Натуральная'), (5, 3, 'Белок'), (6, 3, 'Натуральная'),
    (16, 1, 'Гомогенная'), (16, 3, 'Целлофан')
) v(product_id, enum_definition_id, value_str)
JOIN enum_value ev
  ON ev.enum_definition_id = v.enum_definition_id
 AND ev.value_str = v.value_str
WHERE NOT EXISTS (
    SELECT 1
    FROM product_attribute_value pav
    WHERE pav.product_id = v.product_id
      AND pav.enum_value_id = ev.id
);

-- Обновим материализованное представление после вставок
SELECT refresh_aggregates();

-- =====================================================
-- 18. Расширенный каталог колбасных изделий
-- =====================================================

-- В каждой конечной категории колбас добавлено не менее пяти изделий.
INSERT INTO product (
    id, classifier_node_id, sku, name, price, supplier, weight_gram,
    designation, product_type_code, unit_id
) VALUES
    (17, 12, 'Докторская ГОСТ категория А', 'Колбаса докторская ГОСТ', 520, 'ОАО «Мясокомбинат Клинский»', 500, 'КЛ-01.002', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (18, 12, 'Молочная варёная', 'Колбаса молочная', 390, 'ООО «Мясной стандарт»', 500, 'КЛ-01.003', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (19, 13, 'Сосиски сливочные', 'Сосиски сливочные', 360, 'ООО «Мясной стандарт»', 400, 'СО-01.001', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (20, 13, 'Сардельки говяжьи', 'Сардельки говяжьи', 440, 'АО «Велес»', 500, 'СО-01.002', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (21, 13, 'Сосиски молочные', 'Сосиски молочные', 330, 'ООО «Ромашка»', 350, 'СО-01.003', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (22, 13, 'Сардельки свиные', 'Сардельки свиные', 410, 'ООО «Мясной стандарт»', 500, 'СО-01.004', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (23, 13, 'Сосиски венские', 'Сосиски венские', 470, 'АО «Велес»', 400, 'СО-01.005', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (24, 14, 'Зельц белый', 'Зельц белый', 310, 'ООО «Традиция»', 400, 'ЗЛ-01.001', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (25, 14, 'Зельц красный', 'Зельц красный', 340, 'ООО «Традиция»', 400, 'ЗЛ-01.002', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (26, 14, 'Зельц домашний', 'Зельц домашний', 390, 'ИП «Мясной двор»', 500, 'ЗЛ-01.003', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (27, 14, 'Зельц с языком', 'Зельц с языком', 520, 'ООО «Традиция»', 400, 'ЗЛ-01.004', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (28, 14, 'Зельц свиной', 'Зельц свиной', 360, 'ИП «Мясной двор»', 500, 'ЗЛ-01.005', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (29, 15, 'Ливерная нежная', 'Колбаса ливерная нежная', 125, 'ООО «Традиция»', 300, 'ЛВ-01.004', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (30, 15, 'Ливерная печёночная ГОСТ', 'Колбаса ливерная печёночная ГОСТ', 145, 'АО «Велес»', 300, 'ЛВ-01.005', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (31, 16, 'Паштет печёночный', 'Паштет печёночный', 180, 'ООО «Традиция»', 250, 'ПШ-01.001', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (32, 16, 'Паштет сливочный', 'Паштет сливочный', 220, 'ООО «Ромашка»', 250, 'ПШ-01.002', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (33, 16, 'Паштет домашний', 'Паштет домашний', 260, 'ИП «Мясной двор»', 300, 'ПШ-01.003', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (34, 16, 'Паштет с грибами', 'Паштет с грибами', 290, 'ООО «Традиция»', 250, 'ПШ-01.004', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (35, 16, 'Паштет куриный', 'Паштет куриный', 210, 'ООО «Ромашка»', 250, 'ПШ-01.005', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (36, 17, 'Салями классическая', 'Салями классическая', 720, 'АО «Мясной край»', 300, 'СЛ-01.001', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (37, 17, 'Салями миланская', 'Салями миланская', 890, 'АО «Мясной край»', 300, 'СЛ-01.002', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (38, 17, 'Салями охотничья', 'Салями охотничья', 650, 'ООО «Дымовское»', 250, 'СЛ-01.003', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (39, 17, 'Салями венгерская', 'Салями венгерская', 940, 'ООО «Дымовское»', 300, 'СЛ-01.004', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (40, 17, 'Салями сырокопчёная', 'Салями сырокопчёная', 860, 'АО «Мясной край»', 300, 'СЛ-01.005', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (41, 18, 'Чоризо классическая', 'Чоризо классическая', 980, 'ООО «Дымовское»', 300, 'ЧР-01.001', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (42, 18, 'Чоризо острая', 'Чоризо острая', 1020, 'ООО «Дымовское»', 300, 'ЧР-01.002', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (43, 18, 'Чоризо с паприкой', 'Чоризо с паприкой', 1090, 'АО «Мясной край»', 300, 'ЧР-01.003', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (44, 18, 'Чоризо деревенская', 'Чоризо деревенская', 930, 'ООО «Копчёности»', 350, 'ЧР-01.004', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (45, 18, 'Чоризо мини', 'Чоризо мини', 760, 'ООО «Копчёности»', 250, 'ЧР-01.005', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (46, 19, 'Ветчина классическая', 'Ветчина классическая', 680, 'АО «Мясной край»', 500, 'ВТ-01.001', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (47, 19, 'Ветчина с пряностями', 'Ветчина с пряностями', 740, 'ООО «Мясной стандарт»', 500, 'ВТ-01.002', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (48, 19, 'Ветчина куриная', 'Ветчина куриная', 590, 'ООО «Ромашка»', 450, 'ВТ-01.003', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (49, 19, 'Ветчина запечённая', 'Ветчина запечённая', 820, 'АО «Мясной край»', 500, 'ВТ-01.004', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (50, 19, 'Ветчина с сыром', 'Ветчина с сыром', 790, 'ООО «Мясной стандарт»', 450, 'ВТ-01.005', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (51, 20, 'Карбонат классический', 'Карбонат классический', 760, 'АО «Мясной край»', 500, 'КБ-01.001', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (52, 20, 'Карбонат копчёный', 'Карбонат копчёный', 820, 'ООО «Дымовское»', 500, 'КБ-01.002', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (53, 20, 'Карбонат с чесноком', 'Карбонат с чесноком', 790, 'ООО «Копчёности»', 450, 'КБ-01.003', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (54, 20, 'Карбонат праздничный', 'Карбонат праздничный', 880, 'АО «Мясной край»', 500, 'КБ-01.004', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (55, 20, 'Карбонат фермерский', 'Карбонат фермерский', 720, 'ИП «Мясной двор»', 450, 'КБ-01.005', 'part', (SELECT id FROM unit WHERE symbol = 'шт'))
ON CONFLICT (id) DO UPDATE SET
    classifier_node_id = EXCLUDED.classifier_node_id,
    sku = EXCLUDED.sku,
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    supplier = EXCLUDED.supplier,
    weight_gram = EXCLUDED.weight_gram,
    designation = EXCLUDED.designation,
    product_type_code = EXCLUDED.product_type_code,
    unit_id = EXCLUDED.unit_id;

SELECT sync_id_sequences();

-- Параметры для сырья, материалов, полуфабрикатов и наборов.
INSERT INTO parameter_definition (classifier_node_id, name, unit_id, value_type, sort_order)
SELECT v.classifier_node_id, v.name, u.id, v.value_type, v.sort_order
FROM (VALUES
    (21, 'Массовая доля влаги', '%', 'real', 1),
    (21, 'Срок хранения', 'сут', 'int', 2),
    (21, 'Температура хранения', '°C', 'real', 3),
    (24, 'Длина единицы', 'м', 'real', 1),
    (24, 'Количество в упаковке', 'шт', 'int', 2),
    (25, 'Выход полуфабриката', '%', 'real', 1),
    (25, 'Срок хранения', 'сут', 'int', 2),
    (26, 'Количество изделий', 'шт', 'int', 1),
    (26, 'Масса набора', 'кг', 'real', 2)
) v(classifier_node_id, name, symbol, value_type, sort_order)
JOIN unit u ON u.symbol = v.symbol
ON CONFLICT (classifier_node_id, name) DO UPDATE SET
    unit_id = EXCLUDED.unit_id,
    value_type = EXCLUDED.value_type,
    sort_order = EXCLUDED.sort_order;

INSERT INTO enum_definition (classifier_node_id, description) VALUES
    (21, 'Вид сырья'),
    (24, 'Тип упаковки'),
    (25, 'Тип полуфабриката'),
    (26, 'Комплектация набора')
ON CONFLICT (classifier_node_id) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO enum_value (enum_definition_id, value_str, sort_order)
SELECT ed.id, v.value_str, v.sort_order
FROM enum_definition ed
JOIN (VALUES
    (21, 'Мясное сырьё', 1), (21, 'Молочный компонент', 2), (21, 'Специя или добавка', 3),
    (24, 'Полиамидная упаковка', 1), (24, 'Картонная упаковка', 2),
    (25, 'Фарш', 1), (25, 'Мясная смесь', 2),
    (26, 'Подарочный набор', 1), (26, 'Ассорти изделий', 2)
) v(classifier_node_id, value_str, sort_order)
  ON ed.classifier_node_id = v.classifier_node_id
WHERE NOT EXISTS (
    SELECT 1 FROM enum_value ev
    WHERE ev.enum_definition_id = ed.id AND ev.value_str = v.value_str
);

-- Поля параметров заполняются для всех товаров соответствующих классов.
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_int, value_real)
SELECT p.id, pd.id,
       CASE WHEN pd.value_type = 'int' THEN
           CASE WHEN pd.name = 'Срок хранения' THEN 30
                WHEN pd.name = 'Количество в упаковке' THEN 1
                WHEN pd.name = 'Количество изделий' THEN 2 END
       END,
       CASE WHEN pd.value_type = 'real' THEN
           CASE WHEN pd.name = 'Массовая доля влаги' THEN 68
                WHEN pd.name = 'Температура хранения' THEN 2
                WHEN pd.name = 'Длина единицы' THEN 1
                WHEN pd.name = 'Выход полуфабриката' THEN 98
                WHEN pd.name = 'Масса набора' THEN 1.15 END
       END
FROM product p
JOIN parameter_definition pd ON (
    pd.classifier_node_id = 21 AND p.classifier_node_id IN (22, 23)
    OR pd.classifier_node_id = 24 AND p.classifier_node_id = 24
    OR pd.classifier_node_id = 25 AND p.classifier_node_id = 25
    OR pd.classifier_node_id = 26 AND p.classifier_node_id = 26
)
ON CONFLICT (product_id, parameter_definition_id) DO UPDATE SET
    value_int = EXCLUDED.value_int, value_real = EXCLUDED.value_real,
    value_str = NULL, value_enum_id = NULL;

-- Характеристики соответствующих классов, чтобы карточки не оставались пустыми.
INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT p.id, ev.id
FROM product p
JOIN enum_definition ed ON (
    (ed.classifier_node_id = 21 AND p.classifier_node_id IN (22, 23))
    OR ed.classifier_node_id = p.classifier_node_id
)
JOIN enum_value ev ON ev.enum_definition_id = ed.id
WHERE ev.sort_order = CASE
    WHEN p.classifier_node_id IN (22, 23) THEN 1
    WHEN p.classifier_node_id = 24 THEN 1
    WHEN p.classifier_node_id = 25 THEN 1
    WHEN p.classifier_node_id = 26 THEN 1
END
AND NOT EXISTS (
    SELECT 1 FROM product_attribute_value pav
    WHERE pav.product_id = p.id AND pav.enum_value_id = ev.id
);

-- Заполняем параметры всех колбасных изделий, включая добавленные выше.
WITH RECURSIVE sausage_nodes AS (
    SELECT id, id AS root_id FROM classifier_node WHERE id IN (2, 3, 4)
    UNION ALL
    SELECT cn.id, sn.root_id
    FROM classifier_node cn
    JOIN sausage_nodes sn ON cn.parent_id = sn.id
)
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_str, value_int, value_real)
SELECT p.id, pd.id,
       CASE
           WHEN pd.name = 'Порода древесины' THEN 'бук'
           ELSE NULL
       END,
       CASE
           WHEN pd.name = 'Время варки' THEN CASE
               WHEN p.classifier_node_id IN (15, 16) THEN 65 ELSE 90 END
           WHEN pd.name = 'Выдержка после копчения' THEN 5
           WHEN pd.name = 'Выдержка посола' THEN 3
           WHEN pd.name = 'Срок годности' THEN 20
           ELSE NULL
       END,
       CASE
           WHEN pd.name = 'Температура варки' THEN CASE
               WHEN p.classifier_node_id IN (15, 16) THEN 75 ELSE 72 END
           WHEN pd.name = 'Диаметр батона' THEN CASE
               WHEN p.classifier_node_id IN (13, 14) THEN 32 ELSE 65 END
           WHEN pd.name = 'Содержание соли' THEN 2.4
           WHEN pd.name = 'Длительность копчения' THEN 8
           WHEN pd.name = 'Выход продукта' THEN 85
           WHEN pd.name = 'Массовая доля белка' THEN 12
           WHEN pd.name = 'Массовая доля жира' THEN 24
           WHEN pd.name = 'Температура хранения' THEN 2
           ELSE NULL
       END
FROM product p
JOIN sausage_nodes sn ON sn.id = p.classifier_node_id
JOIN parameter_definition pd ON (
    pd.classifier_node_id = 1 OR pd.classifier_node_id = sn.root_id
)
WHERE p.classifier_node_id IN (
    SELECT id FROM sausage_nodes
)
AND NOT EXISTS (
    SELECT 1 FROM product_parameter_value ppv
    WHERE ppv.product_id = p.id AND ppv.parameter_definition_id = pd.id
);

-- Характеристики всех колбас: оболочка и структура, а для копчёных также температура копчения.
INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT p.id, ev.id
FROM product p
JOIN enum_value ev ON (
    ev.enum_definition_id = 3
    OR (ev.enum_definition_id = 1 AND p.classifier_node_id IN (12, 13, 14, 15, 16))
    OR (ev.enum_definition_id = 2 AND p.classifier_node_id = 13)
    OR (ev.enum_definition_id = 4 AND p.classifier_node_id IN (17, 18))
)
WHERE p.classifier_node_id IN (12, 13, 14, 15, 16, 17, 18, 19, 20)
AND ev.sort_order = CASE
    WHEN ev.enum_definition_id = 3 THEN CASE
        WHEN p.classifier_node_id IN (17, 18) THEN 2 ELSE 5 END
    WHEN ev.enum_definition_id = 1 THEN CASE
        WHEN p.classifier_node_id IN (13, 14) THEN 1 ELSE 2 END
    WHEN ev.enum_definition_id = 2 THEN 1
    WHEN ev.enum_definition_id = 4 THEN 1
END
AND NOT EXISTS (
    SELECT 1 FROM product_attribute_value pav
    WHERE pav.product_id = p.id AND pav.enum_value_id = ev.id
);

-- Обновляем агрегаты после добавления новых товаров и значений.
SELECT refresh_aggregates();

-- =====================================================
-- 19. Исправление ассортимента копчёных и цельномышечных изделий
-- =====================================================

-- Ранее изделия с названием «Карбонат» ошибочно были размещены в
-- категории «Буженина». Переносим их в правильную категорию.
UPDATE product
SET classifier_node_id = 11
WHERE id BETWEEN 51 AND 55
  AND name ILIKE '%Карбонат%';

-- Заполняем пустые категории реалистичными изделиями.
INSERT INTO product (
    id, classifier_node_id, sku, name, price, supplier, weight_gram,
    designation, product_type_code, unit_id
) VALUES
    (56, 7, 'ВК-01.001', 'Колбаса варёно-копчёная классическая', 690, 'ООО «Дымовское»', 450, 'ВК-01.001', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (57, 7, 'ВК-01.002', 'Колбаса варёно-копчёная с чесноком', 740, 'АО «Мясной край»', 500, 'ВК-01.002', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (58, 7, 'ВК-01.003', 'Колбаса варёно-копчёная праздничная', 820, 'ООО «Копчёности»', 500, 'ВК-01.003', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (59, 7, 'ВК-01.004', 'Колбаса варёно-копчёная фермерская', 760, 'ИП «Мясной двор»', 450, 'ВК-01.004', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (60, 7, 'ВК-01.005', 'Колбаса варёно-копчёная с пряностями', 790, 'АО «Велес»', 500, 'ВК-01.005', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (61, 8, 'ПК-01.001', 'Колбаса полукопчёная охотничья', 610, 'ООО «Дымовское»', 400, 'ПК-01.001', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (62, 8, 'ПК-01.002', 'Колбаса полукопчёная московская', 680, 'АО «Мясной край»', 450, 'ПК-01.002', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (63, 8, 'ПК-01.003', 'Колбаса полукопчёная чесночная', 640, 'ООО «Копчёности»', 450, 'ПК-01.003', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (64, 8, 'ПК-01.004', 'Колбаса полукопчёная деревенская', 590, 'ИП «Мясной двор»', 500, 'ПК-01.004', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (65, 8, 'ПК-01.005', 'Колбаса полукопчёная с сыром', 720, 'ООО «Мясной стандарт»', 450, 'ПК-01.005', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (66, 20, 'БУ-01.001', 'Буженина классическая', 760, 'АО «Мясной край»', 500, 'БУ-01.001', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (67, 20, 'БУ-01.002', 'Буженина запечённая', 820, 'ООО «Мясной стандарт»', 500, 'БУ-01.002', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (68, 20, 'БУ-01.003', 'Буженина с чесноком', 790, 'ООО «Копчёности»', 450, 'БУ-01.003', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (69, 20, 'БУ-01.004', 'Буженина фермерская', 730, 'ИП «Мясной двор»', 500, 'БУ-01.004', 'part', (SELECT id FROM unit WHERE symbol = 'шт')),
    (70, 20, 'БУ-01.005', 'Буженина праздничная', 880, 'АО «Велес»', 550, 'БУ-01.005', 'part', (SELECT id FROM unit WHERE symbol = 'шт'))
ON CONFLICT (id) DO UPDATE SET
    classifier_node_id = EXCLUDED.classifier_node_id,
    sku = EXCLUDED.sku,
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    supplier = EXCLUDED.supplier,
    weight_gram = EXCLUDED.weight_gram,
    designation = EXCLUDED.designation,
    product_type_code = EXCLUDED.product_type_code,
    unit_id = EXCLUDED.unit_id;

SELECT sync_id_sequences();

-- Значения всех параметров для новых и перенесённых изделий.
WITH RECURSIVE sausage_nodes AS (
    SELECT id, id AS root_id FROM classifier_node WHERE id IN (2, 3, 4)
    UNION ALL
    SELECT cn.id, sn.root_id
    FROM classifier_node cn
    JOIN sausage_nodes sn ON cn.parent_id = sn.id
)
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_str, value_int, value_real)
SELECT p.id, pd.id,
       CASE WHEN pd.name = 'Порода древесины' THEN 'бук' ELSE NULL END,
       CASE
           WHEN pd.name = 'Время варки' THEN 75
           WHEN pd.name = 'Выдержка после копчения' THEN 5
           WHEN pd.name = 'Выдержка посола' THEN 3
           WHEN pd.name = 'Срок годности' THEN 20
           ELSE NULL
       END,
       CASE
           WHEN pd.name = 'Температура варки' THEN 72
           WHEN pd.name = 'Диаметр батона' THEN 65
           WHEN pd.name = 'Содержание соли' THEN 2.4
           WHEN pd.name = 'Длительность копчения' THEN 8
           WHEN pd.name = 'Выход продукта' THEN 85
           WHEN pd.name = 'Массовая доля белка' THEN 12
           WHEN pd.name = 'Массовая доля жира' THEN 24
           WHEN pd.name = 'Температура хранения' THEN 2
           ELSE NULL
       END
FROM product p
JOIN sausage_nodes sn ON sn.id = p.classifier_node_id
JOIN parameter_definition pd ON pd.classifier_node_id IN (1, sn.root_id)
WHERE p.classifier_node_id IN (7, 8, 11, 20)
ON CONFLICT (product_id, parameter_definition_id) DO UPDATE SET
    value_str = EXCLUDED.value_str,
    value_int = EXCLUDED.value_int,
    value_real = EXCLUDED.value_real,
    value_enum_id = NULL;

-- Структура и оболочка для новых изделий.
INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT p.id, ev.id
FROM product p
JOIN enum_value ev ON (
    ev.enum_definition_id = 1 AND p.classifier_node_id IN (7, 8, 11, 20)
    OR ev.enum_definition_id = 3 AND p.classifier_node_id IN (7, 8, 11, 20)
)
WHERE p.classifier_node_id IN (7, 8, 11, 20)
  AND ev.sort_order = CASE
      WHEN ev.enum_definition_id = 1 THEN 2
      ELSE 5
  END
  AND NOT EXISTS (
      SELECT 1 FROM product_attribute_value pav
      WHERE pav.product_id = p.id AND pav.enum_value_id = ev.id
  );

SELECT refresh_aggregates();

-- Примеры вызова:
-- SELECT * FROM find_bom(15);                -- дерево набора на всю глубину
-- SELECT * FROM calc_bom(1, 1000);           -- сырьё и упаковка на 1000 батонов
-- SELECT * FROM calc_bom(1, 1000, 22);       -- только мясное сырьё
-- SELECT * FROM calc_bom_by_class(15, 100);  -- свод по классам ресурсов на 100 наборов
