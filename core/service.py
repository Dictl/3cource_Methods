from core.models import ClassifierNode, Product, EnumDefinition, EnumValue, ProductAttributeValue


def base_output():
    return list(ClassifierNode.objects.all())

def base_product_output():
    return list(Product.objects.all())

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

def build_tree_with_levels(all_base, p_id=None, current_level=0):
    result_with_levels = []

    for element in all_base:
        if element.parent_id == p_id:
            element.level = current_level
            result_with_levels.append(element)
            children = build_tree_with_levels(all_base, element.id, current_level + 1)
            result_with_levels.extend(children)

    return result_with_levels

def search_child_nodes(all_base, node_id):
    result_children = []

    for element in all_base:
        if element.parent_id == node_id:
            result_children.append(element)
            result_children.extend(search_child_nodes(all_base, element.id))

    return result_children

def has_children(all_base, node_id):
    for element in all_base:
        if element.parent_id == node_id:
            return True
    return False

def display_terminal_nodes(all_base, node_id):
    # Ищет все терминальные узлы в поддереве (включая сам узел и его потомков)
    terminal_nodes = []
    for element in all_base:
        if element.id == node_id or (element.parent_id == node_id and not has_children(all_base, element.id)):
            terminal_nodes.append(element)

    return terminal_nodes

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

def search_delete_category(delete_id):
    delete_id = int(delete_id)
    all_base = base_output()  # Все категории

    # Проверка на наличие товаров в самой категории
    if Product.objects.filter(classifier_node_id=delete_id).exists():
        raise ValueError("Нельзя удалить категорию, содержащую товары")

    # Получаем все потомки удаляемей категории
    descendants = set()
    stack = [delete_id]
    while stack:
        current_id = stack.pop()
        descendants.add(current_id)
        for node in all_base:
            if node.parent_id == current_id:
                stack.append(node.id)

    # Определяем терминальные узлы (без потомков)
    terminal_node_ids = [node_id for node_id in descendants
                         if not any(child.id == node_id for child in search_child_nodes(all_base, node_id))]

    # Проверяем, что в терминальных узлах нет товаров
    for node_id in terminal_node_ids:
        if Product.objects.filter(classifier_node_id=node_id).exists():
            raise ValueError(f"Нельзя удалить категорию, у которой есть терминальные узлы с товарами. Узел {node_id} содержит товары")

    # Удаляем все потомки (начиная с самых глубоких)
    for node_id in sorted(descendants, reverse=True):  # Сортируем в обратном порядке для правильного удаления
        if node_id != delete_id:  # Не удаляем саму категорию
            node = ClassifierNode.objects.get(id=node_id)
            node.delete()

    # Удаляем саму категорию
    category = ClassifierNode.objects.get(id=delete_id)
    category.delete()

def search_delete_product(delete_id):
    delete_id = int(delete_id)

    for element in base_product_output():
        if element.id == delete_id:
            element.delete()
            return

    raise ValueError(f"Товар с id '{delete_id}' не найден")

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

def delete_enum_value(enum_value_id):
    enum_value_id = int(enum_value_id)

    ev = EnumValue.objects.filter(id=enum_value_id).first()
    if ev is None:
        raise ValueError("Нет такого enum_value")

    ev.delete()

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

"заполнение таблицы атрибутов"
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

def product_attribute_values_output():
    return list(ProductAttributeValue.objects.all())


