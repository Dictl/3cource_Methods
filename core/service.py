from decimal import Decimal
from math import isfinite
from core.models import (
    ClassifierNode,
    Product,
    EnumDefinition,
    EnumValue,
    ProductAttributeValue,
    UnitDimension,
    Unit,
    ProductParameterValue,
    ParameterDefinition,
    BomChange,
    BomItem,
    OperationClass,
    WorkCenterGroup,
    Profession,
    Tooling,
)
from core.models import Route, RouteOperation, RouteOperationTool, RouteOperationMaterial
from django.db import IntegrityError
from django.db import connection, transaction, DatabaseError
from django.db.models import Q
from typing import Optional

#############################################КЛАССИФИКАТОР#############################################
"Получение всего classifier_node"
def base_output():
    return list(ClassifierNode.objects.all())

"Получение всего product"
def base_product_output():
    return list(Product.objects.all())

"Создаст ли перемещение classifier_node цикл"
def would_create_cycle(all_base, node_id, new_parent_id):
    if new_parent_id is None:
        return False

    node_id = int(node_id)
    new_parent_id = int(new_parent_id)

    if node_id == new_parent_id:
        return True

    stack = [node_id]
    visited = set()

    while stack:
        current = stack.pop()
        if current in visited:
            continue
        visited.add(current)

        for node in all_base:
            if node.parent_id == current:
                if node.id == new_parent_id:
                    return True
                stack.append(node.id)

    return False

"Добавление к classifier_node level. level - нужен для древовидного вывода"
def build_tree_with_levels(all_base, p_id=None, current_level=0):
    result_with_levels = []

    for element in all_base:
        if element.parent_id == p_id:
            element.level = current_level
            result_with_levels.append(element)
            children = build_tree_with_levels(all_base, element.id, current_level + 1)
            result_with_levels.extend(children)

    return result_with_levels

"Поиск всех потомков"
def search_child_nodes(all_base, node_id):
    result_children = []

    for element in all_base:
        if element.parent_id == node_id:
            result_children.append(element)
            result_children.extend(search_child_nodes(all_base, element.id))

    return result_children

"есть ли дети?"
def has_children(all_base, node_id):
    for element in all_base:
        if element.parent_id == node_id:
            return True
    return False

"Ищет все терминальные узлы в поддереве (включая сам узел и его потомков)"
def display_terminal_nodes(all_base, node_id):
    terminal_nodes = []
    for element in all_base:
        if element.id == node_id or (element.parent_id == node_id and not has_children(all_base, element.id)):
            terminal_nodes.append(element)

    return terminal_nodes

"Ищет все продукты"
def display_parent_product(all_base, all_base_product, node_id):
    selected_category = None
    result_product = []

    for element in all_base:
        if element.id == node_id:
            selected_category = element.name
            break

    child_ids = {child.id for child in search_child_nodes(all_base, node_id)} | {node_id}

    for product in all_base_product:
        if product.classifier_node_id in child_ids:
            result_product.append(product)

    return selected_category, result_product

"Поиск всех родителей"
def search_parent_nodes(all_base, node_id):
    result_parents = []
    current_category = None

    for element in all_base:
        if element.id == int(node_id):
            current_category = element
            break

    if current_category is None:
        return result_parents

    while current_category.parent_id is not None:
        for element in all_base:
            if element.id == current_category.parent_id:
                result_parents.append(element)
                current_category = element
                break

    return result_parents

"Добавление еще одной категории в classifier_node. Нельзя добавить с таким же имененм, к терминальному узлу"
def add_category(name, parent_id, unit, base_unit_id=None):
    if ClassifierNode.objects.filter(name=name).exists():
        raise ValueError(f"Категория с именем '{name}' уже существует")

    if parent_id is not None:
        if Product.objects.filter(classifier_node_id=parent_id).exists():
            raise ValueError("Нельзя добавить подкатегорию к терминальному узлу, содержащему товары")

    last_sort = ClassifierNode.objects.filter(parent_id=parent_id).order_by('-sort_order').first()
    next_sort_order = (last_sort.sort_order + 1) if last_sort else 0

    new_category = ClassifierNode(
        name=name,
        parent_id=parent_id,
        unit=unit,
        base_unit_id=base_unit_id,
        sort_order=next_sort_order
    )
    new_category.save()
    return new_category

"Добавление еще одной продукта в product. Нельзя добавить с таким же имененм, sku и к нетерминальному узлу"
"Добавление еще одного продукта в product. Нельзя добавить с таким же имененм, sku и к нетерминальному узлу"
def add_product(name, category_id, sku, price, supplier, weight_gram,
                designation=None, product_type_code="part", unit_id=None):
    if Product.objects.filter(name=name).exists():
        raise ValueError(f"Товар с именем '{name}' уже существует")

    if sku and Product.objects.filter(sku=sku).exists():
        raise ValueError(f"Товар с SKU '{sku}' уже существует")

    if ClassifierNode.objects.filter(parent_id=category_id).exists():
        raise ValueError("Нельзя добавить товар к нетерминальному узлу, содержащему подкатегории")

    product_type_code = (product_type_code or "part").strip()
    if product_type_code not in ("material", "purchased", "part", "assembly", "kit", "complex"):
        raise ValueError("Некорректный тип изделия")

    designation = (designation or "").strip() or None
    if designation and Product.objects.filter(designation__iexact=designation).exists():
        raise ValueError(f"Изделие с обозначением '{designation}' уже существует")

    if unit_id in (None, ""):
        unit_id = None
    else:
        unit_id = int(unit_id)
        if not Unit.objects.filter(id=unit_id).exists():
            raise ValueError("Нет такой единицы измерения")

    new_product = Product(
        name=name,
        classifier_node_id=category_id,
        sku=sku,
        price=price,
        supplier=supplier,
        weight_gram=weight_gram,
        designation=designation,
        product_type_id=product_type_code,   # если в модели поле называется product_type (FK по коду)
        unit_id=unit_id,
    )
    new_product.save()
    _apply_class_parameter_defaults(new_product)
    return new_product

"Значения параметров по умолчанию для новых товаров веток «Сырьё и материалы», «Полуфабрикаты», «Наборы»"
_CLASS_PARAMETER_DEFAULTS = {
    21: {"Массовая доля влаги": ("real", 68),
         "Срок хранения": ("int", 30),
         "Температура хранения": ("real", 2)},
    24: {"Длина единицы": ("real", 1),
         "Количество в упаковке": ("int", 1)},
    25: {"Выход полуфабриката": ("real", 98),
         "Срок хранения": ("int", 30)},
    26: {"Количество изделий": ("int", 2)},
}

def _apply_class_parameter_defaults(product):
    node_ids = [n.id for n in search_parent_nodes(base_output(), product.classifier_node_id)]
    node_ids.append(product.classifier_node_id)

    for node_id in node_ids:
        for param_name, (vtype, value) in _CLASS_PARAMETER_DEFAULTS.get(node_id, {}).items():
            pd = ParameterDefinition.objects.filter(
                classifier_node_id=node_id, name=param_name
            ).first()
            if pd is None:
                continue
            defaults = {"value_int": value} if vtype == "int" else {"value_real": value}
            ProductParameterValue.objects.get_or_create(
                product_id=product.id,
                parameter_definition_id=pd.id,
                defaults=defaults,
            )

    # масса набора считается от веса товара
    if 26 in node_ids:
        pd = ParameterDefinition.objects.filter(classifier_node_id=26, name="Масса набора").first()
        if pd:
            ProductParameterValue.objects.get_or_create(
                product_id=product.id, parameter_definition_id=pd.id,
                defaults={"value_real": product.weight_gram / 1000},
            )

"рекурсивное удаление категории(classifier_node)"
def search_delete_category(delete_id):
    delete_id = int(delete_id)
    all_base = base_output()

    # Вся ветка: сама вершина и все потомки
    descendants = {delete_id}
    stack = [delete_id]
    while stack:
        current_id = stack.pop()
        for node in all_base:
            if node.parent_id == current_id and node.id not in descendants:
                descendants.add(node.id)
                stack.append(node.id)

    # Проверка на наличие товаров в поддереве
    if Product.objects.filter(classifier_node_id__in=descendants).exists():
        raise ValueError("Нельзя удалить категорию, содержащую товары")

    # Удаляем связанные сущности (вся ветка)
    param_ids = list(ParameterDefinition.objects.filter(classifier_node_id__in=descendants)
                     .values_list('id', flat=True))
    if param_ids:
        ProductParameterValue.objects.filter(parameter_definition_id__in=param_ids).delete()
        ParameterNumericConstraint.objects.filter(parameter_definition_id__in=param_ids).delete()
        ParameterDefinition.objects.filter(id__in=param_ids).delete()

    enum_def_ids = list(EnumDefinition.objects.filter(classifier_node_id__in=descendants)
                        .values_list('id', flat=True))
    if enum_def_ids:
        enum_value_ids = list(EnumValue.objects.filter(enum_definition_id__in=enum_def_ids)
                              .values_list('id', flat=True))
        if enum_value_ids:
            ProductAttributeValue.objects.filter(enum_value_id__in=enum_value_ids).delete()
            ProductParameterValue.objects.filter(value_enum_id__in=enum_value_ids).delete()
            EnumValue.objects.filter(id__in=enum_value_ids).delete()
        EnumDefinition.objects.filter(id__in=enum_def_ids).delete()

    # Удаляем все вершины в глубинном порядке (дети -> родитель)
    children_map = {}
    for node in all_base:
        if node.id in descendants and node.parent_id in descendants:
            children_map.setdefault(node.parent_id, []).append(node.id)

    ordered = []
    visited = set()

    def visit(node_id):
        if node_id in visited:
            return
        visited.add(node_id)
        for child_id in children_map.get(node_id, []):
            visit(child_id)
        ordered.append(node_id)

    visit(delete_id)

    for node_id in ordered:
        ClassifierNode.objects.filter(id=node_id).delete()

