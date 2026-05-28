-- =====================================================
-- 0. Очистка — сбрасываем всё перед установкой
--    (безопасно, если база пустая или уже содержит старую версию)
-- =====================================================

DROP MATERIALIZED VIEW IF EXISTS mv_parameter_aggregates CASCADE;
DROP VIEW IF EXISTS v_parameter_aggregates CASCADE;
DROP VIEW IF EXISTS v_inherited_parameters CASCADE;

DROP TRIGGER IF EXISTS trg_check_parameter_belongs         ON product_parameter_value;
DROP TRIGGER IF EXISTS trg_check_numeric_constraint        ON product_parameter_value;
DROP TRIGGER IF EXISTS trg_prevent_duplicate_inherited_param ON parameter_definition;

DROP FUNCTION IF EXISTS check_parameter_belongs_to_product_class();
DROP FUNCTION IF EXISTS check_numeric_constraint();
DROP FUNCTION IF EXISTS prevent_duplicate_inherited_param();
DROP FUNCTION IF EXISTS refresh_aggregates();

DROP TABLE IF EXISTS product_parameter_value      CASCADE;
DROP TABLE IF EXISTS parameter_numeric_constraint CASCADE;
DROP TABLE IF EXISTS parameter_definition         CASCADE;
DROP TABLE IF EXISTS product_attribute_value      CASCADE;
DROP TABLE IF EXISTS enum_value                   CASCADE;
DROP TABLE IF EXISTS enum_definition              CASCADE;
DROP TABLE IF EXISTS product                      CASCADE;
DROP TABLE IF EXISTS unit                         CASCADE;
DROP TABLE IF EXISTS unit_dimension               CASCADE;
DROP TABLE IF EXISTS classifier_node              CASCADE;

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

-- Триггерная функция проверки численного значения
CREATE OR REPLACE FUNCTION check_numeric_constraint()
RETURNS TRIGGER AS $$
DECLARE
    v_min NUMERIC;
    v_max NUMERIC;
    v_val NUMERIC;
BEGIN
    IF NEW.value_int IS NULL AND NEW.value_real IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT min_value, max_value INTO v_min, v_max
    FROM parameter_numeric_constraint
    WHERE parameter_definition_id = NEW.parameter_definition_id;

    IF FOUND THEN
        v_val := COALESCE(NEW.value_int, NEW.value_real);
        IF v_val < v_min OR v_val > v_max THEN
            RAISE EXCEPTION 'Значение параметра % должно быть в диапазоне [%, %]',
                            NEW.parameter_definition_id, v_min, v_max;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_numeric_constraint
BEFORE INSERT OR UPDATE ON product_parameter_value
FOR EACH ROW
EXECUTE FUNCTION check_numeric_constraint();

-- =====================================================
-- 6. Наследование параметров
-- =====================================================

CREATE OR REPLACE VIEW v_inherited_parameters AS
WITH RECURSIVE node_ancestors AS (
    SELECT
        cn.id AS node_id,
        cn.id AS ancestor_id,
        0 AS depth
    FROM classifier_node cn

    UNION ALL

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
    na.ancestor_id AS defined_at_node_id
FROM node_ancestors na
JOIN parameter_definition pd ON pd.classifier_node_id = na.ancestor_id
ORDER BY na.node_id, pd.sort_order;

-- Триггер на запрет дублирования имён параметров в цепочке наследования
CREATE OR REPLACE FUNCTION prevent_duplicate_inherited_param()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM v_inherited_parameters
        WHERE classifier_node_id = NEW.classifier_node_id
          AND name = NEW.name
          AND parameter_definition_id != NEW.id
    ) THEN
        RAISE EXCEPTION 'Параметр с именем "%" уже существует для этого узла или унаследован от родителя', NEW.name;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_duplicate_inherited_param
BEFORE INSERT OR UPDATE ON parameter_definition
FOR EACH ROW
EXECUTE FUNCTION prevent_duplicate_inherited_param();

-- =====================================================
-- 7. Агрегаты параметров
-- =====================================================

CREATE OR REPLACE VIEW v_parameter_aggregates AS
WITH RECURSIVE node_descendants AS (
    SELECT id AS ancestor_id, id AS descendant_id FROM classifier_node
    UNION ALL
    SELECT nd.ancestor_id, cn.id
    FROM node_descendants nd
    JOIN classifier_node cn ON cn.parent_id = nd.descendant_id
),
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

CREATE MATERIALIZED VIEW mv_parameter_aggregates AS
SELECT * FROM v_parameter_aggregates;

CREATE UNIQUE INDEX mv_parameter_aggregates_pk ON mv_parameter_aggregates (classifier_node_id, parameter_definition_id);

REFRESH MATERIALIZED VIEW mv_parameter_aggregates;

CREATE OR REPLACE FUNCTION refresh_aggregates()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_parameter_aggregates;
    RAISE NOTICE 'Агрегаты обновлены в %', NOW();
END;
$$;

