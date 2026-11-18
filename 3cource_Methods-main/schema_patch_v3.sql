-- =====================================================
-- Патч схемы v2 -> v3 (выполняется на уже готовой базе)
-- =====================================================
-- Практика 6: маршрутная технология.
-- Содержит: справочники (operation_class, work_center_group, profession, tooling),
-- маршрут (route), операции (route_operation), инструмент и материалы операций.
-- Скрипт идемпотентен. Этот же блок вставляется в конец schema.sql как раздел 20.

-- =====================================================
-- 20. Маршрутная технология
-- =====================================================

-- Классификатор операций (дерево, агрегация)
CREATE TABLE IF NOT EXISTS operation_class (
    id          SERIAL  PRIMARY KEY,
    parent_id   INTEGER REFERENCES operation_class(id) ON DELETE RESTRICT,
    name        TEXT    NOT NULL UNIQUE,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Группы рабочих центров: цех -> участок -> ГРЦ (дерево, агрегация)
CREATE TABLE IF NOT EXISTS work_center_group (
    id          SERIAL  PRIMARY KEY,
    parent_id   INTEGER REFERENCES work_center_group(id) ON DELETE RESTRICT,
    name        TEXT    NOT NULL UNIQUE,
    sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Профессия и квалификация с часовой тарифной ставкой
CREATE TABLE IF NOT EXISTS profession (
    id           SERIAL        PRIMARY KEY,
    name         VARCHAR(128)  NOT NULL,
    grade        INTEGER       NOT NULL CHECK (grade BETWEEN 1 AND 8),
    hourly_rate  NUMERIC(10,2) NOT NULL CHECK (hourly_rate >= 0),
    UNIQUE (name, grade)
);

-- Инструмент и оснастка
CREATE TABLE IF NOT EXISTS tooling (
    id            SERIAL      PRIMARY KEY,
    designation   VARCHAR(64) NOT NULL UNIQUE,
    name          TEXT        NOT NULL,
    tooling_type  VARCHAR(8)  NOT NULL DEFAULT 'tool' CHECK (tooling_type IN ('tool', 'fixture'))
);

-- Маршрут (шапка техпроцесса); у изделия может быть несколько версий
CREATE TABLE IF NOT EXISTS route (
    id          SERIAL    PRIMARY KEY,
    product_id  INTEGER   NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    route_no    INTEGER   NOT NULL DEFAULT 1,
    name        TEXT      NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (product_id, route_no)
);

-- Операция маршрута (композиция: без маршрута не существует).
-- time_norm — норма времени на 1 единицу изделия (в его ЕИ), в единице time_unit_id
CREATE TABLE IF NOT EXISTS route_operation (
    id                    SERIAL        PRIMARY KEY,
    route_id              INTEGER       NOT NULL REFERENCES route(id) ON DELETE CASCADE,
    position_no           INTEGER       NOT NULL,
    name                  TEXT          NOT NULL,
    operation_class_id    INTEGER       NOT NULL REFERENCES operation_class(id) ON DELETE RESTRICT,
    work_center_group_id  INTEGER       NOT NULL REFERENCES work_center_group(id) ON DELETE RESTRICT,
    profession_id         INTEGER       NOT NULL REFERENCES profession(id) ON DELETE RESTRICT,
    time_norm             NUMERIC(10,2) NOT NULL CHECK (time_norm > 0),
    time_unit_id          INTEGER       NOT NULL REFERENCES unit(id),
    UNIQUE (route_id, position_no)
);

-- Инструмент операции (связь через промежуточную таблицу с атрибутом quantity)
CREATE TABLE IF NOT EXISTS route_operation_tool (
    id                  SERIAL  PRIMARY KEY,
    route_operation_id  INTEGER NOT NULL REFERENCES route_operation(id) ON DELETE CASCADE,
    tooling_id          INTEGER NOT NULL REFERENCES tooling(id) ON DELETE RESTRICT,
    quantity            INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    UNIQUE (route_operation_id, tooling_id)
);

-- Материалы и комплектующие операции: норма = quantity / per_quantity на единицу изделия маршрута
CREATE TABLE IF NOT EXISTS route_operation_material (
    id                  SERIAL        PRIMARY KEY,
    route_operation_id  INTEGER       NOT NULL REFERENCES route_operation(id) ON DELETE CASCADE,
    product_id          INTEGER       NOT NULL REFERENCES product(id) ON DELETE RESTRICT,
    quantity            NUMERIC(18,6) NOT NULL CHECK (quantity > 0),
    per_quantity        NUMERIC(18,6) NOT NULL DEFAULT 1 CHECK (per_quantity > 0),
    unit_id             INTEGER       NOT NULL REFERENCES unit(id),
    UNIQUE (route_operation_id, product_id)
);

CREATE INDEX IF NOT EXISTS ix_route_product ON route (product_id);
CREATE INDEX IF NOT EXISTS ix_route_operation_route ON route_operation (route_id, position_no);
CREATE INDEX IF NOT EXISTS ix_route_operation_material_product ON route_operation_material (product_id);

-- Норма времени должна быть в единице размерности «Время»
CREATE OR REPLACE FUNCTION check_route_operation_time_unit()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM unit u
        JOIN unit_dimension d ON d.id = u.dimension_id
        WHERE u.id = NEW.time_unit_id AND d.name = 'Время'
    ) THEN
        RAISE EXCEPTION 'Норма времени операции должна быть в единице времени (unit_id=%)', NEW.time_unit_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_check_route_operation_time_unit
BEFORE INSERT OR UPDATE OF time_unit_id ON route_operation
FOR EACH ROW
EXECUTE FUNCTION check_route_operation_time_unit();

-- =====================================================
-- Начальные данные
-- =====================================================

-- Классы операций: 3 уровня
INSERT INTO operation_class (name, sort_order) VALUES
    ('Технологические операции', 0)
ON CONFLICT (name) DO NOTHING;

INSERT INTO operation_class (parent_id, name, sort_order)
SELECT p.id, v.name, v.sort_order
FROM (VALUES
    ('Подготовка сырья',    'Технологические операции', 1),
    ('Формовка',            'Технологические операции', 2),
    ('Термообработка',      'Технологические операции', 3),
    ('Контроль и упаковка', 'Технологические операции', 4)
) v(name, parent_name, sort_order)
JOIN operation_class p ON p.name = v.parent_name
ON CONFLICT (name) DO NOTHING;

INSERT INTO operation_class (parent_id, name, sort_order)
SELECT p.id, v.name, v.sort_order
FROM (VALUES
    ('Жиловка',                   'Подготовка сырья',    1),
    ('Куттерование',              'Подготовка сырья',    2),
    ('Шприцевание и клипсование', 'Формовка',            1),
    ('Варка',                     'Термообработка',      1),
    ('Копчение',                  'Термообработка',      2),
    ('Упаковка',                  'Контроль и упаковка', 1),
    ('Контроль качества',         'Контроль и упаковка', 2)
) v(name, parent_name, sort_order)
JOIN operation_class p ON p.name = v.parent_name
ON CONFLICT (name) DO NOTHING;

-- Группы рабочих центров: цех -> участки -> ГРЦ
INSERT INTO work_center_group (name, sort_order) VALUES
    ('Колбасный цех', 0)
ON CONFLICT (name) DO NOTHING;

INSERT INTO work_center_group (parent_id, name, sort_order)
SELECT p.id, v.name, v.sort_order
FROM (VALUES
    ('Участок подготовки сырья', 'Колбасный цех', 1),
    ('Участок формовки',         'Колбасный цех', 2),
    ('Участок термообработки',   'Колбасный цех', 3),
    ('Участок упаковки',         'Колбасный цех', 4)
) v(name, parent_name, sort_order)
JOIN work_center_group p ON p.name = v.parent_name
ON CONFLICT (name) DO NOTHING;

INSERT INTO work_center_group (parent_id, name, sort_order)
SELECT p.id, v.name, v.sort_order
FROM (VALUES
    ('ГРЦ жиловки',               'Участок подготовки сырья', 1),
    ('ГРЦ куттеров',              'Участок подготовки сырья', 2),
    ('ГРЦ шприцев-клипсаторов',   'Участок формовки',         1),
    ('ГРЦ термокамер',            'Участок термообработки',   1),
    ('ГРЦ упаковочных линий',     'Участок упаковки',         1),
    ('ГРЦ контроля',              'Участок упаковки',         2)
) v(name, parent_name, sort_order)
JOIN work_center_group p ON p.name = v.parent_name
ON CONFLICT (name) DO NOTHING;

-- Профессии
INSERT INTO profession (name, grade, hourly_rate) VALUES
    ('Жиловщик',                    3, 320),
    ('Оператор куттера',            4, 380),
    ('Оператор шприца-клипсатора',  4, 400),
    ('Термист',                     4, 420),
    ('Упаковщик',                   3, 300),
    ('Контролёр ОТК',               5, 450)
ON CONFLICT (name, grade) DO NOTHING;

-- Инструмент и оснастка
INSERT INTO tooling (designation, name, tooling_type) VALUES
    ('ИН-01.001', 'Нож жиловочный',                   'tool'),
    ('ИН-01.002', 'Ножи куттера (комплект)',          'tool'),
    ('ИН-01.003', 'Насадка шприца Ø60',               'tool'),
    ('ИН-01.004', 'Термощуп',                         'tool'),
    ('ОС-01.001', 'Матрица клипсатора',               'fixture'),
    ('ОС-01.002', 'Рама для термокамеры',             'fixture'),
    ('ОС-01.003', 'Контейнер для фарша',              'fixture')
ON CONFLICT (designation) DO NOTHING;

-- Маршруты (изделия берутся по обозначению; если изделия нет, строка пропускается)
INSERT INTO route (product_id, route_no, name)
SELECT p.id, 1, v.name
FROM (VALUES
    ('ПФ-01.001',    'Техпроцесс производства фарша «Докторский»'),
    ('КЛ-01.001',    'Техпроцесс производства батона 400 г'),
    ('КЛ-01.001-01', 'Техпроцесс производства батона 800 г'),
    ('ПК-01.003',    'Техпроцесс производства полукопчёной чесночной колбасы'),
    ('ПК-01.001',    'Техпроцесс производства полукопчёной охотничьей колбасы')
) v(designation, name)
JOIN product p ON p.designation = v.designation
ON CONFLICT (product_id, route_no) DO NOTHING;

-- Операции маршрутов (время на 1 единицу изделия)
INSERT INTO route_operation (route_id, position_no, name, operation_class_id,
                             work_center_group_id, profession_id, time_norm, time_unit_id)
SELECT r.id, v.position_no, v.name, oc.id, wc.id, pr.id, v.time_norm, u.id
FROM (VALUES
    ('ПФ-01.001',    1, 'Жиловка мяса',             'Жиловка',                   'ГРЦ жиловки',             'Жиловщик',                   6.00, 'мин'),
    ('ПФ-01.001',    2, 'Куттерование фарша',       'Куттерование',              'ГРЦ куттеров',            'Оператор куттера',           2.00, 'мин'),
    ('ПФ-01.001',    3, 'Контроль фарша',           'Контроль качества',         'ГРЦ контроля',            'Контролёр ОТК',              0.50, 'мин'),
    ('КЛ-01.001',    1, 'Шприцевание и клипсование','Шприцевание и клипсование', 'ГРЦ шприцев-клипсаторов', 'Оператор шприца-клипсатора', 1.50, 'мин'),
    ('КЛ-01.001',    2, 'Варка',                    'Варка',                     'ГРЦ термокамер',          'Термист',                    3.00, 'мин'),
    ('КЛ-01.001',    3, 'Упаковка',                 'Упаковка',                  'ГРЦ упаковочных линий',   'Упаковщик',                  1.00, 'мин'),
    ('КЛ-01.001-01', 1, 'Шприцевание и клипсование','Шприцевание и клипсование', 'ГРЦ шприцев-клипсаторов', 'Оператор шприца-клипсатора', 3.00, 'мин'),
    ('КЛ-01.001-01', 2, 'Варка',                    'Варка',                     'ГРЦ термокамер',          'Термист',                    5.00, 'мин'),
    ('КЛ-01.001-01', 3, 'Упаковка',                 'Упаковка',                  'ГРЦ упаковочных линий',   'Упаковщик',                  1.50, 'мин'),
    ('ПК-01.003',    1, 'Шприцевание и клипсование','Шприцевание и клипсование', 'ГРЦ шприцев-клипсаторов', 'Оператор шприца-клипсатора', 2.00, 'мин'),
    ('ПК-01.003',    2, 'Копчение',                 'Копчение',                  'ГРЦ термокамер',          'Термист',                    0.10, 'ч'),
    ('ПК-01.003',    3, 'Упаковка',                 'Упаковка',                  'ГРЦ упаковочных линий',   'Упаковщик',                  1.00, 'мин'),
    ('ПК-01.001',    1, 'Шприцевание и клипсование','Шприцевание и клипсование', 'ГРЦ шприцев-клипсаторов', 'Оператор шприца-клипсатора', 2.00, 'мин'),
    ('ПК-01.001',    2, 'Копчение',                 'Копчение',                  'ГРЦ термокамер',          'Термист',                    0.10, 'ч'),
    ('ПК-01.001',    3, 'Упаковка',                 'Упаковка',                  'ГРЦ упаковочных линий',   'Упаковщик',                  1.00, 'мин')
) v(designation, position_no, name, class_name, group_name, prof_name, time_norm, unit_symbol)
JOIN product p            ON p.designation = v.designation
JOIN route r              ON r.product_id = p.id AND r.route_no = 1
JOIN operation_class oc   ON oc.name = v.class_name
JOIN work_center_group wc ON wc.name = v.group_name
JOIN profession pr        ON pr.name = v.prof_name
JOIN unit u               ON u.symbol = v.unit_symbol
ON CONFLICT (route_id, position_no) DO NOTHING;

-- Инструмент операций
INSERT INTO route_operation_tool (route_operation_id, tooling_id, quantity)
SELECT ro.id, t.id, v.quantity
FROM (VALUES
    ('ПФ-01.001',    1, 'ИН-01.001', 2),
    ('ПФ-01.001',    2, 'ИН-01.002', 1),
    ('ПФ-01.001',    3, 'ИН-01.004', 1),
    ('КЛ-01.001',    1, 'ИН-01.003', 1),
    ('КЛ-01.001',    1, 'ОС-01.001', 1),
    ('КЛ-01.001',    2, 'ОС-01.002', 4),
    ('КЛ-01.001',    2, 'ИН-01.004', 1),
    ('КЛ-01.001-01', 1, 'ИН-01.003', 1),
    ('КЛ-01.001-01', 2, 'ОС-01.002', 6),
    ('ПК-01.003',    2, 'ОС-01.002', 4)
) v(designation, position_no, tool_designation, quantity)
JOIN product p          ON p.designation = v.designation
JOIN route r            ON r.product_id = p.id AND r.route_no = 1
JOIN route_operation ro ON ro.route_id = r.id AND ro.position_no = v.position_no
JOIN tooling t          ON t.designation = v.tool_designation
ON CONFLICT (route_operation_id, tooling_id) DO NOTHING;

-- Материалы и комплектующие операций (нормы согласованы с рецептурой из bom_item)
INSERT INTO route_operation_material (route_operation_id, product_id, quantity, per_quantity, unit_id)
SELECT ro.id, m.id, v.quantity, v.per_quantity, u.id
FROM (VALUES
    ('ПФ-01.001',    1, 'СР-01.001',  25,   100, 'кг'),
    ('ПФ-01.001',    1, 'СР-01.002',  70,   100, 'кг'),
    ('ПФ-01.001',    2, 'СР-02.001',  2,    100, 'кг'),
    ('ПФ-01.001',    2, 'СР-02.002',  2100, 100, 'г'),
    ('ПФ-01.001',    2, 'СР-02.003',  50,   100, 'г'),
    ('КЛ-01.001',    1, 'ПФ-01.001',  440,  1,   'г'),
    ('КЛ-01.001',    1, 'УП-01.001',  32,   1,   'см'),
    ('КЛ-01.001',    1, 'УП-01.002',  2,    1,   'шт'),
    ('КЛ-01.001-01', 1, 'ПФ-01.001',  880,  1,   'г'),
    ('КЛ-01.001-01', 1, 'УП-01.001',  55,   1,   'см'),
    ('КЛ-01.001-01', 1, 'УП-01.002',  2,    1,   'шт'),
    ('ПК-01.003',    1, 'ПФ-01.001',  380,  1,   'г'),
    ('ПК-01.003',    1, 'УП-01.001',  30,   1,   'см'),
    ('ПК-01.003',    1, 'УП-01.002',  2,    1,   'шт'),
    ('ПК-01.001',    1, 'ПФ-01.001',  360,  1,   'г'),
    ('ПК-01.001',    1, 'УП-01.001',  28,   1,   'см'),
    ('ПК-01.001',    1, 'УП-01.002',  2,    1,   'шт')
) v(designation, position_no, material_designation, quantity, per_quantity, unit_symbol)
JOIN product p          ON p.designation = v.designation
JOIN route r            ON r.product_id = p.id AND r.route_no = 1
JOIN route_operation ro ON ro.route_id = r.id AND ro.position_no = v.position_no
JOIN product m          ON m.designation = v.material_designation
JOIN unit u             ON u.symbol = v.unit_symbol
ON CONFLICT (route_operation_id, product_id) DO NOTHING;

-- Фиксируем версию схемы
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
);

DELETE FROM schema_version;
INSERT INTO schema_version (version) VALUES (3);
