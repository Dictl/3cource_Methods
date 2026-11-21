BEGIN;
DO $$
DECLARE
    v_product INTEGER;
    v_operation INTEGER;
    v_material INTEGER;
    v_before NUMERIC;
    v_after NUMERIC;
BEGIN
    SELECT id INTO v_product FROM product WHERE designation = 'КЛ-01.001';
    SELECT ro.id, m.product_id INTO v_operation, v_material
    FROM route_operation ro JOIN route r ON r.id = ro.route_id
    JOIN route_operation_material m ON m.route_operation_id = ro.id
    WHERE r.product_id = v_product AND m.product_id = (SELECT id FROM product WHERE designation = 'УП-01.001');

    IF NOT EXISTS (SELECT 1 FROM mr_q(v_operation, 1000) WHERE component_id = v_material AND total_quantity = 320) THEN
        RAISE EXCEPTION 'Неверная норма материала операции';
    END IF;
    SELECT total_cost INTO v_before FROM calc_cost(v_product, 1000);
    IF NOT EXISTS (SELECT 1 FROM sum_mr(v_product, 1000) WHERE component_id = v_material AND total_quantity = 320) THEN
        RAISE EXCEPTION 'Материал операции отсутствует в своде';
    END IF;
    UPDATE route_operation_material SET quantity = quantity * 2
    WHERE route_operation_id = v_operation AND product_id = v_material;
    SELECT total_cost INTO v_after FROM calc_cost(v_product, 1000);
    IF v_after <= v_before THEN
        RAISE EXCEPTION 'Стоимость не зависит от нормы операции';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM sum_mr((SELECT id FROM product WHERE designation = 'ПК-01.001'), 1000)
                   WHERE component_id = (SELECT id FROM product WHERE designation = 'СР-01.001')) THEN
        RAISE EXCEPTION 'Нормы изготовленного полуфабриката не развёрнуты';
    END IF;
END $$;
ROLLBACK;
