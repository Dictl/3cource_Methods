-- =====================================================
-- Патч схемы v3 -> v4 (выполняется на уже готовой базе)
-- =====================================================
-- Правила для маршрутов: маршрут создаётся только для изготавливаемых изделий
-- (тип с can_have_bom = TRUE: деталь, сборочная единица, комплект, комплекс).
-- Материал и комплектующее не изготавливаются, поэтому маршрута у них быть не может.
-- Скрипт идемпотентен. Этот же блок вставляется в конец schema.sql как раздел 21.

-- =====================================================
-- 21. Правила для маршрутов
-- =====================================================

-- Маршрут нельзя создать (или перенести) на изделие, которое не изготавливается
CREATE OR REPLACE FUNCTION check_route_product()
RETURNS TRIGGER AS $$
DECLARE
    v_type product_type%ROWTYPE;
BEGIN
    SELECT pt.* INTO v_type
    FROM product p
    JOIN product_type pt ON pt.code = p.product_type_code
    WHERE p.id = NEW.product_id;

    IF NOT v_type.can_have_bom THEN
        RAISE EXCEPTION 'Для изделия типа «%» маршрут не создаётся: оно не изготавливается', v_type.name;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_check_route_product
BEFORE INSERT OR UPDATE OF product_id ON route
FOR EACH ROW
EXECUTE FUNCTION check_route_product();

-- Изделию с маршрутом нельзя сменить тип на неизготавливаемый
CREATE OR REPLACE FUNCTION check_product_type_routes()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT (SELECT can_have_bom FROM product_type WHERE code = NEW.product_type_code)
       AND EXISTS (SELECT 1 FROM route WHERE product_id = NEW.id) THEN
        RAISE EXCEPTION 'У изделия % есть маршрут, тип «%» недопустим', NEW.id, NEW.product_type_code;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_check_product_type_routes
BEFORE UPDATE OF product_type_code ON product
FOR EACH ROW
EXECUTE FUNCTION check_product_type_routes();

-- Фиксируем версию схемы
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
);

DELETE FROM schema_version;
INSERT INTO schema_version (version) VALUES (4);
