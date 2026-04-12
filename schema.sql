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
    sku                 VARCHAR (100) UNIQUE,
    name                TEXT NOT NULL,
    created_at          TIMESTAMP DEFAULT NOW(),
	price 				INTEGER NOT NULL,
	supplier			TEXT NOT NULL,
	weight_gram			INTEGER NOT NULL
);

INSERT INTO classifier_node (id, parent_id, name, unit, sort_order)
VALUES 
(
	1, NULL, 'Колбасное изделие', 'грамм', 0
),
(
	2, 1, 'Варёные',  'грамм', 1
),
(
	3, 1, 'Копчёные',  'грамм', 2
),
(
	4, 1, 'Цельномышечные',  'грамм', 3
),
(
	5, 2, 'Варёная колбаса',  'грамм', 1
),
(
	6, 2, 'Ливерные продукты',  'грамм', 2
),
(
	7, 3, 'Варёно-копчёные',  'грамм', 1
),
(
	8, 3, 'Полу-копчёные',  'грамм', 2
),
(
	9, 3, 'Сырокопчёные',  'грамм', 3
),
(
	10, 4, 'Ветчина',  'грамм', 1
),
(
	11, 4, 'Карбонат',  'грамм', 2
),
(
	12, 5, 'Высшего сорта',  'грамм', 1
),
(
	13, 5, 'Сосиски/сардельки',  'грамм', 2
),
(
	14, 5, 'Зельц',  'грамм', 3
),
(
	15, 6, 'Ливерная колбаса',  'грамм', 1
),
(
	16, 6, 'Паштет',  'грамм', 2
),
(
	17, 9, 'Салями',  'грамм', 1
),
(
	18, 9, 'Чоризо',  'грамм', 2
),
(
	19, 10, 'Ветчина варёная',  'грамм', 1
),
(
	20, 10, 'Буженина',  'грамм', 2
) ON CONFLICT (id) DO NOTHING;

INSERT INTO product (id, classifier_node_id, sku, name, price, supplier, weight_gram) 
VALUES (
	1, 5, "Колбаса варёная Клинский Докторская категория А", "Колбаса докторская Клинская", 499, "ОАО «Мясокомбинат Клинский»", 400
), 
(
	2, 5, "«Докторская» ГОСТ, колбаса вареная в целлофане", "Колбаса варёная", 1238, "«Окраина»", 1150
), 
(
	3, 5, "«Любительская» ГОСТ, колбаса вареная", "Колбаса варёная", 158, "«Раменский деликатес»", 200
), 
(
	4, 15, "Колбаса ливерная «Ближние Горки» Яичная ГОСТ", "Колбаса ливерная «Ближние Горки» Яичная", 139, "ОАО «Мясокомбинат Клинский»", 300
), 
(
	5, 15, "Колбаса «Атяшево» Ливерная Печеночная", "Колбаса ливерная печеночная", 100, "«Атяшево»", 250
), 
(
	6, 15, "Колбаса ливерная «Микоян» Традиционная", "Колбаса ливерная традиционная", 113, "«Раменский деликатес»", 400
) ON CONFLICT (id) DO NOTHING;