"Удаляет продукт. Нельзя удалить изделие, которое входит в чей-то состав или служит базовым для модификаций"
def search_delete_product(delete_id):
    delete_id = int(delete_id)

    try:
        with transaction.atomic():
            product = Product.objects.filter(id=delete_id).first()
            if product is None:
                raise ValueError(f"Товар с id '{delete_id}' не найден")

            if BomItem.objects.filter(component_id=delete_id).exists():
                parents = list(
                    Product.objects.filter(bom_items__component_id=delete_id)
                    .order_by('id')
                    .values_list('name', flat=True)
                )
                raise ValueError(
                    "Нельзя удалить товар: он входит в состав изделий «"
                    + "», «".join(parents) + "»"
                )

            if Product.objects.filter(base_product_id=delete_id).exists():
                raise ValueError("Нельзя удалить товар: он является базовым изделием для модификаций")

            product.delete()
    except DatabaseError as e:
        raise ValueError(_db_message(e)) from e

"Перемещение к другой вершине (смена родителя)"
def move_category(category_id, new_parent_id):
    category_id = int(category_id)
    if new_parent_id is not None:
        new_parent_id = int(new_parent_id)

    all_nodes = base_output()

    if would_create_cycle(all_nodes, category_id, new_parent_id):
        raise ValueError("Нельзя переместить вершину в саму себя или в своего потомка (цикл)")

    for element in all_nodes:
        if element.id == category_id:
            element.parent_id = new_parent_id

            siblings = [e for e in all_nodes if e.parent_id == new_parent_id and e.id != category_id]
            element.sort_order = (max(s.sort_order for s in siblings) + 1) if siblings else 0
            element.save()
            break

"Изменение порядка среди братьев (на том же уровне)"
def reorder_category(category_id, target_position_id):
    category_id = int(category_id)
    all_base = base_output()

    current = None
    for e in all_base:
        if e.id == category_id:
            current = e
            break

    if current is None:
        raise ValueError(f"Категория с id '{category_id}' не найдена")

    siblings = sorted(
        [e for e in all_base if e.parent_id == current.parent_id and e.id != current.id],
        key=lambda x: x.sort_order
    )

    if target_position_id is None or target_position_id == '':
        new_order = [current] + siblings
    else:
        target_position_id = int(target_position_id)
        target_index = next((i for i, s in enumerate(siblings) if s.id == target_position_id), -1)

        if target_index == -1:
            new_order = siblings + [current]
        else:
            new_order = siblings[:target_index + 1] + [current] + siblings[target_index + 1:]

    for index, cat in enumerate(new_order):
        cat.sort_order = index
        cat.save()

#############################################ПЕРЕЧИСЛЕНИЯ#############################################

"получение enum_value при выборе enum_definition"
def get_enum_definition_with_values(enum_definition_id):
    try:
        enum_def = EnumDefinition.objects.get(id=int(enum_definition_id))
    except EnumDefinition.DoesNotExist:
        raise ValueError("EnumDefinition не найден")

    values = list(EnumValue.objects.filter(enum_definition_id=enum_def.id).order_by("sort_order"))

    return enum_def, values

"получение enum_definition и enum_value вместе"
def get_all_enums_with_values():
    enum_defs = list(EnumDefinition.objects.order_by("id"))

    all_values = list(EnumValue.objects.order_by("enum_definition_id", "sort_order"))

    values_by_def_id = {}
    for v in all_values:
        values_by_def_id.setdefault(v.enum_definition_id, []).append(v)

    result = []
    for ed in enum_defs:
        result.append({
            "enum_definition": ed,
            "values": values_by_def_id.get(ed.id, []),
        })

    return result

"Изменение порядка среди enum_value"
def reorder_enum_value(enum_value_id, target_position_id):
    enum_value_id = int(enum_value_id)

    current = EnumValue.objects.get(id=enum_value_id)
    enum_def_id = current.enum_definition_id

    siblings = list(
        EnumValue.objects
        .filter(enum_definition_id=enum_def_id)
        .exclude(id=current.id)
        .order_by("sort_order", "id")
    )

    if target_position_id is None or target_position_id == '':
        new_order = [current] + siblings
    else:
        target_position_id = int(target_position_id)

        target_index = next((i for i, s in enumerate(siblings) if s.id == target_position_id), -1)

        if target_index == -1:
            new_order = siblings + [current]
        else:
            new_order = siblings[:target_index + 1] + [current] + siblings[target_index + 1:]

    for index, ev in enumerate(new_order, start=1):
        if ev.sort_order != index:
            ev.sort_order = index
            ev.save(update_fields=["sort_order"])

"нет такого enum_value в enum_definition"
def validity_check_for_enum_value(enum_definition_id, value_str):
    enum_definition_id = int(enum_definition_id)
    value = (value_str or "").strip()
    if not value:
        return False

    return not EnumValue.objects.filter(enum_definition_id=enum_definition_id,value_str__iexact=value,).exists()

" вообще нет такого enum_definition"
def validity_check_for_enum_definition(description):
    desc = (description or "").strip()
    if not desc:
        return False

    return not EnumDefinition.objects.filter(description__iexact=desc).exists()

"Создание нового перечисления (EnumDefinition) для категории"
def create_enum_definition(classifier_node_id, description):
    classifier_node_id = int(classifier_node_id)
    desc = (description or "").strip()

    if not validity_check_for_enum_definition(desc):
        raise ValueError("Недопустимое description: пустое или такое перечисление уже существует")

    if not ClassifierNode.objects.filter(id=classifier_node_id).exists():
        raise ValueError(f"ClassifierNode с id={classifier_node_id} не найден")

    if EnumDefinition.objects.filter(classifier_node_id=classifier_node_id).exists():
        raise ValueError("Для этой вершины уже существует перечисление (EnumDefinition)")

    last = EnumDefinition.objects.order_by("-id").first()
    new_id = (last.id + 1) if last else 1

    enum_def = EnumDefinition(
        id=new_id,
        classifier_node_id=classifier_node_id,
        description=desc,
    )
    enum_def.save(force_insert=True)

    return enum_def

"Добавление нового значения enum_value в перечисление enum_definition"
def add_enum_value(enum_definition_id, value_str=None, value_int=None, value_real=None):
    enum_definition_id = int(enum_definition_id)
    value = (value_str or "").strip()

    if not EnumDefinition.objects.filter(id=enum_definition_id).exists():
        raise ValueError("нет такого enum_definition")

    if not validity_check_for_enum_value(enum_definition_id, value):
        raise ValueError("value_str уже существует в этом enum_definition или пустое")

    last_in_def = (
        EnumValue.objects
        .filter(enum_definition_id=enum_definition_id)
        .order_by("-sort_order", "-id")
        .first()
    )
    new_sort_order = (last_in_def.sort_order + 1) if last_in_def else 1

    last_global = EnumValue.objects.order_by("-id").first()
    new_id = (last_global.id + 1) if last_global else 1  # если таблица пустая

    enum_value = EnumValue(
        id=new_id,
        enum_definition_id=enum_definition_id,
        value_str=value,
        value_int=value_int,
        value_real=value_real,
        sort_order=new_sort_order,
    )
    enum_value.save(force_insert=True)

    return enum_value

"удаление enum_value"
def delete_enum_value(enum_value_id):
    enum_value_id = int(enum_value_id)

    ev = EnumValue.objects.filter(id=enum_value_id).first()
    if ev is None:
        raise ValueError("Нет такого enum_value")

    ev.delete()


def update_enum_value(enum_value_id, value_str=None, value_int=None, value_real=None):
    ev = EnumValue.objects.filter(id=int(enum_value_id)).first()
    if ev is None:
        raise ValueError("Нет такого enum_value")
    if value_str is not None:
        value_str = value_str.strip()
        if not value_str:
            raise ValueError("Значение не может быть пустым")
        if EnumValue.objects.filter(
            enum_definition_id=ev.enum_definition_id,
            value_str__iexact=value_str
        ).exclude(id=ev.id).exists():
            raise ValueError("Такое значение уже существует")
        ev.value_str = value_str
    ev.value_int = value_int
    ev.value_real = value_real
    ev.save()
    return ev

"удаление enum_definition, только если у него нет enum_value"
def delete_enum_definition(enum_definition_id):
    enum_definition_id = int(enum_definition_id)

    enum_def = EnumDefinition.objects.filter(id=enum_definition_id).first()
    if enum_def is None:
        raise ValueError("Нет такого enum_definition")

    if EnumValue.objects.filter(enum_definition_id=enum_definition_id).exists():
        raise ValueError("Нельзя удалить перечисление, если у него существуют значения (enum_value)")

    enum_def.delete()

"поиск всех перечислений(своих и детей)"
def enum_definitions_for_class_tree(classifier_node_id):
    classifier_node_id = int(classifier_node_id)

    all_base = base_output()

    if not any(n.id == classifier_node_id for n in all_base):
        raise ValueError(f"ClassifierNode с id={classifier_node_id} не найден")

    descendants = search_child_nodes(all_base, classifier_node_id)
    node_ids = [classifier_node_id] + [n.id for n in descendants]

    enum_defs = list(EnumDefinition.objects.filter(classifier_node_id__in=node_ids)
        .order_by("classifier_node_id", "id"))

    return enum_defs

