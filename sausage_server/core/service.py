from core.models import ClassifierNode, Product


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
