-- Анализ технологичности: операции маршрутов изделия и всех его компонентов
CREATE OR REPLACE FUNCTION find_route_deep(p_id_prod INTEGER)
RETURNS TABLE (
    lvl                INTEGER,
    product_id         INTEGER,
    designation        VARCHAR,
    product_name       TEXT,
    route_no           INTEGER,
    position_no        INTEGER,
    operation_name     TEXT,
    operation_class    TEXT,
    work_center_group  TEXT,
    profession         TEXT,
    grade              INTEGER,
    hourly_rate        NUMERIC,
    time_norm          NUMERIC,
    time_unit          VARCHAR,
    qty                NUMERIC,
    qty_unit           VARCHAR,
    hours              NUMERIC,
    labor_cost         NUMERIC
) AS $$
    WITH items AS (
        SELECT 0 AS lvl, p.id AS product_id, 1::NUMERIC AS qty, p.unit_id AS unit_id,
               ARRAY[p.id] AS path
        FROM product p
        WHERE p.id = p_id_prod

        UNION ALL

        SELECT f.lvl, f.component_id, f.total_quantity, f.total_unit_id, f.path
        FROM find_bom(p_id_prod) f
    ),
    latest AS (
        SELECT DISTINCT ON (r.product_id) r.id, r.product_id, r.route_no
        FROM route r
        ORDER BY r.product_id, r.route_no DESC
    ),
    hour_unit AS (
        SELECT u.id FROM unit u WHERE u.symbol = 'ч'
    )
    SELECT
        i.lvl,
        i.product_id,
        p.designation,
        p.name,
        l.route_no,
        ro.position_no,
        ro.name,
        oc.name,
        wg.name,
        pr.name::TEXT,
        pr.grade,
        pr.hourly_rate,
        ro.time_norm,
        tu.symbol,
        i.qty,
        qu.symbol,
        unit_convert(ro.time_norm, ro.time_unit_id, (SELECT h.id FROM hour_unit h)) * i.qty,
        ROUND(unit_convert(ro.time_norm, ro.time_unit_id, (SELECT h.id FROM hour_unit h))
              * i.qty * pr.hourly_rate, 2)
    FROM items i
    JOIN product p              ON p.id = i.product_id
    JOIN latest l               ON l.product_id = i.product_id
    JOIN route_operation ro     ON ro.route_id = l.id
    JOIN operation_class oc     ON oc.id = ro.operation_class_id
    JOIN work_center_group wg   ON wg.id = ro.work_center_group_id
    JOIN profession pr          ON pr.id = ro.profession_id
    JOIN unit tu                ON tu.id = ro.time_unit_id
    LEFT JOIN unit qu           ON qu.id = i.unit_id
    ORDER BY i.path, ro.position_no;
$$ LANGUAGE sql STABLE;

-- Потребность в трудовых ресурсах на p_q изделий: часы и стоимость по профессиям
CREATE OR REPLACE FUNCTION calc_labor(p_id_prod INTEGER, p_q DOUBLE PRECISION DEFAULT 1)
RETURNS TABLE (
    profession   TEXT,
    grade        INTEGER,
    hourly_rate  NUMERIC,
    total_hours  NUMERIC,
    total_cost   NUMERIC
) AS $$
    SELECT r.profession, r.grade, r.hourly_rate,
           ROUND(SUM(r.hours) * p_q::NUMERIC, 4),
           ROUND(SUM(r.labor_cost) * p_q::NUMERIC, 2)
    FROM find_route_deep(p_id_prod) r
    GROUP BY r.profession, r.grade, r.hourly_rate
    ORDER BY r.profession, r.grade;
$$ LANGUAGE sql STABLE;

-- Калькуляция: материалы + труд на p_q изделий и себестоимость единицы
CREATE OR REPLACE FUNCTION calc_cost(p_id_prod INTEGER, p_q DOUBLE PRECISION DEFAULT 1)
RETURNS TABLE (
    material_cost  NUMERIC,
    labor_cost     NUMERIC,
    total_cost     NUMERIC,
    unit_cost      NUMERIC
) AS $$
    SELECT m.v, l.v, m.v + l.v, ROUND((m.v + l.v) / p_q::NUMERIC, 2)
    FROM (SELECT COALESCE(SUM(c.total_cost), 0) AS v FROM calc_bom(p_id_prod, p_q) c) m,
         (SELECT COALESCE(SUM(b.total_cost), 0) AS v FROM calc_labor(p_id_prod, p_q) b) l;
$$ LANGUAGE sql STABLE;