"заполнение таблицы атрибутов product_attribute_values"
def assign_enum_value_to_product(product_id, enum_value_id=None):
    product_id = int(product_id)

    if not Product.objects.filter(id=product_id).exists():
        raise ValueError("Нет такого product")

    # enum_value может быть NULL
    if enum_value_id is not None:
        enum_value_id = int(enum_value_id)

        if not EnumValue.objects.filter(id=enum_value_id).exists():
            raise ValueError("Нет такого enum_value")
    else:
        enum_value_id = None

    last = ProductAttributeValue.objects.order_by("-id").first()
    new_id = (last.id + 1) if last else 1

    pav = ProductAttributeValue(
        id=new_id,
        product_id=product_id,
        enum_value_id=enum_value_id,  # может быть NULL
    )
    pav.save(force_insert=True)

    return pav

"получение всех product_attribute_values"
def product_attribute_values_output():
    return list(ProductAttributeValue.objects.all())

"вывод характеристик для товара"
def get_product_enums(product_id):
    pavs = (
        ProductAttributeValue.objects
        .filter(product_id=product_id)
        .select_related('enum_value__enum_definition')
        .order_by('enum_value__enum_definition__id', 'enum_value__sort_order')
    )

    result = []
    for pav in pavs:
        enum_val = pav.enum_value
        enum_def = enum_val.enum_definition if enum_val else None
        if enum_val and enum_def:
            result.append({
                'id': pav.id,
                'enum_definition': {
                    'id': enum_def.id,
                    'description': enum_def.description,
                    'values': [{
                        'id': value.id,
                        'value_str': value.value_str,
                        'value_int': value.value_int,
                        'value_real': value.value_real,
                    } for value in EnumValue.objects.filter(
                        enum_definition_id=enum_def.id
                    ).order_by('sort_order', 'id')],
                },
                'enum_value': {
                    'id': enum_val.id,
                    'value_str': enum_val.value_str,
                    'value_int': enum_val.value_int,
                    'value_real': enum_val.value_real,
                    'sort_order': enum_val.sort_order,
                }
            })
    return result

"удаление product_attribute_values по id самого атрибута"
def delete_product_attribute(attribute_id):
    attribute_id = int(attribute_id)
    elem = ProductAttributeValue.objects.filter(id=attribute_id).first()
    if elem is None:
        raise ValueError("Нет такого product_attribute")
    elem.delete()

def update_product_attribute(attribute_id, enum_value_id):
    attribute_id = int(attribute_id)
    enum_value_id = int(enum_value_id)
    attribute = ProductAttributeValue.objects.filter(id=attribute_id).first()
    if attribute is None:
        raise ValueError("Нет такого product_attribute")
    if not EnumValue.objects.filter(id=enum_value_id).exists():
        raise ValueError("Нет такого enum_value")
    attribute.enum_value_id = enum_value_id
    attribute.save(update_fields=["enum_value"])
    return attribute

#############################################СПРАВОЧНИК#############################################

"получение всех parameter_definition"
def get_all_parameter_definition():
    return list(ParameterDefinition.objects.all())

"Получение параметров категории с учетом наследования от родителей"
def get_class_parameters_with_inheritance(classifier_node_id):
    all_nodes = base_output()
    parents = search_parent_nodes(all_nodes, classifier_node_id)
    parents = list(reversed(parents))
    descendants = search_child_nodes(all_nodes, classifier_node_id)
    node_ids = [p.id for p in parents] + [int(classifier_node_id)] + [n.id for n in descendants]

    params = (
        ParameterDefinition.objects
        .filter(classifier_node_id__in=node_ids)
        .select_related("unit")
        .order_by("sort_order", "classifier_node_id", "id")
    )

    merged = {}
    for p in params:
        merged.setdefault(p.name, p)

    return list(merged.values())

"Удаление unit_dimension. Нельзя удалить unit_dimension, если есть связанные unit"
def delete_unit_dimension(unit_dimension_id):
    unit_dimension_id = int(unit_dimension_id)

    if Unit.objects.filter(dimension_id=unit_dimension_id).exists():
        raise ValueError("Нельзя удалить unit_dimension: есть связанные unit")

    ud = UnitDimension.objects.filter(id=unit_dimension_id).first()
    if ud is None:
        raise ValueError("Нет такой unit_dimension")
    ud.delete()

"Создание unit_dimension. Нельзя добавить с таким же именем"
def create_unit_dimension(name):
    name = (name or "").strip()
    if not name:
        raise ValueError("Имя не может быть пустым")

    if UnitDimension.objects.filter(name__iexact=name).exists():
        raise ValueError("Такая unit_dimension уже существует")

    last = UnitDimension.objects.order_by("-id").first()
    new_id = (last.id + 1) if last else 1

    ud = UnitDimension(id=new_id, name=name)
    ud.save(force_insert=True)
    return ud

"удаление unit. Нельзя удалить unit, если он используется в parameter_definition"
def delete_unit(unit_id):
    unit_id = int(unit_id)

    if ParameterDefinition.objects.filter(unit_id=unit_id).exists():
        raise ValueError("Нельзя удалить unit: он используется в parameter_definition")

    unit = Unit.objects.filter(id=unit_id).first()
    if unit is None:
        raise ValueError("Нет такой unit")
    unit.delete()

"Создание unit"
def create_unit(dimension_id, name, symbol, to_base_factor=1, to_base_offset=0):
    name = (name or "").strip()
    symbol = (symbol or "").strip()

    if not name:
        raise ValueError("Имя не может быть пустым")
    if not symbol:
        raise ValueError("Символ не может быть пустым")

    if not UnitDimension.objects.filter(id=dimension_id).exists():
        raise ValueError("Нет такой unit_dimension")

    if Unit.objects.filter(symbol__iexact=symbol).exists():
        raise ValueError("Unit с таким символом уже существует")

    # если хочешь запретить одинаковые имена:
    if Unit.objects.filter(name__iexact=name).exists():
        raise ValueError("Unit с таким именем уже существует")

    last = Unit.objects.order_by("-id").first()
    new_id = (last.id + 1) if last else 1

    unit = Unit(
        id=new_id,
        dimension_id=dimension_id,
        name=name,
        symbol=symbol,
        to_base_factor=to_base_factor,
        to_base_offset=to_base_offset,
    )
    unit.save(force_insert=True)
    return unit

"Создание parameter_definition"
def create_parameter_definition(classifier_node_id, name, unit_id, value_type, sort_order=0):
    classifier_node_id = int(classifier_node_id)
    name = (name or "").strip()
    value_type = (value_type or "").strip()

    if not name:
        raise ValueError("Имя не может быть пустым")
    if value_type not in ("str", "int", "real", "enum"):
        raise ValueError("value_type должен быть: str, int, real или enum")

    if not ClassifierNode.objects.filter(id=classifier_node_id).exists():
        raise ValueError("Нет такого classifier_node")

    if unit_id is None:
        raise ValueError("unit_id обязателен")
    if not Unit.objects.filter(id=unit_id).exists():
        raise ValueError("Нет такого unit")

    if ParameterDefinition.objects.filter(
        classifier_node_id=classifier_node_id,
        name__iexact=name
    ).exists():
        raise ValueError("Такой параметр уже есть в этом классе")

    last = ParameterDefinition.objects.order_by("-id").first()
    new_id = (last.id + 1) if last else 1

    pd = ParameterDefinition(
        id=new_id,
        classifier_node_id=classifier_node_id,
        name=name,
        unit_id=unit_id,
        value_type=value_type,
        sort_order=sort_order,
    )
    pd.save(force_insert=True)
    return pd

"удаление parameter_definition. Нельзя удалить параметр, если он используется в product_parameter_value"
def delete_parameter_definition(parameter_definition_id):
    parameter_definition_id = int(parameter_definition_id)

    if ProductParameterValue.objects.filter(parameter_definition_id=parameter_definition_id).exists():
        raise ValueError("Нельзя удалить параметр: он используется в product_parameter_value")

    pd = ParameterDefinition.objects.filter(id=parameter_definition_id).first()
    if pd is None:
        raise ValueError("Нет такого parameter_definition")
    pd.delete()

"Создание product_parameter_value"
def create_product_parameter_value(
    product_id: int,
    parameter_definition_id: int,
    value_str: Optional[str] = None,
    value_int: Optional[int] = None,
    value_real: Optional[float] = None,
    value_enum_id: Optional[int] = None
) -> ProductParameterValue:
    if all(v is None for v in [value_str, value_int, value_real, value_enum_id]):
        raise ValueError("Нужно передать хотя бы одно значение")

    # Проверка типа параметра
    pd = ParameterDefinition.objects.get(id=parameter_definition_id)
    if pd.value_type == "str" and value_str is None:
        raise ValueError("Для value_type='str' нужно value_str")
    if pd.value_type == "int" and value_int is None:
        raise ValueError("Для value_type='int' нужно value_int")
    if pd.value_type == "real" and value_real is None:
        raise ValueError("Для value_type='real' нужно value_real")
    if pd.value_type == "enum" and value_enum_id is None:
        raise ValueError("Для value_type='enum' нужно value_enum_id")

    # Проверка уникальности значения этого параметра у продукта
    if ProductParameterValue.objects.filter(
        product_id=product_id,
        parameter_definition_id=parameter_definition_id
    ).exists():
        raise ValueError("Значение для этого параметра у продукта уже существует")

    last = ProductParameterValue.objects.order_by("-id").first()
    new_id = (last.id + 1) if last else 1

    ppv = ProductParameterValue(
        id=new_id,
        product_id=product_id,
        parameter_definition_id=parameter_definition_id,
        value_str=value_str,
        value_int=value_int,
        value_real=value_real,
        value_enum_id=value_enum_id
    )
    ppv.save(force_insert=True)
    return ppv

