-- =====================================================
-- schema_patch_v7.sql
-- Калькуляция себестоимости: убраны материалы, считается
-- только стоимость труда по техпроцессу (calc_labor).
-- CREATE OR REPLACE не может менять набор возвращаемых колонок,
-- поэтому функция сначала удаляется.
-- =====================================================

DROP FUNCTION IF EXISTS calc_cost(INTEGER, DOUBLE PRECISION);

CREATE FUNCTION calc_cost(p_id_prod INTEGER, p_q DOUBLE PRECISION DEFAULT 1)
RETURNS TABLE (
    labor_cost  NUMERIC,
    unit_cost   NUMERIC
) AS $$
    SELECT COALESCE(SUM(b.total_cost), 0),
           ROUND(COALESCE(SUM(b.total_cost), 0) / p_q::NUMERIC, 2)
    FROM calc_labor(p_id_prod, p_q) b;
$$ LANGUAGE sql STABLE;

-- Фиксируем версию схемы
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
);

DELETE FROM schema_version;
INSERT INTO schema_version (version) VALUES (7);