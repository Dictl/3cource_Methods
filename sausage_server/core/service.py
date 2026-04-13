from core.models import ClassifierNode, Product


def base_output():
    all_base = ClassifierNode.objects.all()
    return all_base


def base_product_output():
    all_base_product = Product.objects.all()
    return all_base_product


#проверка на цикл, создаст ли перенос (move_category) цикл
def would_create_cycle(all_base, node_id, new_parent_id):
    if new_parent_id is None:
        return False

    node_id = int(node_id)
    new_parent_id = int(new_parent_id)

    # перенос в самого себя
    if node_id == new_parent_id:
        return True

    # перенос в своего потомка
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


"""
Реализован через обход в глубину с добавлением еще одного параметра level
(для корректного отображение древовидной структуры)
"""
def build_tree_with_levels(all_base, p_id=None, current_level=0):
    result_with_levels = []

    for element in all_base:
        if element.parent_id == p_id:
            element.level = current_level
            result_with_levels.append(element)

            children = build_tree_with_levels(all_base, element.id, current_level + 1)
            result_with_levels.extend(children)

    return result_with_levels


"""
все тот же обход в глубину для !поиска всех дочерних вершин!, только для конкретной выбранной вершины
"""
def search_child_nodes(all_base, node_id):
    result_children_id = []

    for element in all_base:
        if element.parent_id == node_id:
            result_children_id.append(element)
            children_id = search_child_nodes(all_base, element.id)
            result_children_id.extend(children_id)
    return result_children_id


"""
поиск всех товаров и поиск названия категории(для вывода в правой части). Но также используется и для поиска
терминальных классов, т.к. частично тут реализуется
"""
def display_parent_product(all_base, all_base_product, node_id):
    result_product = []
    selected_category = None

    for element in all_base:
        if element.id == node_id:
            selected_category = element.name

    for product in all_base_product:
        if product.classifier_node.id == node_id:
            result_product.append(product)

    for children in search_child_nodes(all_base, node_id):
        for product in all_base_product:
            if children.id == product.classifier_node.id:
                result_product.append(product)

    return selected_category, result_product


"""
поиск всех родителей
"""
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

    # вычисление следующего id для обхода проблемы с sequence
    last_all = ClassifierNode.objects.all().order_by('-id').first()
    if last_all:
        next_id = last_all.id + 1
    else:
        next_id = 1

    last_category = ClassifierNode.objects.filter(parent_id=parent_id).order_by('-sort_order').first()
    if last_category:
        next_sort_order = last_category.sort_order + 1
    else:
        next_sort_order = 0

    new_category = ClassifierNode(
        id=next_id,
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

    # вычисление следующего id для обхода проблемы с sequence
    last_all = Product.objects.all().order_by('-id').first()
    if last_all:
        next_id = last_all.id + 1
    else:
        next_id = 1

    new_product = Product(
        id=next_id,
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
    #проверка есть ли товары у категории
    for product in base_product_output():
        if product.classifier_node_id == int(delete_id):
            raise ValueError("Нельзя удалить категорию, у которой есть товары. Сначала удалите товары")

    parent_delete_category = None
    category_to_delete = None

    for element in base_output():
        if element.id == int(delete_id):
            parent_delete_category = element.parent_id
            category_to_delete = element
            break

    for element in base_output():
        if element.parent_id == int(delete_id):
            element.parent_id = parent_delete_category
            element.save()  # сохранение в БД

    for product in base_product_output():
        if product.classifier_node_id == int(delete_id):
            product.classifier_node_id = parent_delete_category
            product.save()

    if category_to_delete:
        category_to_delete.delete()


def search_delete_product(delete_id):
    product_to_delete = None

    for element in base_product_output():
        if element.id == int(delete_id):
            product_to_delete = element
            break

    if product_to_delete:
        product_to_delete.delete()


"""
перемещение(смена родителя)
"""
def move_category(category_id, new_parent_id):
    category_id = int(category_id)
    if new_parent_id is not None:
        new_parent_id = int(new_parent_id)

    all_nodes = list(base_output())

    # проверка цикла
    if would_create_cycle(all_nodes, category_id, new_parent_id):
        raise ValueError("Нельзя переместить вершину в саму себя или в своего потомка (цикл)")

    for element in all_nodes:
        if element.id == category_id:
            element.parent_id = new_parent_id

            # новый sort_order относительно детей нового родителя
            siblings = []
            for e in all_nodes:
                if e.parent_id == new_parent_id and e.id != category_id:
                    siblings.append(e)

            if siblings:
                max_sort_order = max([s.sort_order for s in siblings])
                element.sort_order = max_sort_order + 1
            else:
                element.sort_order = 0

            element.save()
            break


def reorder_category(category_id, target_position_id):
    
    current = None
    for e in base_output():
        if e.id == int(category_id):
            current = e
            break

    if current is None:
        return

    old_parent_id = current.parent_id

    # Собираем всех братьев (категории с тем же parent_id, исключая текущую)
    siblings = []
    for e in base_output():
        if e.parent_id == old_parent_id and e.id != current.id:
            siblings.append(e)

    # Сортируем братьев по sort_order
    siblings.sort(key=lambda x: x.sort_order)

    # Создаём новый порядок
    if target_position_id is None or target_position_id == '':
        # В начало
        new_order = [current] + siblings
    else:
        target_position_id = int(target_position_id)
        # Находим позицию целевой категории
        target_index = -1
        for i, sib in enumerate(siblings):
            if sib.id == target_position_id:
                target_index = i
                break

        if target_index == -1:
            # Если целевая не найдена, ставим в конец
            new_order = siblings + [current]
        else:
            # Вставляем после целевой
            new_order = siblings[:target_index + 1] + [current] + siblings[target_index + 1:]

    # Обновляем sort_order для всех
    for index, cat in enumerate(new_order):
        cat.sort_order = index
        cat.save()