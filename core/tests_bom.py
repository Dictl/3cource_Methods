"""Тесты спецификации (BOM) на реальной схеме PostgreSQL.

Схема грузится напрямую из schema.sql: таблицы core создаёт она, а не миграции.
"""
import psycopg2
from django.conf import settings
from django.db import connection
from django.test import TestCase

from core.models import BomChange, BomChangeLog, BomItem, Product, Unit
from core.service import (
    calc_bom,
    create_bom_item,
    delete_bom_item,
    list_bom_items,
    search_delete_product,
    update_bom_item,
)

SCHEMA_FILE = settings.BASE_DIR / 'schema.sql'

# Изделия из демонстрационных данных schema.sql
BASE_PRODUCT = 1       # Колбаса докторская Клинская 400 г
MODIFICATION = 16      # Колбаса докторская Клинская 800 г (модификация изделия 1)
FARSH = 14             # Фарш «Докторский»
FARSH_NODE = 25        # Классификатор полуфабрикатов
BEEF, PORK, MILK, SALT, NUTMEG, CASING, CLIPS = 7, 8, 9, 10, 11, 12, 13


def _calc(product_id, quantity=1000):
    return {row["component_id"]: row for row in calc_bom(product_id, quantity)}


def _num(value):
    """NUMERIC из БД приходит как Decimal: для сравнения с ожидаемыми числами приводим к float"""
    return float(value)


class BomTestCase(TestCase):
    @classmethod
    def setUpClass(cls):
        # schema.sql рассчитан на пустую базу: он создаёт таблицы и сиды целиком.
        # В тестовой базе уже есть таблицы из миграций, а загрузка идёт в транзакции,
        # поэтому чистим схему и грузим файл отдельным соединением в autocommit.
        cls._load_schema()
        super().setUpClass()

    @staticmethod
    def _load_schema():
        db = settings.DATABASES["default"]
        conn = psycopg2.connect(
            dbname=connection.settings_dict["NAME"],
            user=db["USER"], password=db["PASSWORD"],
            host=db["HOST"] or None, port=db["PORT"] or None,
        )
        conn.autocommit = True
        try:
            with conn.cursor() as cursor:
                cursor.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
                cursor.execute(SCHEMA_FILE.read_text(encoding="utf-8"))
        finally:
            conn.close()

    def setUp(self):
        # Каждый тест откатывается Django (TestCase), данные остаются исходными
        self.calc = _calc(BASE_PRODUCT)


class CalcBomTests(BomTestCase):
    def test_base_product_norms(self):
        self.assertEqual(_num(self.calc[BEEF]["total_quantity"]), 110)
        self.assertEqual(_num(self.calc[PORK]["total_quantity"]), 308)
        self.assertEqual(_num(self.calc[MILK]["total_quantity"]), 8.8)
        self.assertEqual(_num(self.calc[SALT]["total_quantity"]), 9.24)
        self.assertEqual(_num(self.calc[NUTMEG]["total_quantity"]), 0.22)
        self.assertEqual(_num(self.calc[CASING]["total_quantity"]), 320)
        self.assertEqual(self.calc[CASING]["unit"], "м")
        self.assertEqual(_num(self.calc[CLIPS]["total_quantity"]), 2000)
        self.assertEqual(self.calc[CLIPS]["unit"], "шт")

    def test_base_product_total_cost(self):
        total = sum(_num(row["total_cost"]) for row in _calc(BASE_PRODUCT).values())
        self.assertEqual(total, 217870.40)

    def test_modification_norms(self):
        calc_mod = _calc(MODIFICATION)
        self.assertEqual(_num(calc_mod[BEEF]["total_quantity"]), 220)
        self.assertEqual(_num(calc_mod[PORK]["total_quantity"]), 616)
        self.assertEqual(_num(calc_mod[CASING]["total_quantity"]), 550)

    def test_modification_total_cost(self):
        total = sum(_num(row["total_cost"]) for row in _calc(MODIFICATION).values())
        self.assertEqual(total, 430590.80)


class ChangeJournalTests(BomTestCase):
    def test_edit_bom_item_links_change_and_log(self):
        item = BomItem.objects.get(parent_product_id=BASE_PRODUCT, component_id=CASING)
        changes_before = BomChange.objects.filter(product_id=BASE_PRODUCT).count()

        update_bom_item(item.id, quantity=40, author="tester", change_description="Удлинена оболочка")

        change = BomChange.objects.filter(product_id=BASE_PRODUCT).order_by("-change_no").first()
        self.assertEqual(BomChange.objects.filter(product_id=BASE_PRODUCT).count(), changes_before + 1)
        self.assertEqual(change.description, "Удлинена оболочка")
        self.assertEqual(change.author, "tester")

        log = BomChangeLog.objects.filter(parent_product_id=BASE_PRODUCT, component_id=CASING).latest("id")
        self.assertEqual(log.change_id, change.id)
        self.assertEqual(log.operation, "update")
        self.assertEqual(float(log.new_quantity), 40.0)
        self.assertEqual(log.changed_by, "tester")

    def test_created_item_log_has_author_and_change(self):
        item = create_bom_item(
            parent_product_id=BASE_PRODUCT,
            component_id=NUTMEG,
            quantity=1,
            per_quantity=1,
            unit_id=BomItem.objects.get(parent_product_id=FARSH, component_id=NUTMEG).unit_id,
            author="tester",
        )
        log = BomChangeLog.objects.filter(parent_product_id=BASE_PRODUCT, component_id=NUTMEG).latest("id")
        self.assertEqual(log.operation, "add")
        self.assertIsNotNone(log.change_id)
        self.assertEqual(log.changed_by, "tester")
        self.assertEqual(log.change_id, BomChange.objects.get(product_id=BASE_PRODUCT, change_no=BomChange.objects.filter(product_id=BASE_PRODUCT).count()).id)

        delete_bom_item(item.id, author="tester")
        removed = BomChangeLog.objects.filter(parent_product_id=BASE_PRODUCT, component_id=NUTMEG).latest("id")
        self.assertEqual(removed.operation, "remove")
        self.assertEqual(removed.changed_by, "tester")

    def test_new_position_gets_next_number(self):
        unit_id = BomItem.objects.get(parent_product_id=FARSH, component_id=NUTMEG).unit_id
        item = create_bom_item(BASE_PRODUCT, NUTMEG, 1, 1, unit_id, author="tester")
        max_before = BomItem.objects.filter(parent_product_id=BASE_PRODUCT).exclude(id=item.id).order_by("-position_no").first()
        self.assertEqual(item.position_no, max_before.position_no + 1)


