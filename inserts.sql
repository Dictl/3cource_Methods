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

CREATE TRIGGER trg_check_numeric_constraint
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
CREATE MATERIALIZED VIEW mv_parameter_aggregates AS
SELECT * FROM v_parameter_aggregates;

-- Уникальный индекс для быстрого обновления
CREATE UNIQUE INDEX mv_parameter_aggregates_pk ON mv_parameter_aggregates (classifier_node_id, parameter_definition_id);

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

CREATE TRIGGER trg_check_parameter_belongs
BEFORE INSERT OR UPDATE ON product_parameter_value
FOR EACH ROW
EXECUTE FUNCTION check_parameter_belongs_to_product_class();

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

INSERT INTO enum_value (enum_definition_id, value_str, value_int, value_real, sort_order) VALUES
    (1, 'Гомогенная',    NULL, NULL, 1),
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
ON CONFLICT (id) DO NOTHING;

INSERT INTO product_attribute_value (product_id, enum_value_id) VALUES
    (1, (SELECT id FROM enum_value WHERE enum_definition_id = 1 AND value_str = 'Гомогенная')),
    (1, (SELECT id FROM enum_value WHERE enum_definition_id = 3 AND value_str = 'Целлофан')),
    (3, (SELECT id FROM enum_value WHERE enum_definition_id = 3 AND value_str = 'Со шпиком')),
    (3, (SELECT id FROM enum_value WHERE enum_definition_id = 1 AND value_str = 'Целлофан'));

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
SELECT 3, 'Порода древесины', NULL, 'str', 3 FROM unit WHERE symbol='сут'  -- единица не используется
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