"Удаление product_parameter_value"
def delete_product_parameter_value(product_parameter_value_id):
    product_parameter_value_id = int(product_parameter_value_id)
    ppv = ProductParameterValue.objects.filter(id=product_parameter_value_id).first()
    if ppv is None:
        raise ValueError("Нет такого product_parameter_value")
    ppv.delete()

"Обновление parameter_definition(редактирование)"
def update_parameter_definition(parameter_definition_id, name=None, unit_id=None, value_type=None, sort_order=None):
    parameter_definition_id = int(parameter_definition_id)

    pd = ParameterDefinition.objects.filter(id=parameter_definition_id).first()
    if pd is None:
        raise ValueError("Нет такого parameter_definition")

    if name is not None:
        name = name.strip()
        if not name:
            raise ValueError("Имя не может быть пустым")
        # проверка на дубль в том же классе
        if ParameterDefinition.objects.filter(
            classifier_node_id=pd.classifier_node_id,
            name__iexact=name
        ).exclude(id=pd.id).exists():
            raise ValueError("Такой параметр уже есть в этом классе")
        pd.name = name

    if unit_id is not None:
        if not Unit.objects.filter(id=unit_id).exists():
            raise ValueError("Нет такого unit")
        pd.unit_id = int(unit_id)

    if value_type is not None:
        value_type = value_type.strip()
        if value_type not in ("str", "int", "real", "enum"):
            raise ValueError("value_type должен быть: str, int, real или enum")
        pd.value_type = value_type

    if sort_order is not None:
        pd.sort_order = int(sort_order)

    pd.save()
    return pd

"Обновление product_parameter_value(редактирование)"
def update_product_parameter_value(product_parameter_value_id,
                                   value_str=None, value_int=None, value_real=None,
                                   value_enum_id=None):
    product_parameter_value_id = int(product_parameter_value_id)

    ppv = ProductParameterValue.objects.filter(id=product_parameter_value_id).first()
    if ppv is None:
        raise ValueError("Нет такого product_parameter_value")

    pd = ParameterDefinition.objects.filter(id=ppv.parameter_definition_id).first()
    if pd is None:
        raise ValueError("Нет такого parameter_definition")

    if value_str is None and value_int is None and value_real is None and value_enum_id is None:
        raise ValueError("Нужно передать хотя бы одно значение")

    if pd.value_type == "str":
        if value_str is None:
            raise ValueError("Для value_type='str' нужно value_str")
        ppv.value_str = value_str
        ppv.value_int = None
        ppv.value_real = None
        ppv.value_enum_id = None

    elif pd.value_type == "int":
        if value_int is None:
            raise ValueError("Для value_type='int' нужно value_int")
        ppv.value_int = value_int
        ppv.value_str = None
        ppv.value_real = None
        ppv.value_enum_id = None

    elif pd.value_type == "real":
        if value_real is None:
            raise ValueError("Для value_type='real' нужно value_real")
        ppv.value_real = value_real
        ppv.value_str = None
        ppv.value_int = None
        ppv.value_enum_id = None

    elif pd.value_type == "enum":
        if value_enum_id is None:
            raise ValueError("Для value_type='enum' нужно value_enum_id")
        if not EnumValue.objects.filter(id=value_enum_id).exists():
            raise ValueError("Нет такого enum_value")
        ppv.value_enum_id = value_enum_id
        ppv.value_str = None
        ppv.value_int = None
        ppv.value_real = None

    ppv.save()
    return ppv

"""Получение товаров со всеми параметрами(product_parameter_value) и атрибутами(product_attribute_value)
    при выборе определенной категории classifier_node"""
def find_products_with_params_and_attrs(classifier_node_id):
    classifier_node_id = int(classifier_node_id)

    all_nodes = base_output()
    descendants = search_child_nodes(all_nodes, classifier_node_id)
    node_ids = [classifier_node_id] + [n.id for n in descendants]

    products = (
        Product.objects
        .filter(classifier_node_id__in=node_ids)
        .order_by("id")
    )

    ppv = (
        ProductParameterValue.objects
        .filter(product_id__in=[p.id for p in products])
        .select_related("parameter_definition__unit")
    )

    pav = (
        ProductAttributeValue.objects
        .filter(product_id__in=[p.id for p in products])
        .select_related("enum_value__enum_definition")
    )

    params_by_product = {}
    for item in ppv:
        params_by_product.setdefault(item.product_id, []).append(item)

    attrs_by_product = {}
    for item in pav:
        attrs_by_product.setdefault(item.product_id, []).append(item)

    result = []
    for p in products:
        product_params = []
        for item in params_by_product.get(p.id, []):
            pd = item.parameter_definition
            parameter_data = {
                "id": pd.id,
                "name": pd.name,
                "value_type": pd.value_type,
                "unit": {
                    "id": pd.unit_id,
                    "name": pd.unit.name if pd.unit else None,
                    "symbol": pd.unit.symbol if pd.unit else None,
                }
            }
            if pd.value_type == "enum":
                enum_definition = EnumDefinition.objects.filter(
                    classifier_node_id=pd.classifier_node_id
                ).first()
                parameter_data["enum_values"] = [
                    {
                        "id": value.id,
                        "value_str": value.value_str,
                        "value_int": value.value_int,
                        "value_real": value.value_real,
                    }
                    for value in EnumValue.objects.filter(
                        enum_definition=enum_definition
                    ).order_by("sort_order", "id")
                ] if enum_definition else []
            product_params.append({
                "id": item.id,
                "parameter_definition": parameter_data,
                "value_str": item.value_str,
                "value_int": item.value_int,
                "value_real": item.value_real,
                "value_enum_id": item.value_enum_id,
            })

        product_attrs = []
        for item in attrs_by_product.get(p.id, []):
            ev = item.enum_value
            ed = ev.enum_definition if ev else None
            if ev and ed:
                product_attrs.append({
                    "id": item.id,
                    "enum_definition": {
                        "id": ed.id,
                        "description": ed.description,
                    },
                    "enum_value": {
                        "id": ev.id,
                        "value_str": ev.value_str,
                        "value_int": ev.value_int,
                        "value_real": ev.value_real,
                        "sort_order": ev.sort_order,
                    }
                })

        result.append({
            "product": p,
            "parameters": product_params,
            "attributes": product_attrs,
        })

    return result

""""Фильтрация товаров по параметрам Каждый фильтр — это словарь вида
{"parameter_definition_id": <id>, "value_int": ..., ...}. !!!Учитывая категорию(classifier_node)"""
def filter_products_by_parameters(classifier_node_id, filters):

    classifier_node_id = int(classifier_node_id)

    all_nodes = base_output()
    descendants = search_child_nodes(all_nodes, classifier_node_id)
    node_ids = [classifier_node_id] + [n.id for n in descendants]

    products = Product.objects.filter(classifier_node_id__in=node_ids)
    product_ids = set(products.values_list("id", flat=True))

    for f in filters:
        pd_id = int(f.get("parameter_definition_id"))
        q = Q(parameter_definition_id=pd_id)
        operator = f.get("operator")

        if "value_str" in f:
            lookup = {"exact": "value_str", "contains": "value_str__icontains"}.get(operator, "value_str")
            q &= Q(**{lookup: f["value_str"]})
        elif "value_int" in f:
            lookup = {"gte": "value_int__gte", "lte": "value_int__lte"}.get(operator, "value_int")
            q &= Q(**{lookup: f["value_int"]})
        elif "value_real" in f:
            lookup = {"gte": "value_real__gte", "lte": "value_real__lte"}.get(operator, "value_real")
            q &= Q(**{lookup: f["value_real"]})
        elif "value_enum_id" in f:
            q &= Q(value_enum_id=f["value_enum_id"])
        else:
            raise ValueError("В фильтре нет значения")

        matched_ids = set(
            ProductParameterValue.objects
            .filter(q)
            .values_list("product_id", flat=True)
        )
        product_ids &= matched_ids

        if not product_ids:
            break

    return list(Product.objects.filter(id__in=product_ids))

"""Фильтрация продуктов по значениям параметров !!!без учета classifier_node.
    filters = [{"parameter_definition_id": 10, "value_str": "AAA"}, ...]
"""
def filter_products_by_parameters_without_class(filters):
    product_ids = set(Product.objects.values_list("id", flat=True))

    for f in filters:
        pd_id = int(f.get("parameter_definition_id"))
        q = Q(parameter_definition_id=pd_id)
        operator = f.get("operator")

        if "value_str" in f:
            lookup = {"exact": "value_str", "contains": "value_str__icontains"}.get(operator, "value_str")
            q &= Q(**{lookup: f["value_str"]})
        elif "value_int" in f:
            lookup = {"gte": "value_int__gte", "lte": "value_int__lte"}.get(operator, "value_int")
            q &= Q(**{lookup: f["value_int"]})
        elif "value_real" in f:
            lookup = {"gte": "value_real__gte", "lte": "value_real__lte"}.get(operator, "value_real")
            q &= Q(**{lookup: f["value_real"]})
        elif "value_enum_id" in f:
            q &= Q(value_enum_id=f["value_enum_id"])
        else:
            raise ValueError("В фильтре нет значения")

        matched_ids = set(
            ProductParameterValue.objects
            .filter(q)
            .values_list("product_id", flat=True)
        )
        product_ids &= matched_ids

        if not product_ids:
            break

    return list(Product.objects.filter(id__in=product_ids))

