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
    ParameterNumericConstraint,
)
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
    current_id = int(node_id)
    
    # Преобразуем список в словарь для быстрого поиска по id
    node_by_id = {node.id: node for node in all_base}
    
    while True:
        current_node = node_by_id.get(current_id)
        if not current_node or current_node.parent_id is None:
            break
        parent_node = node_by_id.get(current_node.parent_id)
        if not parent_node:
            # Если родитель не найден, выходим, чтобы не зациклиться
            break
        result_parents.append(parent_node)
        current_id = parent_node.id
    
    return result_parents

def add_category(name, parent_id, unit):
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
        sort_order=next_sort_order
    )
    new_category.save()
    return new_category

"Добавление еще одной продукта в product. Нельзя добавить с таким же имененм, sku и к нетерминальному узлу"
def add_product(name, category_id, sku, price, supplier, weight_gram):
    if Product.objects.filter(name=name).exists():
        raise ValueError(f"Товар с именем '{name}' уже существует")

    if sku and Product.objects.filter(sku=sku).exists():
        raise ValueError(f"Товар с SKU '{sku}' уже существует")

    if ClassifierNode.objects.filter(parent_id=category_id).exists():
        raise ValueError("Нельзя добавить товар к нетерминальному узлу, содержащему подкатегории")

    new_product = Product(
        name=name,
        classifier_node_id=category_id,
        sku=sku,
        price=price,
        supplier=supplier,
        weight_gram=weight_gram
    )
    new_product.save()
    return new_product

"рекурсивное удаление категории(classifier_node)"
def search_delete_category(delete_id):
    delete_id = int(delete_id)
    all_base = base_output()

    # Проверка на наличие товаров в поддереве
    if Product.objects.filter(classifier_node_id=delete_id).exists():
        raise ValueError("Нельзя удалить категорию, содержащую товары")

    # Собираем все потомки (включая саму вершину)
    descendants = set()
    stack = [delete_id]
    while stack:
        current_id = stack.pop()
        if current_id in descendants:
            continue
        descendants.add(current_id)
        for node in all_base:
            if node.parent_id == current_id:
                stack.append(node.id)

    # Проверяем наличие товаров в поддереве
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

"Удаляет продукт и связанные с ним значения параметров(product_parameter_value)"
def search_delete_product(delete_id):
    delete_id = int(delete_id)

    ProductParameterValue.objects.filter(product_id=delete_id).delete()

    for element in base_product_output():
        if element.id == delete_id:
            element.delete()
            return

    raise ValueError(f"Товар с id '{delete_id}' не найден")

    raise ValueError(f"Товар с id '{delete_id}' не найден")

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
                'enum_definition': {
                    'id': enum_def.id,
                    'description': enum_def.description,
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

"удаление product_attribute_values"
def delete_product_attribute(product_id):
    product_id = int(product_id)
    elem = ProductAttributeValue.objects.filter(id=product_id).first()
    if elem is None:
        raise ValueError("Нет такого product_attribute")
    elem.delete()

#############################################СПРАВОЧНИК#############################################

"получение всех parameter_definition"
def get_all_parameter_definition():
    return list(ParameterDefinition.objects.all())

"Получение параметров категории с учетом наследования от родителей"
def get_class_parameters_with_inheritance(classifier_node_id):
    all_nodes = base_output()
    parents = search_parent_nodes(all_nodes, classifier_node_id)
    parents = list(reversed(parents))
    node_ids = [p.id for p in parents] + [int(classifier_node_id)]

    params = (
        ParameterDefinition.objects
        .filter(classifier_node_id__in=node_ids)
        .select_related("unit")
        .order_by("classifier_node_id", "sort_order")
    )

    merged = {}
    for p in params:
        merged[p.name] = p

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
    if value_type not in ("str", "int", "real"):
        raise ValueError("value_type должен быть: str, int или real")

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
        if value_type not in ("str", "int", "real"):
            raise ValueError("value_type должен быть: str, int или real")
        pd.value_type = value_type

    if sort_order is not None:
        pd.sort_order = int(sort_order)

    pd.save()
    return pd

"Обновление product_parameter_value(редактирование)"
def update_product_parameter_value(product_parameter_value_id,
                                   value_str=None, value_int=None, value_real=None):
    product_parameter_value_id = int(product_parameter_value_id)

    ppv = ProductParameterValue.objects.filter(id=product_parameter_value_id).first()
    if ppv is None:
        raise ValueError("Нет такого product_parameter_value")

    pd = ParameterDefinition.objects.filter(id=ppv.parameter_definition_id).first()
    if pd is None:
        raise ValueError("Нет такого parameter_definition")

    if value_str is None and value_int is None and value_real is None:
        raise ValueError("Нужно передать хотя бы одно значение")

    if pd.value_type == "str":
        if value_str is None:
            raise ValueError("Для value_type='str' нужно value_str")
        ppv.value_str = value_str
        ppv.value_int = None
        ppv.value_real = None

    elif pd.value_type == "int":
        if value_int is None:
            raise ValueError("Для value_type='int' нужно value_int")
        ppv.value_int = value_int
        ppv.value_str = None
        ppv.value_real = None

    elif pd.value_type == "real":
        if value_real is None:
            raise ValueError("Для value_type='real' нужно value_real")
        ppv.value_real = value_real
        ppv.value_str = None
        ppv.value_int = None

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
            product_params.append({
                "parameter_definition": {
                    "id": pd.id,
                    "name": pd.name,
                    "value_type": pd.value_type,
                    "unit": {
                        "id": pd.unit_id,
                        "name": pd.unit.name if pd.unit else None,
                        "symbol": pd.unit.symbol if pd.unit else None,
                    }
                },
                "value_str": item.value_str,
                "value_int": item.value_int,
                "value_real": item.value_real,
            })

        product_attrs = []
        for item in attrs_by_product.get(p.id, []):
            ev = item.enum_value
            ed = ev.enum_definition if ev else None
            if ev and ed:
                product_attrs.append({
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

        if operator in ("gte", "lte"):
            lookup = None
            value = None
            if "value_int" in f and f["value_int"] is not None:
                lookup = f"value_int__{operator}"
                value = f["value_int"]
            elif "value_real" in f and f["value_real"] is not None:
                lookup = f"value_real__{operator}"
                value = f["value_real"]
            else:
                raise ValueError("В фильтре нет числового значения")
            q &= Q(**{lookup: value})
        elif "value_str" in f:
            q &= Q(value_str=f["value_str"])
        elif "value_int" in f:
            q &= Q(value_int=f["value_int"])
        elif "value_real" in f:
            q &= Q(value_real=f["value_real"])
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

        if operator in ("gte", "lte"):
            lookup = None
            value = None
            if "value_int" in f and f["value_int"] is not None:
                lookup = f"value_int__{operator}"
                value = f["value_int"]
            elif "value_real" in f and f["value_real"] is not None:
                lookup = f"value_real__{operator}"
                value = f["value_real"]
            else:
                raise ValueError("В фильтре нет числового значения")
            q &= Q(**{lookup: value})
        elif "value_str" in f:
            q &= Q(value_str=f["value_str"])
        elif "value_int" in f:
            q &= Q(value_int=f["value_int"])
        elif "value_real" in f:
            q &= Q(value_real=f["value_real"])
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