/*
CREATE OR REPLACE FUNCTION trigger_refresh_aggregates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM refresh_aggregates();
    RETURN NULL;
END;
$$;

CREATE TRIGGER refresh_aggregates_on_change
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

CREATE TRIGGER trg_check_parameter_belongs
BEFORE INSERT OR UPDATE ON product_parameter_value
FOR EACH ROW
EXECUTE FUNCTION check_parameter_belongs_to_product_class();

-- =====================================================
-- 8. Наполнение данными
-- =====================================================

-- Узлы классификатора
INSERT INTO classifier_node (parent_id, name, unit, sort_order) VALUES
(NULL, 'Колбасное изделие',        'грамм', 0);

INSERT INTO classifier_node (parent_id, name, unit, sort_order) VALUES
((SELECT id FROM classifier_node WHERE name='Колбасное изделие'), 'Варёные',          'грамм', 1),
((SELECT id FROM classifier_node WHERE name='Колбасное изделие'), 'Копчёные',         'грамм', 2),
((SELECT id FROM classifier_node WHERE name='Колбасное изделие'), 'Цельномышечные',   'грамм', 3);

INSERT INTO classifier_node (parent_id, name, unit, sort_order) VALUES
((SELECT id FROM classifier_node WHERE name='Варёные'),        'Варёная колбаса',      'грамм', 1),
((SELECT id FROM classifier_node WHERE name='Варёные'),        'Ливерные продукты',    'грамм', 2),
((SELECT id FROM classifier_node WHERE name='Копчёные'),       'Варёно-копчёные',      'грамм', 1),
((SELECT id FROM classifier_node WHERE name='Копчёные'),       'Полу-копчёные',        'грамм', 2),
((SELECT id FROM classifier_node WHERE name='Копчёные'),       'Сырокопчёные',         'грамм', 3),
((SELECT id FROM classifier_node WHERE name='Цельномышечные'), 'Ветчина',              'грамм', 1),
((SELECT id FROM classifier_node WHERE name='Цельномышечные'), 'Карбонат',             'грамм', 2);

-- Уровень 3: дети узлов уровня 2 (не зависят друг от друга)
INSERT INTO classifier_node (parent_id, name, unit, sort_order) VALUES
((SELECT id FROM classifier_node WHERE name='Варёная колбаса'),  'Высшего сорта',          'грамм', 1),
((SELECT id FROM classifier_node WHERE name='Варёная колбаса'),  'Сосиски/сардельки',      'грамм', 2),
((SELECT id FROM classifier_node WHERE name='Варёная колбаса'),  'Зельц',                  'грамм', 3),
((SELECT id FROM classifier_node WHERE name='Ливерные продукты'),'Ливерная колбаса',        'грамм', 1),
((SELECT id FROM classifier_node WHERE name='Ливерные продукты'),'Паштет',                  'грамм', 2),
((SELECT id FROM classifier_node WHERE name='Сырокопчёные'),     'Салями',                  'грамм', 1),
((SELECT id FROM classifier_node WHERE name='Сырокопчёные'),     'Чоризо',                  'грамм', 2),
((SELECT id FROM classifier_node WHERE name='Ветчина'),          'Ветчина варёная',          'грамм', 1),
((SELECT id FROM classifier_node WHERE name='Ветчина'),          'Буженина',                 'грамм', 2),
((SELECT id FROM classifier_node WHERE name='Ветчина'),          'Ветчина копчёная',         'грамм', 3),
((SELECT id FROM classifier_node WHERE name='Ветчина'),          'Ветчина в желе',           'грамм', 4),
((SELECT id FROM classifier_node WHERE name='Варёно-копчёные'),  'Варёно-копчёная колбаса', 'грамм', 1),
((SELECT id FROM classifier_node WHERE name='Варёно-копчёные'),  'Варёно-копчёный рулет',   'грамм', 2);

-- Уровень 4: дети узлов уровня 3 (отдельный INSERT, чтобы подзапросы нашли родителей)
INSERT INTO classifier_node (parent_id, name, unit, sort_order) VALUES
((SELECT id FROM classifier_node WHERE name='Салями'),  'Салями сырокопчёная', 'грамм', 1),
((SELECT id FROM classifier_node WHERE name='Салями'),  'Салями п/к',          'грамм', 2),
((SELECT id FROM classifier_node WHERE name='Паштет'),  'Паштет печёночный',   'грамм', 1),
((SELECT id FROM classifier_node WHERE name='Паштет'),  'Паштет мясной',       'грамм', 2);

-- Единицы измерения
INSERT INTO unit_dimension (name) VALUES
    ('Масса'), ('Длина'), ('Температура'), ('Время'), ('Концентрация'), ('Безразмерная');

INSERT INTO unit (dimension_id, name, symbol, to_base_factor, to_base_offset) VALUES
    ((SELECT id FROM unit_dimension WHERE name='Масса'),        'грамм',           'г',   1,       0),
    ((SELECT id FROM unit_dimension WHERE name='Масса'),        'килограмм',       'кг',  1000,    0),
    ((SELECT id FROM unit_dimension WHERE name='Длина'),        'миллиметр',       'мм',  1,       0),
    ((SELECT id FROM unit_dimension WHERE name='Длина'),        'сантиметр',       'см',  10,      0),
    ((SELECT id FROM unit_dimension WHERE name='Длина'),        'дюйм',            'in',  25.4,    0),
    ((SELECT id FROM unit_dimension WHERE name='Температура'),  'градус Цельсия',  '°C',  1,       273.15),
    ((SELECT id FROM unit_dimension WHERE name='Температура'),  'Кельвин',         'K',   1,       0),
    ((SELECT id FROM unit_dimension WHERE name='Время'),        'минута',          'мин', 1,       0),
    ((SELECT id FROM unit_dimension WHERE name='Время'),        'час',             'ч',   60,      0),
    ((SELECT id FROM unit_dimension WHERE name='Время'),        'сутки',           'сут', 1440,    0),
    ((SELECT id FROM unit_dimension WHERE name='Концентрация'), 'процент',         '%',   1,       0),
    ((SELECT id FROM unit_dimension WHERE name='Безразмерная'), 'штука',           'шт',  1,       0);

-- Перечисления
INSERT INTO enum_definition (classifier_node_id, description) VALUES
    ((SELECT id FROM classifier_node WHERE name='Варёные'),    'Структура'),
    ((SELECT id FROM classifier_node WHERE name='Сосиски/сардельки'), 'Порционирование'),
    ((SELECT id FROM classifier_node WHERE name='Колбасное изделие'), 'Оболочка'),
    ((SELECT id FROM classifier_node WHERE name='Копчёные'),   'Температура копчения'),
    ((SELECT id FROM classifier_node WHERE name='Варёная колбаса'),   'Сорт'),
    ((SELECT id FROM classifier_node WHERE name='Цельномышечные'),    'Вид разделки'),
    ((SELECT id FROM classifier_node WHERE name='Ливерные продукты'), 'Текстура'),
    ((SELECT id FROM classifier_node WHERE name='Паштет'),            'Упаковка');

-- Значения перечислений
INSERT INTO enum_value (enum_definition_id, value_str, value_int, sort_order) VALUES
    ((SELECT id FROM enum_definition WHERE description='Структура'),          'Гомогенная',       NULL, 1),
    ((SELECT id FROM enum_definition WHERE description='Структура'),          'Со шпиком',        NULL, 2),
    ((SELECT id FROM enum_definition WHERE description='Структура'),          'С кусочками',      NULL, 3),
    ((SELECT id FROM enum_definition WHERE description='Порционирование'),    'Перекрут',         NULL, 1),
    ((SELECT id FROM enum_definition WHERE description='Порционирование'),    'Фиксированная длина', NULL, 2),
    ((SELECT id FROM enum_definition WHERE description='Оболочка'),           'Натуральная',      NULL, 1),
    ((SELECT id FROM enum_definition WHERE description='Оболочка'),           'Биополимерная',    NULL, 2),
    ((SELECT id FROM enum_definition WHERE description='Оболочка'),           'Герметичная',      NULL, 3),
    ((SELECT id FROM enum_definition WHERE description='Оболочка'),           'Текстильная',      NULL, 4),
    ((SELECT id FROM enum_definition WHERE description='Оболочка'),           'Целлофан',         NULL, 5),
    ((SELECT id FROM enum_definition WHERE description='Оболочка'),           'Белок',            NULL, 6),
    ((SELECT id FROM enum_definition WHERE description='Температура копчения'), 'Холодное',       25,   1),
    ((SELECT id FROM enum_definition WHERE description='Температура копчения'), 'Тёплое',         50,   2),
    ((SELECT id FROM enum_definition WHERE description='Температура копчения'), 'Горячее',        120,  3),
    ((SELECT id FROM enum_definition WHERE description='Сорт'),               'Высший',           NULL, 1),
    ((SELECT id FROM enum_definition WHERE description='Сорт'),               'Первый',           NULL, 2),
    ((SELECT id FROM enum_definition WHERE description='Сорт'),               'Второй',           NULL, 3),
    ((SELECT id FROM enum_definition WHERE description='Сорт'),               'Бессортовой',      NULL, 4),
    ((SELECT id FROM enum_definition WHERE description='Вид разделки'),       'Окорок',           NULL, 1),
    ((SELECT id FROM enum_definition WHERE description='Вид разделки'),       'Лопатка',          NULL, 2),
    ((SELECT id FROM enum_definition WHERE description='Вид разделки'),       'Карбонатная часть',NULL, 3),
    ((SELECT id FROM enum_definition WHERE description='Вид разделки'),       'Шея',              NULL, 4),
    ((SELECT id FROM enum_definition WHERE description='Вид разделки'),       'Грудинка',         NULL, 5),
    ((SELECT id FROM enum_definition WHERE description='Текстура'),           'Нежная',           NULL, 1),
    ((SELECT id FROM enum_definition WHERE description='Текстура'),           'Грубозернистая',   NULL, 2),
    ((SELECT id FROM enum_definition WHERE description='Текстура'),           'Паштетная',        NULL, 3),
    ((SELECT id FROM enum_definition WHERE description='Упаковка'),           'Банка',            NULL, 1),
    ((SELECT id FROM enum_definition WHERE description='Упаковка'),           'Тюбик',            NULL, 2),
    ((SELECT id FROM enum_definition WHERE description='Упаковка'),           'Лоток',            NULL, 3);

-- Параметры
INSERT INTO parameter_definition (classifier_node_id, name, unit_id, value_type, sort_order) VALUES
    -- Варёные (2)
    ((SELECT id FROM classifier_node WHERE name='Варёные'), 'Температура варки',      (SELECT id FROM unit WHERE symbol='°C'),  'real', 1),
    ((SELECT id FROM classifier_node WHERE name='Варёные'), 'Время варки',            (SELECT id FROM unit WHERE symbol='мин'), 'int',  2),
    ((SELECT id FROM classifier_node WHERE name='Варёные'), 'Диаметр батона',         (SELECT id FROM unit WHERE symbol='мм'),  'real', 3),
    ((SELECT id FROM classifier_node WHERE name='Варёные'), 'Содержание соли',        (SELECT id FROM unit WHERE symbol='%'),   'real', 4),
    -- Копчёные (3)
    ((SELECT id FROM classifier_node WHERE name='Копчёные'), 'Длительность копчения', (SELECT id FROM unit WHERE symbol='ч'),   'real', 1),
    ((SELECT id FROM classifier_node WHERE name='Копчёные'), 'Выдержка после копчения',(SELECT id FROM unit WHERE symbol='сут'),'int',  2),
    ((SELECT id FROM classifier_node WHERE name='Копчёные'), 'Порода древесины',      NULL,                                     'str',  3),
    -- Цельномышечные (4)
    ((SELECT id FROM classifier_node WHERE name='Цельномышечные'), 'Выдержка посола', (SELECT id FROM unit WHERE symbol='сут'), 'int',  1),
    ((SELECT id FROM classifier_node WHERE name='Цельномышечные'), 'Выход продукта',  (SELECT id FROM unit WHERE symbol='%'),   'real', 2),
    ((SELECT id FROM classifier_node WHERE name='Цельномышечные'), 'Содержание белка',(SELECT id FROM unit WHERE symbol='%'),   'real', 3),
    -- Варёная колбаса (5)
    ((SELECT id FROM classifier_node WHERE name='Варёная колбаса'), 'Содержание мяса',(SELECT id FROM unit WHERE symbol='%'),   'real', 1),
    ((SELECT id FROM classifier_node WHERE name='Варёная колбаса'), 'Калорийность',   (SELECT id FROM unit WHERE symbol='%'),   'real', 2),
    -- Ливерные продукты (6)
    ((SELECT id FROM classifier_node WHERE name='Ливерные продукты'), 'Содержание жира',(SELECT id FROM unit WHERE symbol='%'), 'real', 1),
    -- Сырокопчёные (9)
    ((SELECT id FROM classifier_node WHERE name='Сырокопчёные'), 'Срок созревания',   (SELECT id FROM unit WHERE symbol='сут'), 'int',  1),
    ((SELECT id FROM classifier_node WHERE name='Сырокопчёные'), 'Содержание жира',   (SELECT id FROM unit WHERE symbol='%'),   'real', 2);

-- Ограничения на числовые параметры
INSERT INTO parameter_numeric_constraint (parameter_definition_id, min_value, max_value)
SELECT id, 30,  150 FROM parameter_definition WHERE name='Диаметр батона'          AND classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёные')
ON CONFLICT DO NOTHING;

INSERT INTO parameter_numeric_constraint (parameter_definition_id, min_value, max_value)
SELECT id, 60,  100 FROM parameter_definition WHERE name='Температура варки'       AND classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёные')
ON CONFLICT DO NOTHING;

INSERT INTO parameter_numeric_constraint (parameter_definition_id, min_value, max_value)
SELECT id, 10,  240 FROM parameter_definition WHERE name='Время варки'             AND classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёные')
ON CONFLICT DO NOTHING;

INSERT INTO parameter_numeric_constraint (parameter_definition_id, min_value, max_value)
SELECT id, 0,   100 FROM parameter_definition WHERE name='Содержание мяса'         AND classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёная колбаса')
ON CONFLICT DO NOTHING;

INSERT INTO parameter_numeric_constraint (parameter_definition_id, min_value, max_value)
SELECT id, 100, 600 FROM parameter_definition WHERE name='Калорийность'            AND classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёная колбаса')
ON CONFLICT DO NOTHING;

INSERT INTO parameter_numeric_constraint (parameter_definition_id, min_value, max_value)
SELECT id, 0,    60 FROM parameter_definition WHERE name='Содержание жира'         AND classifier_node_id=(SELECT id FROM classifier_node WHERE name='Ливерные продукты')
ON CONFLICT DO NOTHING;

INSERT INTO parameter_numeric_constraint (parameter_definition_id, min_value, max_value)
SELECT id, 0,    50 FROM parameter_definition WHERE name='Содержание белка'        AND classifier_node_id=(SELECT id FROM classifier_node WHERE name='Цельномышечные')
ON CONFLICT DO NOTHING;

INSERT INTO parameter_numeric_constraint (parameter_definition_id, min_value, max_value)
SELECT id, 14,   90 FROM parameter_definition WHERE name='Срок созревания'         AND classifier_node_id=(SELECT id FROM classifier_node WHERE name='Сырокопчёные')
ON CONFLICT DO NOTHING;

INSERT INTO parameter_numeric_constraint (parameter_definition_id, min_value, max_value)
SELECT id, 0,    60 FROM parameter_definition WHERE name='Содержание жира'         AND classifier_node_id=(SELECT id FROM classifier_node WHERE name='Сырокопчёные')
ON CONFLICT DO NOTHING;

-- Продукты
INSERT INTO product (classifier_node_id, sku, name, price, supplier, weight_gram) VALUES
-- Высшего сорта
((SELECT id FROM classifier_node WHERE name='Высшего сорта'), 'КЛИ-ДОК-400', 'Колбаса варёная Клинский Докторская категория А',      499,  'ОАО «Мясокомбинат Клинский»', 400),
((SELECT id FROM classifier_node WHERE name='Высшего сорта'), 'ОКР-ДОК-1150','«Докторская» ГОСТ, колбаса вареная в целлофане',        1238, '«Окраина»',                   1150),
((SELECT id FROM classifier_node WHERE name='Высшего сорта'), 'РАМ-ЛЮБ-200', '«Любительская» ГОСТ, колбаса вареная',                  158,  '«Раменский деликатес»',       200),
((SELECT id FROM classifier_node WHERE name='Высшего сорта'), 'ДОК-МИК-400', 'Колбаса докторская Микоян',                             389,  '«Микоян»',                    400),
((SELECT id FROM classifier_node WHERE name='Высшего сорта'), 'ЛЮБ-ОСТ-500', 'Колбаса любительская Останкино',                        420,  'Останкино',                   500),
((SELECT id FROM classifier_node WHERE name='Высшего сорта'), 'МОЛ-КЛИ-300', 'Колбаса молочная Клинский',                             299,  'ОАО «Мясокомбинат Клинский»', 300),
-- Ливерная колбаса
((SELECT id FROM classifier_node WHERE name='Ливерная колбаса'), 'БГ-ЛИВ-300',  'Колбаса ливерная «Ближние Горки» Яичная ГОСТ',        139,  'ОАО «Мясокомбинат Клинский»', 300),
((SELECT id FROM classifier_node WHERE name='Ливерная колбаса'), 'АТЯ-ЛИВ-250', 'Колбаса «Атяшево» Ливерная Печеночная',               100,  '«Атяшево»',                   250),
((SELECT id FROM classifier_node WHERE name='Ливерная колбаса'), 'МИК-ЛИВ-400', 'Колбаса ливерная «Микоян» Традиционная',              113,  '«Раменский деликатес»',       400),
((SELECT id FROM classifier_node WHERE name='Ливерная колбаса'), 'ЛИВ-ОСТ-200', 'Колбаса ливерная Останкино',                          145,  'Останкино',                   200),
-- Сосиски/сардельки
((SELECT id FROM classifier_node WHERE name='Сосиски/сардельки'), 'СОС-МОЛ-400', 'Сосиски молочные',                                   245,  '«Окраина»',                   400),
((SELECT id FROM classifier_node WHERE name='Сосиски/сардельки'), 'СОС-РУС-300', 'Сосиски русские',                                    198,  'Останкино',                   300),
((SELECT id FROM classifier_node WHERE name='Сосиски/сардельки'), 'САР-СВИ-500', 'Сардельки свиные',                                   320,  '«Атяшево»',                   500),
((SELECT id FROM classifier_node WHERE name='Сосиски/сардельки'), 'САР-ГОВ-400', 'Сардельки говяжьи',                                  289,  '«Микоян»',                    400),
-- Зельц
((SELECT id FROM classifier_node WHERE name='Зельц'), 'ЗЕЛ-БЕЛ-300', 'Зельц белый',                                                   210,  '«Раменский деликатес»',       300),
((SELECT id FROM classifier_node WHERE name='Зельц'), 'ЗЕЛ-ЧЕР-300', 'Зельц чёрный',                                                  230,  '«Раменский деликатес»',       300),
-- Паштет печёночный
((SELECT id FROM classifier_node WHERE name='Паштет печёночный'), 'ПАШ-ПЕЧ-100', 'Паштет печёночный Микоян',                           89,   '«Микоян»',                    100),
((SELECT id FROM classifier_node WHERE name='Паштет печёночный'), 'ПАШ-ПЕЧ-200', 'Паштет печёночный Атяшево',                          75,   '«Атяшево»',                   200),
-- Паштет мясной
((SELECT id FROM classifier_node WHERE name='Паштет мясной'),     'ПАШ-МЯС-130', 'Паштет мясной деликатесный',                         110,  'Останкино',                   130),
-- Варёно-копчёная колбаса
((SELECT id FROM classifier_node WHERE name='Варёно-копчёная колбаса'), 'ВКК-ОСО-400', 'Колбаса Особая варёно-копчёная',               560,  '«Окраина»',                   400),
((SELECT id FROM classifier_node WHERE name='Варёно-копчёная колбаса'), 'ВКК-СЕР-300', 'Колбаса Сервелат варёно-копчёный',             620,  '«Микоян»',                    300),
-- Варёно-копчёный рулет
((SELECT id FROM classifier_node WHERE name='Варёно-копчёный рулет'),   'ВКР-МЯС-500', 'Рулет мясной варёно-копчёный',                 480,  'Останкино',                   500),
-- Салями сырокопчёная
((SELECT id FROM classifier_node WHERE name='Салями сырокопчёная'), 'САЛ-МИЛ-200', 'Салями Милано',                                    890,  '«Микоян»',                    200),
((SELECT id FROM classifier_node WHERE name='Салями сырокопчёная'), 'САЛ-ИТА-150', 'Салями Итальянская',                               760,  '«Окраина»',                   150),
-- Ветчина варёная
((SELECT id FROM classifier_node WHERE name='Ветчина варёная'), 'ВЕТ-РУС-400', 'Ветчина Русская варёная',                              520,  'Останкино',                   400),
((SELECT id FROM classifier_node WHERE name='Ветчина варёная'), 'ВЕТ-ДОМ-500', 'Ветчина Домашняя',                                    480,  '«Мираторг»',                  500),
-- Буженина
((SELECT id FROM classifier_node WHERE name='Буженина'), 'БУЖ-МИР-350', 'Буженина Мираторг запечённая',                               650,  '«Мираторг»',                  350),
((SELECT id FROM classifier_node WHERE name='Буженина'), 'БУЖ-ОСТ-400', 'Буженина Останкино',                                         590,  'Останкино',                   400),
-- Ветчина копчёная
((SELECT id FROM classifier_node WHERE name='Ветчина копчёная'), 'ВЕТ-КОП-300', 'Ветчина копчёная деликатесная',                       720,  '«Микоян»',                    300),
-- Ветчина в желе
((SELECT id FROM classifier_node WHERE name='Ветчина в желе'),   'ВЕТ-ЖЕЛ-250', 'Ветчина в желе классическая',                         380,  '«Раменский деликатес»',       250),
-- Чоризо
((SELECT id FROM classifier_node WHERE name='Чоризо'),           'ЧОР-ОСТ-150', 'Чоризо пикантное',                                    840,  'Останкино',                   150)
ON CONFLICT (sku) DO NOTHING;

-- =====================================================
-- Атрибуты продуктов (product_attribute_value)
-- =====================================================

-- Докторская Клинская
INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT p.id, ev.id FROM product p, enum_value ev
WHERE p.sku='КЛИ-ДОК-400'
  AND ev.enum_definition_id=(SELECT id FROM enum_definition WHERE description='Структура') AND ev.value_str='Гомогенная'
ON CONFLICT DO NOTHING;
INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT p.id, ev.id FROM product p, enum_value ev
WHERE p.sku='КЛИ-ДОК-400'
  AND ev.enum_definition_id=(SELECT id FROM enum_definition WHERE description='Оболочка') AND ev.value_str='Целлофан'
ON CONFLICT DO NOTHING;

-- Докторская Окраина
INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT p.id, ev.id FROM product p, enum_value ev
WHERE p.sku='ОКР-ДОК-1150'
  AND ev.enum_definition_id=(SELECT id FROM enum_definition WHERE description='Структура') AND ev.value_str='Гомогенная'
ON CONFLICT DO NOTHING;
INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT p.id, ev.id FROM product p, enum_value ev
WHERE p.sku='ОКР-ДОК-1150'
  AND ev.enum_definition_id=(SELECT id FROM enum_definition WHERE description='Оболочка') AND ev.value_str='Целлофан'
ON CONFLICT DO NOTHING;

-- Любительская
INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT p.id, ev.id FROM product p, enum_value ev
WHERE p.sku='РАМ-ЛЮБ-200'
  AND ev.enum_definition_id=(SELECT id FROM enum_definition WHERE description='Структура') AND ev.value_str='Со шпиком'
ON CONFLICT DO NOTHING;

-- Ливерная Ближние Горки
INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT p.id, ev.id FROM product p, enum_value ev
WHERE p.sku='БГ-ЛИВ-300'
  AND ev.enum_definition_id=(SELECT id FROM enum_definition WHERE description='Текстура') AND ev.value_str='Нежная'
ON CONFLICT DO NOTHING;

-- Ливерная Атяшево
INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT p.id, ev.id FROM product p, enum_value ev
WHERE p.sku='АТЯ-ЛИВ-250'
  AND ev.enum_definition_id=(SELECT id FROM enum_definition WHERE description='Текстура') AND ev.value_str='Паштетная'
ON CONFLICT DO NOTHING;

-- Ливерная Микоян
INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT p.id, ev.id FROM product p, enum_value ev
WHERE p.sku='МИК-ЛИВ-400'
  AND ev.enum_definition_id=(SELECT id FROM enum_definition WHERE description='Текстура') AND ev.value_str='Нежная'
ON CONFLICT DO NOTHING;

-- Сосиски молочные
INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT p.id, ev.id FROM product p, enum_value ev
WHERE p.sku='СОС-МОЛ-400'
  AND ev.enum_definition_id=(SELECT id FROM enum_definition WHERE description='Порционирование') AND ev.value_str='Перекрут'
ON CONFLICT DO NOTHING;
INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT p.id, ev.id FROM product p, enum_value ev
WHERE p.sku='СОС-МОЛ-400'
  AND ev.enum_definition_id=(SELECT id FROM enum_definition WHERE description='Оболочка') AND ev.value_str='Натуральная'
ON CONFLICT DO NOTHING;

-- Сардельки свиные
INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT p.id, ev.id FROM product p, enum_value ev
WHERE p.sku='САР-СВИ-500'
  AND ev.enum_definition_id=(SELECT id FROM enum_definition WHERE description='Порционирование') AND ev.value_str='Перекрут'
ON CONFLICT DO NOTHING;

-- Паштет печёночный Микоян
INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT p.id, ev.id FROM product p, enum_value ev
WHERE p.sku='ПАШ-ПЕЧ-100'
  AND ev.enum_definition_id=(SELECT id FROM enum_definition WHERE description='Упаковка') AND ev.value_str='Банка'
ON CONFLICT DO NOTHING;
INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT p.id, ev.id FROM product p, enum_value ev
WHERE p.sku='ПАШ-ПЕЧ-100'
  AND ev.enum_definition_id=(SELECT id FROM enum_definition WHERE description='Текстура') AND ev.value_str='Нежная'
ON CONFLICT DO NOTHING;

-- Паштет мясной
INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT p.id, ev.id FROM product p, enum_value ev
WHERE p.sku='ПАШ-МЯС-130'
  AND ev.enum_definition_id=(SELECT id FROM enum_definition WHERE description='Упаковка') AND ev.value_str='Лоток'
ON CONFLICT DO NOTHING;

-- Буженина Мираторг — вид разделки
INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT p.id, ev.id FROM product p, enum_value ev
WHERE p.sku='БУЖ-МИР-350'
  AND ev.enum_definition_id=(SELECT id FROM enum_definition WHERE description='Вид разделки') AND ev.value_str='Карбонатная часть'
ON CONFLICT DO NOTHING;

-- Ветчина Русская — вид разделки
INSERT INTO product_attribute_value (product_id, enum_value_id)
SELECT p.id, ev.id FROM product p, enum_value ev
WHERE p.sku='ВЕТ-РУС-400'
  AND ev.enum_definition_id=(SELECT id FROM enum_definition WHERE description='Вид разделки') AND ev.value_str='Окорок'
ON CONFLICT DO NOTHING;

-- =====================================================
-- Значения параметров продуктов (product_parameter_value)
-- =====================================================

-- Докторская Клинская
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 2.5 FROM product p, parameter_definition pd
WHERE p.sku='КЛИ-ДОК-400' AND pd.name='Содержание соли' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёные')
ON CONFLICT DO NOTHING;
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 80.0 FROM product p, parameter_definition pd
WHERE p.sku='КЛИ-ДОК-400' AND pd.name='Температура варки' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёные')
ON CONFLICT DO NOTHING;
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_int)
SELECT p.id, pd.id, 60 FROM product p, parameter_definition pd
WHERE p.sku='КЛИ-ДОК-400' AND pd.name='Время варки' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёные')
ON CONFLICT DO NOTHING;
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 43.0 FROM product p, parameter_definition pd
WHERE p.sku='КЛИ-ДОК-400' AND pd.name='Диаметр батона' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёные')
ON CONFLICT DO NOTHING;

-- Докторская Окраина
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_int)
SELECT p.id, pd.id, 85 FROM product p, parameter_definition pd
WHERE p.sku='ОКР-ДОК-1150' AND pd.name='Диаметр батона' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёные')
ON CONFLICT DO NOTHING;
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 80.0 FROM product p, parameter_definition pd
WHERE p.sku='ОКР-ДОК-1150' AND pd.name='Температура варки' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёные')
ON CONFLICT DO NOTHING;
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 2.2 FROM product p, parameter_definition pd
WHERE p.sku='ОКР-ДОК-1150' AND pd.name='Содержание соли' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёные')
ON CONFLICT DO NOTHING;

-- Любительская
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 78.0 FROM product p, parameter_definition pd
WHERE p.sku='РАМ-ЛЮБ-200' AND pd.name='Температура варки' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёные')
ON CONFLICT DO NOTHING;
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 44.0 FROM product p, parameter_definition pd
WHERE p.sku='РАМ-ЛЮБ-200' AND pd.name='Диаметр батона' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёные')
ON CONFLICT DO NOTHING;
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 2.0 FROM product p, parameter_definition pd
WHERE p.sku='РАМ-ЛЮБ-200' AND pd.name='Содержание соли' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёные')
ON CONFLICT DO NOTHING;

-- Докторская Микоян
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 80.0 FROM product p, parameter_definition pd
WHERE p.sku='ДОК-МИК-400' AND pd.name='Температура варки' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёные')
ON CONFLICT DO NOTHING;
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 43.0 FROM product p, parameter_definition pd
WHERE p.sku='ДОК-МИК-400' AND pd.name='Диаметр батона' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёные')
ON CONFLICT DO NOTHING;
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 2.3 FROM product p, parameter_definition pd
WHERE p.sku='ДОК-МИК-400' AND pd.name='Содержание соли' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёные')
ON CONFLICT DO NOTHING;

-- Сосиски молочные
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 75.0 FROM product p, parameter_definition pd
WHERE p.sku='СОС-МОЛ-400' AND pd.name='Температура варки' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёные')
ON CONFLICT DO NOTHING;
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 22.0 FROM product p, parameter_definition pd
WHERE p.sku='СОС-МОЛ-400' AND pd.name='Диаметр батона' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёные')
ON CONFLICT DO NOTHING;

-- Сардельки свиные
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 75.0 FROM product p, parameter_definition pd
WHERE p.sku='САР-СВИ-500' AND pd.name='Температура варки' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёные')
ON CONFLICT DO NOTHING;
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 32.0 FROM product p, parameter_definition pd
WHERE p.sku='САР-СВИ-500' AND pd.name='Диаметр батона' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Варёные')
ON CONFLICT DO NOTHING;

-- Салями Милано
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_int)
SELECT p.id, pd.id, 30 FROM product p, parameter_definition pd
WHERE p.sku='САЛ-МИЛ-200' AND pd.name='Срок созревания' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Сырокопчёные')
ON CONFLICT DO NOTHING;
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 38.0 FROM product p, parameter_definition pd
WHERE p.sku='САЛ-МИЛ-200' AND pd.name='Содержание жира' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Сырокопчёные')
ON CONFLICT DO NOTHING;

-- Салями Итальянская
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_int)
SELECT p.id, pd.id, 45 FROM product p, parameter_definition pd
WHERE p.sku='САЛ-ИТА-150' AND pd.name='Срок созревания' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Сырокопчёные')
ON CONFLICT DO NOTHING;
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 42.0 FROM product p, parameter_definition pd
WHERE p.sku='САЛ-ИТА-150' AND pd.name='Содержание жира' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Сырокопчёные')
ON CONFLICT DO NOTHING;

-- Буженина Мираторг
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_int)
SELECT p.id, pd.id, 5 FROM product p, parameter_definition pd
WHERE p.sku='БУЖ-МИР-350' AND pd.name='Выдержка посола' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Цельномышечные')
ON CONFLICT DO NOTHING;
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 114.0 FROM product p, parameter_definition pd
WHERE p.sku='БУЖ-МИР-350' AND pd.name='Выход продукта' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Цельномышечные')
ON CONFLICT DO NOTHING;
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 22.0 FROM product p, parameter_definition pd
WHERE p.sku='БУЖ-МИР-350' AND pd.name='Содержание белка' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Цельномышечные')
ON CONFLICT DO NOTHING;

-- Ветчина Русская
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_int)
SELECT p.id, pd.id, 3 FROM product p, parameter_definition pd
WHERE p.sku='ВЕТ-РУС-400' AND pd.name='Выдержка посола' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Цельномышечные')
ON CONFLICT DO NOTHING;
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 108.0 FROM product p, parameter_definition pd
WHERE p.sku='ВЕТ-РУС-400' AND pd.name='Выход продукта' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Цельномышечные')
ON CONFLICT DO NOTHING;

-- Ливерная Ближние Горки
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 28.0 FROM product p, parameter_definition pd
WHERE p.sku='БГ-ЛИВ-300' AND pd.name='Содержание жира' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Ливерные продукты')
ON CONFLICT DO NOTHING;

-- Ливерная Атяшево
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 32.0 FROM product p, parameter_definition pd
WHERE p.sku='АТЯ-ЛИВ-250' AND pd.name='Содержание жира' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Ливерные продукты')
ON CONFLICT DO NOTHING;

-- Ливерная Микоян
INSERT INTO product_parameter_value (product_id, parameter_definition_id, value_real)
SELECT p.id, pd.id, 25.0 FROM product p, parameter_definition pd
WHERE p.sku='МИК-ЛИВ-400' AND pd.name='Содержание жира' AND pd.classifier_node_id=(SELECT id FROM classifier_node WHERE name='Ливерные продукты')
ON CONFLICT DO NOTHING;

-- =====================================================
-- Финальное обновление агрегатов
-- =====================================================

SELECT refresh_aggregates();