#############################################СПЕЦИФИКАЦИЯ (BOM)#############################################
"Вызов функции БД. Ошибки из RAISE EXCEPTION превращаются в ValueError с текстом из БД"
def _call_db_function(sql, params):
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            columns = [col[0] for col in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
    except DatabaseError as e:
        raise ValueError(_db_message(e)) from e

"Текст ошибки БД: сначала сообщение RAISE EXCEPTION, потом общий текст исключения"
def _db_message(e):
    diag = getattr(e.__cause__, "diag", None)
    return diag.message_primary if diag and diag.message_primary else str(e)

"Проверка, что изделие существует"
def _check_product_exists(product_id):
    try:
        product_id = int(product_id)
    except (TypeError, ValueError):
        raise ValueError("Некорректный id изделия")
    if not Product.objects.filter(id=product_id).exists():
        raise ValueError("Нет такого изделия")
    return product_id

"Проверка количества изделий для расчёта норм"
def _check_quantity(quantity):
    try:
        quantity = float(quantity)
    except (TypeError, ValueError):
        raise ValueError("Количество должно быть числом")
    if not isfinite(quantity):
        raise ValueError("Количество должно быть конечным числом")
    if quantity <= 0:
        raise ValueError("Количество должно быть больше нуля")
    return quantity

"Список строк состава изделия для редактирования и отображения"
def list_bom_items(product_id):
    product_id = _check_product_exists(product_id)
    sql = """
        SELECT e.bom_item_id        AS id,
               b.parent_product_id,
               e.component_id,
               e.position_no,
               e.quantity,
               e.per_quantity,
               e.unit_id,
               e.is_base,
               c.name              AS component_name,
               c.designation       AS component_designation,
               c.product_type_code AS product_type_code,
               u.symbol            AS unit_symbol
        FROM bom_effective(%s) e
        JOIN bom_item b  ON b.id = e.bom_item_id
        JOIN product c   ON c.id = e.component_id
        JOIN unit u      ON u.id = e.unit_id
        ORDER BY e.position_no, b.id
    """
    return _call_db_function(sql, [product_id])

"Следующий номер позиции в составе изделия"
def _next_position_no(parent_product_id):
    last = BomItem.objects.filter(parent_product_id=parent_product_id).order_by('-position_no').first()
    return (last.position_no + 1) if last else 1

"Создать строку состава изделия. Изменение спецификации регистрируется в той же транзакции"
def create_bom_item(parent_product_id, component_id, quantity, per_quantity, unit_id, position_no=None,
                    is_base=False, author=None, change_description=None):
    parent_product_id = _check_product_exists(parent_product_id)
    component_id = _check_product_exists(component_id)

    if parent_product_id == component_id:
        raise ValueError("Изделие не может входить само в себя")

    if not Unit.objects.filter(id=int(unit_id)).exists():
        raise ValueError("Нет такой единицы измерения")

    try:
        quantity = Decimal(str(quantity))
        per_quantity = Decimal(str(per_quantity))
    except Exception as exc:
        raise ValueError("Количество и норма должны быть числами") from exc

    if quantity <= 0 or per_quantity <= 0:
        raise ValueError("Количество и норма должны быть больше нуля")

    if BomItem.objects.filter(parent_product_id=parent_product_id, component_id=component_id).exists():
        raise ValueError("Компонент уже добавлен в состав изделия")

    position_no = _next_position_no(parent_product_id) if position_no is None else int(position_no)

    component = Product.objects.get(id=component_id)
    try:
        with transaction.atomic():
            _call_db_function(
                "SELECT register_change(%s, %s, %s) AS id",
                [parent_product_id,
                 change_description or f"Добавлен компонент '{component.name}' в состав изделия",
                 author],
            )
            item = BomItem(
                parent_product_id=parent_product_id,
                component_id=component_id,
                quantity=quantity,
                per_quantity=per_quantity,
                unit_id=int(unit_id),
                position_no=position_no,
                is_base=is_base,
            )
            item.save()
    except DatabaseError as e:
        raise ValueError(_db_message(e)) from e
    return item

"Редактировать строку состава изделия. Изменение спецификации регистрируется в той же транзакции"
def update_bom_item(bom_item_id, quantity=None, per_quantity=None, unit_id=None, position_no=None, is_base=None,
                    author=None, change_description=None):
    try:
        bom_item = BomItem.objects.get(id=int(bom_item_id))
    except BomItem.DoesNotExist as exc:
        raise ValueError("Строка состава не найдена") from exc

    if quantity is not None:
        try:
            bom_item.quantity = Decimal(str(quantity))
        except Exception as exc:
            raise ValueError("Количество должно быть числом") from exc
        if bom_item.quantity <= 0:
            raise ValueError("Количество должно быть больше нуля")

    if per_quantity is not None:
        try:
            bom_item.per_quantity = Decimal(str(per_quantity))
        except Exception as exc:
            raise ValueError("Норма должна быть числом") from exc
        if bom_item.per_quantity <= 0:
            raise ValueError("Норма должна быть больше нуля")

    if unit_id is not None:
        if not Unit.objects.filter(id=int(unit_id)).exists():
            raise ValueError("Нет такой единицы измерения")
        bom_item.unit_id = int(unit_id)

    if position_no is not None:
        bom_item.position_no = int(position_no)

    if is_base is not None:
        bom_item.is_base = bool(is_base)

    try:
        with transaction.atomic():
            _call_db_function(
                "SELECT register_change(%s, %s, %s) AS id",
                [bom_item.parent_product_id,
                 change_description or f"Обновлена норма компонента '{bom_item.component.name}'",
                 author],
            )
            bom_item.save()
    except DatabaseError as e:
        raise ValueError(_db_message(e)) from e
    return bom_item

"Удалить строку состава изделия. Изменение спецификации регистрируется в той же транзакции"
def delete_bom_item(bom_item_id, author=None, change_description=None):
    try:
        bom_item = BomItem.objects.get(id=int(bom_item_id))
    except BomItem.DoesNotExist as exc:
        raise ValueError("Строка состава не найдена") from exc

    parent_product_id = bom_item.parent_product_id
    component_name = bom_item.component.name
    try:
        with transaction.atomic():
            _call_db_function(
                "SELECT register_change(%s, %s, %s) AS id",
                [parent_product_id,
                 change_description or f"Удалён компонент '{component_name}' из состава изделия",
                 author],
            )
            bom_item.delete()
    except DatabaseError as e:
        raise ValueError(_db_message(e)) from e

"Дерево состава изделия на всю глубину (find_bom)"
def find_bom(product_id):
    product_id = _check_product_exists(product_id)
    return _call_db_function("SELECT * FROM find_bom(%s)", [product_id])

"Сводные нормы расхода на quantity изделий. class_id - только компоненты этого класса и его подклассов"
def calc_bom(product_id, quantity=1, class_id=None):
    product_id = _check_product_exists(product_id)
    quantity = _check_quantity(quantity)

    if class_id is not None:
        try:
            class_id = int(class_id)
        except (TypeError, ValueError):
            raise ValueError("Некорректный id класса")
        if not ClassifierNode.objects.filter(id=class_id).exists():
            raise ValueError("Нет такого classifier_node")

    return _call_db_function("SELECT * FROM calc_bom(%s, %s, %s)", [product_id, quantity, class_id])

"Сводные нормы расхода, сгруппированные по классам ресурсов"
def calc_bom_by_class(product_id, quantity=1):
    product_id = _check_product_exists(product_id)
    quantity = _check_quantity(quantity)
    return _call_db_function("SELECT * FROM calc_bom_by_class(%s, %s)", [product_id, quantity])

"Классы, в которых у изделия есть ресурсы: остальные в расчёте дадут пустую таблицу"
def calc_bom_classes(product_id, quantity=1):
    product_id = _check_product_exists(product_id)
    quantity = _check_quantity(quantity)
    sql = """
        SELECT n.id, n.name, n.parent_id, count(*) AS resource_count
        FROM classifier_node n
        CROSS JOIN LATERAL calc_bom(%s, %s, n.id) c
        GROUP BY n.id, n.name, n.parent_id
        ORDER BY n.name
    """
    return _call_db_function(sql, [product_id, quantity])

"Создание модификации на основе базового изделия. Базовая спецификация копируется с флагом базы"
def create_modification(base_product_id, name, designation=None):
    base_product_id = _check_product_exists(base_product_id)

    name = (name or "").strip()
    if not name:
        raise ValueError("Название модификации обязательно")
    if Product.objects.filter(name=name).exists():
        raise ValueError(f"Товар с именем '{name}' уже существует")

    designation = (designation or "").strip() or None
    if designation and Product.objects.filter(designation=designation).exists():
        raise ValueError(f"Изделие с обозначением '{designation}' уже существует")

    rows = _call_db_function(
        "SELECT create_modification(%s, %s, %s) AS id",
        [base_product_id, name, designation]
    )
    return Product.objects.get(id=rows[0]["id"])

"Регистрация изменения спецификации изделия"
def register_change(product_id, description, author=None):
    product_id = _check_product_exists(product_id)

    description = (description or "").strip()
    if not description:
        raise ValueError("Описание изменения обязательно")

    rows = _call_db_function("SELECT register_change(%s, %s, %s) AS id", [product_id, description, author])
    return BomChange.objects.get(id=rows[0]["id"])

"История изменений спецификации изделия"
def get_bom_changes(product_id):
    product_id = _check_product_exists(product_id)
    return list(BomChange.objects.filter(product_id=product_id).order_by("change_no"))

"Журнал правок состава изделия: кто, что и когда менял, сначала свежие"
def get_bom_change_log(product_id):
    product_id = _check_product_exists(product_id)
    sql = """
        SELECT l.id,
               l.change_id,
               ch.change_no,
               l.component_id,
               c.name      AS component_name,
               l.operation,
               l.old_quantity,
               l.new_quantity,
               l.old_per_quantity,
               l.new_per_quantity,
               l.old_unit_id,
               ou.symbol   AS old_unit_symbol,
               l.new_unit_id,
               nu.symbol   AS new_unit_symbol,
               l.old_is_base,
               l.new_is_base,
               l.changed_by,
               l.changed_at
        FROM bom_change_log l
        LEFT JOIN bom_change ch ON ch.id = l.change_id
        LEFT JOIN product c     ON c.id = l.component_id
        LEFT JOIN unit ou       ON ou.id = l.old_unit_id
        LEFT JOIN unit nu       ON nu.id = l.new_unit_id
        WHERE l.parent_product_id = %s
        ORDER BY l.changed_at DESC, l.id DESC
    """
    return _call_db_function(sql, [product_id])

#############################################СПРАВОЧНИКИ ТЕХПРОЦЕССА#############################################

"Следующий sort_order среди детей родителя (общий для деревьев справочников техпроцесса)"
def _next_tree_sort_order(model, parent_id):
    last = model.objects.filter(parent_id=parent_id).order_by('-sort_order').first()
    return (last.sort_order + 1) if last else 0

"Добавление узла в дерево-справочник. Нельзя добавить с таким же названием"
def _add_tree_node(model, title, name, parent_id):
    name = (name or "").strip()
    if not name:
        raise ValueError("Название не может быть пустым")

    if model.objects.filter(name__iexact=name).exists():
        raise ValueError(f"{title} с названием '{name}' уже существует")

    if parent_id in (None, ""):
        parent_id = None
    else:
        parent_id = int(parent_id)
        if not model.objects.filter(id=parent_id).exists():
            raise ValueError("Нет такого родителя")

    node = model(name=name, parent_id=parent_id, sort_order=_next_tree_sort_order(model, parent_id))
    node.save()
    return node

"Переименование узла дерева-справочника"
def _update_tree_node(model, title, node_id, name=None):
    node = model.objects.filter(id=int(node_id)).first()
    if node is None:
        raise ValueError(f"{title} не найден")

    if name is not None:
        name = name.strip()
        if not name:
            raise ValueError("Название не может быть пустым")
        if model.objects.filter(name__iexact=name).exclude(id=node.id).exists():
            raise ValueError(f"{title} с названием '{name}' уже существует")
        node.name = name

    node.save()
    return node

"Перемещение узла к другому родителю (смена родителя). Нельзя переместить в себя или в потомка"
def _move_tree_node(model, title, node_id, new_parent_id):
    node_id = int(node_id)
    if new_parent_id in (None, ""):
        new_parent_id = None
    else:
        new_parent_id = int(new_parent_id)
        if not model.objects.filter(id=new_parent_id).exists():
            raise ValueError("Нет такого родителя")

    node = model.objects.filter(id=node_id).first()
    if node is None:
        raise ValueError(f"{title} не найден")

    if would_create_cycle(list(model.objects.all()), node_id, new_parent_id):
        raise ValueError("Нельзя переместить вершину в саму себя или в своего потомка (цикл)")

    node.parent_id = new_parent_id
    node.sort_order = _next_tree_sort_order(model, new_parent_id)
    node.save()
    return node

"Удаление узла дерева-справочника. Нельзя удалить узел с подчинёнными или используемый в маршрутах"
def _delete_tree_node(model, title, node_id):
    node = model.objects.filter(id=int(node_id)).first()
    if node is None:
        raise ValueError(f"{title} не найден")

    if model.objects.filter(parent_id=node.id).exists():
        raise ValueError("Нельзя удалить запись, у которой есть подчинённые")

    try:
        with transaction.atomic():
            node.delete()
    except IntegrityError as e:
        raise ValueError("Нельзя удалить запись: она используется в маршрутах") from e

#############################################КЛАССЫ ОПЕРАЦИЙ#############################################

"Дерево классов операций с уровнями вложенности (для древовидного вывода)"
def get_operation_class_tree():
    return build_tree_with_levels(list(OperationClass.objects.order_by('sort_order', 'id')))

"Добавление класса операций"
def create_operation_class(name, parent_id=None):
    return _add_tree_node(OperationClass, "Класс операций", name, parent_id)

"Редактирование (переименование) класса операций"
def update_operation_class(operation_class_id, name=None):
    return _update_tree_node(OperationClass, "Класс операций", operation_class_id, name)

"Перемещение класса операций к другому родителю"
def move_operation_class(operation_class_id, new_parent_id):
    return _move_tree_node(OperationClass, "Класс операций", operation_class_id, new_parent_id)

"Удаление класса операций"
def delete_operation_class(operation_class_id):
    _delete_tree_node(OperationClass, "Класс операций", operation_class_id)

#############################################ГРУППЫ РАБОЧИХ ЦЕНТРОВ (ГРЦ)#############################################

"Дерево групп рабочих центров с уровнями вложенности (цех -> участок -> ГРЦ)"
def get_work_center_group_tree():
    return build_tree_with_levels(list(WorkCenterGroup.objects.order_by('sort_order', 'id')))

"Добавление группы рабочих центров"
def create_work_center_group(name, parent_id=None):
    return _add_tree_node(WorkCenterGroup, "Группа рабочих центров", name, parent_id)

"Редактирование (переименование) группы рабочих центров"
def update_work_center_group(work_center_group_id, name=None):
    return _update_tree_node(WorkCenterGroup, "Группа рабочих центров", work_center_group_id, name)

"Перемещение группы рабочих центров к другому родителю"
def move_work_center_group(work_center_group_id, new_parent_id):
    return _move_tree_node(WorkCenterGroup, "Группа рабочих центров", work_center_group_id, new_parent_id)

"Удаление группы рабочих центров"
def delete_work_center_group(work_center_group_id):
    _delete_tree_node(WorkCenterGroup, "Группа рабочих центров", work_center_group_id)

#############################################ПРОФЕССИИ#############################################

"Проверка квалификации (разряда) и часовой ставки"
def _check_profession_values(grade, hourly_rate):
    try:
        grade = int(grade)
    except (TypeError, ValueError):
        raise ValueError("Разряд должен быть целым числом")
    if not 1 <= grade <= 8:
        raise ValueError("Разряд должен быть от 1 до 8")

    try:
        hourly_rate = Decimal(str(hourly_rate))
    except Exception as exc:
        raise ValueError("Ставка должна быть числом") from exc
    if hourly_rate < 0:
        raise ValueError("Ставка не может быть отрицательной")

    return grade, hourly_rate

"Получение всех профессий"
def get_all_professions():
    return list(Profession.objects.order_by('name', 'grade'))

"Добавление профессии. Нельзя добавить с таким же названием и разрядом"
def create_profession(name, grade, hourly_rate):
    name = (name or "").strip()
    if not name:
        raise ValueError("Название не может быть пустым")

    grade, hourly_rate = _check_profession_values(grade, hourly_rate)

    if Profession.objects.filter(name__iexact=name, grade=grade).exists():
        raise ValueError("Такая профессия с этим разрядом уже существует")

    profession = Profession(name=name, grade=grade, hourly_rate=hourly_rate)
    profession.save()
    return profession

"Редактирование профессии"
def update_profession(profession_id, name=None, grade=None, hourly_rate=None):
    profession = Profession.objects.filter(id=int(profession_id)).first()
    if profession is None:
        raise ValueError("Нет такой профессии")

    if name is not None:
        name = name.strip()
        if not name:
            raise ValueError("Название не может быть пустым")
        profession.name = name

    new_grade, new_rate = _check_profession_values(
        profession.grade if grade is None else grade,
        profession.hourly_rate if hourly_rate is None else hourly_rate,
    )
    profession.grade = new_grade
    profession.hourly_rate = new_rate

    if Profession.objects.filter(name__iexact=profession.name, grade=profession.grade) \
            .exclude(id=profession.id).exists():
        raise ValueError("Такая профессия с этим разрядом уже существует")

    profession.save()
    return profession

"Удаление профессии. Нельзя удалить профессию, которая используется в операциях маршрутов"
def delete_profession(profession_id):
    profession = Profession.objects.filter(id=int(profession_id)).first()
    if profession is None:
        raise ValueError("Нет такой профессии")

    try:
        with transaction.atomic():
            profession.delete()
    except IntegrityError as e:
        raise ValueError("Нельзя удалить профессию: она используется в операциях маршрутов") from e

#############################################ИНСТРУМЕНТ И ОСНАСТКА#############################################

"Проверка вида инструмента: tool - инструмент, fixture - оснастка"
def _check_tooling_type(tooling_type):
    tooling_type = (tooling_type or "").strip()
    if tooling_type not in ("tool", "fixture"):
        raise ValueError("tooling_type должен быть: tool или fixture")
    return tooling_type

"Получение всего инструмента и оснастки"
def get_all_tooling():
    return list(Tooling.objects.order_by('designation'))

"Добавление инструмента или оснастки. Нельзя добавить с таким же обозначением"
def create_tooling(designation, name, tooling_type='tool'):
    designation = (designation or "").strip()
    name = (name or "").strip()
    if not designation:
        raise ValueError("Обозначение не может быть пустым")
    if not name:
        raise ValueError("Название не может быть пустым")

    tooling_type = _check_tooling_type(tooling_type)

    if Tooling.objects.filter(designation__iexact=designation).exists():
        raise ValueError(f"Инструмент с обозначением '{designation}' уже существует")

    tooling = Tooling(designation=designation, name=name, tooling_type=tooling_type)
    tooling.save()
    return tooling

"Редактирование инструмента или оснастки"
def update_tooling(tooling_id, designation=None, name=None, tooling_type=None):
    tooling = Tooling.objects.filter(id=int(tooling_id)).first()
    if tooling is None:
        raise ValueError("Нет такого инструмента")

    if designation is not None:
        designation = designation.strip()
        if not designation:
            raise ValueError("Обозначение не может быть пустым")
        if Tooling.objects.filter(designation__iexact=designation).exclude(id=tooling.id).exists():
            raise ValueError(f"Инструмент с обозначением '{designation}' уже существует")
        tooling.designation = designation

    if name is not None:
        name = name.strip()
        if not name:
            raise ValueError("Название не может быть пустым")
        tooling.name = name

    if tooling_type is not None:
        tooling.tooling_type = _check_tooling_type(tooling_type)

    tooling.save()
    return tooling

"Удаление инструмента. Нельзя удалить инструмент, который используется в операциях маршрутов"
def delete_tooling(tooling_id):
    tooling = Tooling.objects.filter(id=int(tooling_id)).first()
    if tooling is None:
        raise ValueError("Нет такого инструмента")

    try:
        with transaction.atomic():
            tooling.delete()
    except IntegrityError as e:
        raise ValueError("Нельзя удалить инструмент: он используется в операциях маршрутов") from e


#############################################МАРШРУТНАЯ ТЕХНОЛОГИЯ#############################################

"Объект по id или ValueError с понятным текстом"
def _get_by_id(model, obj_id, title):
    try:
        obj_id = int(obj_id)
    except (TypeError, ValueError):
        raise ValueError(f"Некорректный id: {title}")
    obj = model.objects.filter(id=obj_id).first()
    if obj is None:
        raise ValueError(f"Не найдено: {title}")
    return obj

"Проверка ссылки на справочник: id должен быть числом и такая запись должна существовать"
def _require_ref(model, obj_id, title):
    try:
        obj_id = int(obj_id)
    except (TypeError, ValueError):
        raise ValueError(f"Не выбрано: {title}")
    if not model.objects.filter(id=obj_id).exists():
        raise ValueError(f"Не найдено: {title}")
    return obj_id

"Положительное число (Decimal)"
def _check_positive_decimal(value, title):
    try:
        value = Decimal(str(value))
    except Exception as exc:
        raise ValueError(f"«{title}» должно быть числом") from exc
    if value <= 0:
        raise ValueError(f"«{title}» должно быть больше нуля")
    return value

"Положительное целое число"
def _check_positive_int(value, title):
    try:
        value = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"«{title}» должно быть целым числом")
    if value <= 0:
        raise ValueError(f"«{title}» должно быть больше нуля")
    return value