class PropagationTests(BomTestCase):
    def test_add_to_base_adds_base_row_to_modification(self):
        unit_id = BomItem.objects.get(parent_product_id=FARSH, component_id=MILK).unit_id

        create_bom_item(BASE_PRODUCT, MILK, 1, 100, unit_id, author="tester")

        propagated = BomItem.objects.get(parent_product_id=MODIFICATION, component_id=MILK)
        self.assertTrue(propagated.is_base)
        self.assertEqual(propagated.quantity, 1)
        self.assertEqual(propagated.per_quantity, 100)

    def test_inherited_row_shows_base_norms(self):
        unit_id = BomItem.objects.get(parent_product_id=FARSH, component_id=MILK).unit_id
        create_bom_item(BASE_PRODUCT, MILK, 5, 100, unit_id, author="tester")

        rows = {row["component_id"]: row for row in list_bom_items(MODIFICATION)}
        self.assertTrue(rows[MILK]["is_base"])
        self.assertEqual(float(rows[MILK]["quantity"]), 5.0)
        self.assertEqual(rows[MILK]["component_name"], "Молоко сухое обезжиренное")
        self.assertEqual(rows[MILK]["unit_symbol"], "кг")


class ValidationTests(BomTestCase):
    def test_cycle_is_rejected_with_db_message(self):
        # Нужны два изделия в одной размерности (кг), иначе проверку размерности
        # срабатывает раньше проверки цикла и текст ошибки будет про ЕИ
        mass_unit = Unit.objects.get(symbol="кг")
        first = Product.objects.create(
            name="Цикл A", classifier_node_id=FARSH_NODE, price=1, supplier="test",
            weight_gram=1, product_type_id="part", unit_id=mass_unit.id,
        )
        second = Product.objects.create(
            name="Цикл B", classifier_node_id=FARSH_NODE, price=1, supplier="test",
            weight_gram=1, product_type_id="part", unit_id=mass_unit.id,
        )
        create_bom_item(first.id, second.id, 1, 1, mass_unit.id, author="tester")

        with self.assertRaises(ValueError) as ctx:
            create_bom_item(second.id, first.id, 1, 1, mass_unit.id, author="tester")

        self.assertIn("цикл", str(ctx.exception))

    def test_wrong_dimension_is_rejected_with_db_message(self):
        length_unit = BomItem.objects.get(parent_product_id=BASE_PRODUCT, component_id=CASING).unit_id

        with self.assertRaises(ValueError) as ctx:
            create_bom_item(BASE_PRODUCT, NUTMEG, 1, 1, length_unit, author="tester")

        self.assertIn("размерности", str(ctx.exception))

    def test_no_change_left_after_failed_edit(self):
        changes_before = BomChange.objects.filter(product_id=FARSH).count()
        item = BomItem.objects.get(parent_product_id=FARSH, component_id=BEEF)
        wrong_unit = BomItem.objects.get(parent_product_id=BASE_PRODUCT, component_id=CASING).unit_id

        with self.assertRaises(ValueError):
            update_bom_item(item.id, unit_id=wrong_unit, author="tester")

        self.assertEqual(BomChange.objects.filter(product_id=FARSH).count(), changes_before)
        item.refresh_from_db()
        self.assertNotEqual(item.unit_id, wrong_unit)


class ProductDeletionTests(BomTestCase):
    def test_delete_component_of_bom_is_rejected(self):
        with self.assertRaises(ValueError) as ctx:
            search_delete_product(BEEF)

        self.assertIn("состав", str(ctx.exception))
        self.assertTrue(Product.objects.filter(id=BEEF).exists())

    def test_delete_base_product_is_rejected(self):
        # Изделие 1 — базовое для модификации 16, поэтому удаление запрещено;
        # сообщение может прийти и от проверки вхождения в состав набора 15.
        with self.assertRaises(ValueError) as ctx:
            search_delete_product(BASE_PRODUCT)

        self.assertIn("Нельзя удалить товар", str(ctx.exception))
        self.assertTrue(Product.objects.filter(id=BASE_PRODUCT).exists())