"Маршрут возможен только у изготавливаемых изделий (тип с can_have_bom). Те же правила держит триггер БД"
def _check_product_can_have_route(product_id):
    rows = _call_db_function(
        "SELECT pt.name, pt.can_have_bom FROM product p "
        "JOIN product_type pt ON pt.code = p.product_type_code WHERE p.id = %s",
        [product_id],
    )
    if rows and not rows[0]["can_have_bom"]:
        raise ValueError(f"Для изделия типа «{rows[0]['name']}» маршрут не создаётся: оно не изготавливается")

"Изделия, для которых можно создать маршрут (для выбора изделия). route_count - сколько маршрутов уже есть"
def get_routable_products():
    sql = """
        SELECT p.id, p.designation, p.name, p.product_type_code,
               pt.name AS product_type_name,
               (SELECT count(*) FROM route r WHERE r.product_id = p.id) AS route_count
        FROM product p
        JOIN product_type pt ON pt.code = p.product_type_code
        WHERE pt.can_have_bom
        ORDER BY p.designation NULLS LAST, p.name
    """
    return _call_db_function(sql, [])

#############################################МАРШРУТЫ#############################################

"Список маршрутов. product_id - только маршруты этого изделия"
def get_routes(product_id=None):
    routes = Route.objects.select_related('product').order_by('product_id', 'route_no')
    if product_id not in (None, ""):
        routes = routes.filter(product_id=_check_product_exists(product_id))
    return list(routes)

"""Создание маршрута изделия. У изделия может быть несколько маршрутов (версий).
    Нельзя создать для изделия, которое не изготавливается (материал, комплектующее)"""
def create_route(product_id, name=None, route_no=None):
    product_id = _check_product_exists(product_id)
    _check_product_can_have_route(product_id)
    product = Product.objects.get(id=product_id)

    name = (name or "").strip() or f"Маршрут изделия «{product.name}»"

    if route_no in (None, ""):
        last = Route.objects.filter(product_id=product_id).order_by('-route_no').first()
        route_no = (last.route_no + 1) if last else 1
    else:
        route_no = _check_positive_int(route_no, "Номер маршрута")
        if Route.objects.filter(product_id=product_id, route_no=route_no).exists():
            raise ValueError("Маршрут с таким номером у изделия уже существует")

    try:
        with transaction.atomic():
            route = Route(product_id=product_id, route_no=route_no, name=name)
            route.save()
    except DatabaseError as e:
        raise ValueError(_db_message(e)) from e
    return route

"Переименование маршрута"
def update_route(route_id, name=None):
    route = _get_by_id(Route, route_id, "маршрут")

    if name is not None:
        name = name.strip()
        if not name:
            raise ValueError("Название маршрута не может быть пустым")
        route.name = name

    route.save()
    return route

"Удаление маршрута вместе с его операциями, инструментом и материалами"
def delete_route(route_id):
    route = _get_by_id(Route, route_id, "маршрут")
    try:
        with transaction.atomic():
            route.delete()
    except DatabaseError as e:
        raise ValueError(_db_message(e)) from e

"""Маршрут целиком: операции по порядку, у каждой класс операции, ГРЦ, профессия с ставкой,
    норма времени, инструмент и оснастка, материалы и комплектующие с нормами"""
def get_route_details(route_id):
    route = _get_by_id(Route, route_id, "маршрут")
    product = Product.objects.get(id=route.product_id)

    operations = list(
        RouteOperation.objects
        .filter(route_id=route.id)
        .select_related('operation_class', 'work_center_group', 'profession', 'time_unit')
        .order_by('position_no', 'id')
    )
    operation_ids = [o.id for o in operations]

    tools_by_operation = {}
    for t in (RouteOperationTool.objects
              .filter(route_operation_id__in=operation_ids)
              .select_related('tooling').order_by('id')):
        tools_by_operation.setdefault(t.route_operation_id, []).append({
            "id": t.id,
            "tooling_id": t.tooling_id,
            "designation": t.tooling.designation,
            "name": t.tooling.name,
            "tooling_type": t.tooling.tooling_type,
            "quantity": t.quantity,
        })

    materials_by_operation = {}
    for m in (RouteOperationMaterial.objects
              .filter(route_operation_id__in=operation_ids)
              .select_related('product', 'unit').order_by('id')):
        materials_by_operation.setdefault(m.route_operation_id, []).append({
            "id": m.id,
            "product_id": m.product_id,
            "designation": m.product.designation,
            "name": m.product.name,
            "quantity": float(m.quantity),
            "per_quantity": float(m.per_quantity),
            "unit_id": m.unit_id,
            "unit_symbol": m.unit.symbol,
        })

    return {
        "route": {
            "id": route.id,
            "product_id": route.product_id,
            "product_name": product.name,
            "product_designation": product.designation,
            "route_no": route.route_no,
            "name": route.name,
        },
        "operations": [
            {
                "id": o.id,
                "position_no": o.position_no,
                "name": o.name,
                "operation_class": {"id": o.operation_class_id, "name": o.operation_class.name},
                "work_center_group": {"id": o.work_center_group_id, "name": o.work_center_group.name},
                "profession": {
                    "id": o.profession_id,
                    "name": o.profession.name,
                    "grade": o.profession.grade,
                    "hourly_rate": float(o.profession.hourly_rate),
                },
                "time_norm": float(o.time_norm),
                "time_unit_id": o.time_unit_id,
                "time_unit_symbol": o.time_unit.symbol,
                "tools": tools_by_operation.get(o.id, []),
                "materials": materials_by_operation.get(o.id, []),
            }
            for o in operations
        ],
    }

#############################################ОПЕРАЦИИ МАРШРУТА#############################################

"Следующий номер операции в маршруте"
def _next_operation_position(route_id):
    last = RouteOperation.objects.filter(route_id=route_id).order_by('-position_no').first()
    return (last.position_no + 1) if last else 1

"""Перенумеровать операции маршрута 1..N. Делается в два прохода: пара (route_id, position_no) уникальна,
    поэтому напрямую поменять номера местами нельзя"""
def _renumber_route_operations(route_id, ordered_ids=None):
    if ordered_ids is None:
        ordered_ids = list(
            RouteOperation.objects.filter(route_id=route_id)
            .order_by('position_no', 'id').values_list('id', flat=True)
        )
    for index, operation_id in enumerate(ordered_ids, start=1):
        RouteOperation.objects.filter(id=operation_id).update(position_no=-index)
    for index, operation_id in enumerate(ordered_ids, start=1):
        RouteOperation.objects.filter(id=operation_id).update(position_no=index)

"Переместить операцию на новую позицию в последовательности (остальные сдвигаются)"
def move_route_operation(operation_id, new_position):
    operation = _get_by_id(RouteOperation, operation_id, "операция маршрута")
    new_position = _check_positive_int(new_position, "Позиция")

    ordered_ids = list(
        RouteOperation.objects.filter(route_id=operation.route_id)
        .order_by('position_no', 'id').values_list('id', flat=True)
    )
    ordered_ids.remove(operation.id)
    new_position = min(new_position, len(ordered_ids) + 1)
    ordered_ids.insert(new_position - 1, operation.id)

    try:
        with transaction.atomic():
            _renumber_route_operations(operation.route_id, ordered_ids)
    except DatabaseError as e:
        raise ValueError(_db_message(e)) from e
    return RouteOperation.objects.get(id=operation.id)

"""Добавление операции в маршрут. Для операции указываются класс операции, ГРЦ (оборудование),
    профессия (квалификация задаётся разрядом профессии) и норма времени.
    position_no не указан - операция добавляется в конец"""
def create_route_operation(route_id, name, operation_class_id, work_center_group_id, profession_id,
                           time_norm, time_unit_id, position_no=None):
    route = _get_by_id(Route, route_id, "маршрут")
    operation_class_id = _require_ref(OperationClass, operation_class_id, "класс операций")
    work_center_group_id = _require_ref(WorkCenterGroup, work_center_group_id, "группа рабочих центров")
    profession_id = _require_ref(Profession, profession_id, "профессия")
    time_unit_id = _require_ref(Unit, time_unit_id, "единица времени")
    time_norm = _check_positive_decimal(time_norm, "Норма времени")

    name = (name or "").strip() or OperationClass.objects.get(id=operation_class_id).name

    try:
        with transaction.atomic():
            operation = RouteOperation(
                route_id=route.id,
                position_no=_next_operation_position(route.id),
                name=name,
                operation_class_id=operation_class_id,
                work_center_group_id=work_center_group_id,
                profession_id=profession_id,
                time_norm=time_norm,
                time_unit_id=time_unit_id,
            )
            operation.save()
            if position_no not in (None, ""):
                move_route_operation(operation.id, position_no)
    except DatabaseError as e:
        # например, единица времени не из размерности «Время» (триггер БД)
        raise ValueError(_db_message(e)) from e
    return RouteOperation.objects.get(id=operation.id)

"Редактирование операции маршрута. Передаются только изменяемые поля"
def update_route_operation(operation_id, name=None, operation_class_id=None, work_center_group_id=None,
                           profession_id=None, time_norm=None, time_unit_id=None, position_no=None):
    operation = _get_by_id(RouteOperation, operation_id, "операция маршрута")

    if name is not None:
        name = name.strip()
        if not name:
            raise ValueError("Название операции не может быть пустым")
        operation.name = name

    if operation_class_id is not None:
        operation.operation_class_id = _require_ref(OperationClass, operation_class_id, "класс операций")
    if work_center_group_id is not None:
        operation.work_center_group_id = _require_ref(WorkCenterGroup, work_center_group_id, "группа рабочих центров")
    if profession_id is not None:
        operation.profession_id = _require_ref(Profession, profession_id, "профессия")
    if time_unit_id is not None:
        operation.time_unit_id = _require_ref(Unit, time_unit_id, "единица времени")
    if time_norm is not None:
        operation.time_norm = _check_positive_decimal(time_norm, "Норма времени")

    try:
        with transaction.atomic():
            operation.save()
            if position_no not in (None, ""):
                move_route_operation(operation.id, position_no)
    except DatabaseError as e:
        raise ValueError(_db_message(e)) from e
    return RouteOperation.objects.get(id=operation.id)

"Удаление операции маршрута (вместе с её инструментом и материалами). Номера остальных операций выравниваются"
def delete_route_operation(operation_id):
    operation = _get_by_id(RouteOperation, operation_id, "операция маршрута")
    route_id = operation.route_id
    try:
        with transaction.atomic():
            operation.delete()
            _renumber_route_operations(route_id)
    except DatabaseError as e:
        raise ValueError(_db_message(e)) from e

#############################################ИНСТРУМЕНТ И ОСНАСТКА ОПЕРАЦИИ#############################################

"Добавление инструмента или оснастки в операцию. Один и тот же инструмент в операцию дважды не добавляется"
def add_operation_tool(operation_id, tooling_id, quantity=1):
    operation = _get_by_id(RouteOperation, operation_id, "операция маршрута")
    tooling_id = _require_ref(Tooling, tooling_id, "инструмент")
    quantity = _check_positive_int(quantity, "Количество")

    if RouteOperationTool.objects.filter(route_operation_id=operation.id, tooling_id=tooling_id).exists():
        raise ValueError("Этот инструмент уже добавлен в операцию")

    try:
        with transaction.atomic():
            item = RouteOperationTool(route_operation_id=operation.id, tooling_id=tooling_id, quantity=quantity)
            item.save()
    except DatabaseError as e:
        raise ValueError(_db_message(e)) from e
    return item

"Изменение количества инструмента в операции"
def update_operation_tool(operation_tool_id, quantity=None):
    item = _get_by_id(RouteOperationTool, operation_tool_id, "инструмент операции")

    if quantity is not None:
        item.quantity = _check_positive_int(quantity, "Количество")

    item.save()
    return item

"Удаление инструмента из операции"
def delete_operation_tool(operation_tool_id):
    item = _get_by_id(RouteOperationTool, operation_tool_id, "инструмент операции")
    item.delete()

#############################################МАТЕРИАЛЫ И КОМПЛЕКТУЮЩИЕ ОПЕРАЦИИ#############################################

"Единица нормы должна быть той же размерности, что и единица изделия (если у изделия она задана)"
def _check_material_unit(product_id, unit_id):
    unit_id = _require_ref(Unit, unit_id, "единица измерения")
    product = Product.objects.get(id=product_id)
    if product.unit_id:
        product_unit = Unit.objects.filter(id=product.unit_id).first()
        unit = Unit.objects.get(id=unit_id)
        if product_unit and product_unit.dimension_id != unit.dimension_id:
            raise ValueError("Единица нормы не совпадает по размерности с единицей изделия")
    return unit_id

"""Добавление материала или комплектующего в операцию. Норма расхода = quantity / per_quantity на единицу изделия маршрута.
    Расходоваться может любое изделие каталога (в том числе полуфабрикат), кроме самого изделия маршрута"""
def add_operation_material(operation_id, product_id, quantity, per_quantity=1, unit_id=None):
    operation = _get_by_id(RouteOperation, operation_id, "операция маршрута")
    route = Route.objects.get(id=operation.route_id)
    product_id = _check_product_exists(product_id)

    if product_id == route.product_id:
        raise ValueError("Изделие не может расходоваться на собственном маршруте")

    quantity = _check_positive_decimal(quantity, "Норма")
    per_quantity = _check_positive_decimal(per_quantity, "На количество")
    unit_id = _check_material_unit(product_id, unit_id)

    if RouteOperationMaterial.objects.filter(route_operation_id=operation.id, product_id=product_id).exists():
        raise ValueError("Этот материал уже добавлен в операцию")

    try:
        with transaction.atomic():
            item = RouteOperationMaterial(
                route_operation_id=operation.id,
                product_id=product_id,
                quantity=quantity,
                per_quantity=per_quantity,
                unit_id=unit_id,
            )
            item.save()
    except DatabaseError as e:
        raise ValueError(_db_message(e)) from e
    return item

"Изменение нормы расхода материала в операции"
def update_operation_material(operation_material_id, quantity=None, per_quantity=None, unit_id=None):
    item = _get_by_id(RouteOperationMaterial, operation_material_id, "материал операции")

    if quantity is not None:
        item.quantity = _check_positive_decimal(quantity, "Норма")
    if per_quantity is not None:
        item.per_quantity = _check_positive_decimal(per_quantity, "На количество")
    if unit_id is not None:
        item.unit_id = _check_material_unit(item.product_id, unit_id)

    item.save()
    return item

"Удаление материала из операции"
def delete_operation_material(operation_material_id):
    item = _get_by_id(RouteOperationMaterial, operation_material_id, "материал операции")
    item.delete()

#############################################ТЕХНОЛОГИЯ: АНАЛИЗ, НОРМЫ, КАЛЬКУЛЯЦИЯ#############################################

"Анализ технологичности: все операции маршрутов изделия и его компонентов на всю глубину состава"
def find_route_deep(product_id):
    product_id = _check_product_exists(product_id)
    return _call_db_function("SELECT * FROM find_route_deep(%s)", [product_id])

"Нормы материалов одной операции на заданное количество изделий"
def mr_q(operation_id, quantity=1):
    operation = _get_by_id(RouteOperation, operation_id, "операция маршрута")
    quantity = _check_quantity(quantity)
    return _call_db_function("SELECT * FROM mr_q(%s, %s)", [operation.id, quantity])

"Сводные нормы материалов по маршрутам изделия"
def sum_mr(product_id, quantity=1):
    product_id = _check_product_exists(product_id)
    quantity = _check_quantity(quantity)
    return _call_db_function("SELECT * FROM sum_mr(%s, %s)", [product_id, quantity])

"Потребность в трудовых ресурсах на quantity изделий: часы и стоимость по профессиям"
def calc_labor(product_id, quantity=1):
    product_id = _check_product_exists(product_id)
    quantity = _check_quantity(quantity)
    return _call_db_function("SELECT * FROM calc_labor(%s, %s)", [product_id, quantity])

"Калькуляция себестоимости на quantity изделий: материалы, труд, итого и на единицу"
def calc_cost(product_id, quantity=1):
    product_id = _check_product_exists(product_id)
    quantity = _check_quantity(quantity)
    rows = _call_db_function("SELECT * FROM calc_cost(%s, %s)", [product_id, quantity])
    return rows[0]