from django.shortcuts import render, redirect
from django.contrib import messages
from .service import *


def home(request):
    if request.method == 'POST':
        # проверка на удаление
        if 'delete_type' in request.POST:
            delete_type = request.POST.get('delete_type')
            delete_id = request.POST.get('delete_id')

            try:
                if delete_type == 'category':
                    search_delete_category(delete_id)
                elif delete_type == 'product':
                    search_delete_product(delete_id)
            except Exception as e:
                messages.error(request, str(e))

            return redirect(request.path)

        # проверка на перемещение вершины
        if 'move_action' in request.POST:
            move_node_id = request.POST.get('move_node_id')
            move_type = request.POST.get('move_type')

            try:
                if move_type == 'change_parent':
                    new_parent_id = request.POST.get('new_parent_id')
                    if new_parent_id == '':
                        new_parent_id = None
                    else:
                        new_parent_id = int(new_parent_id)
                    move_category(move_node_id, new_parent_id)
                elif move_type == 'reorder':
                    target_position = request.POST.get('target_position')
                    if target_position == '':
                        target_position = None
                    else:
                        target_position = int(target_position)
                    reorder_category(move_node_id, target_position)
            except Exception as e:
                messages.error(request, str(e))

            return redirect(request.path)

        # добавление
        node_type = request.POST.get('node_type')
        name = request.POST.get('name')
        parent_id = request.POST.get('parent_id')

        if parent_id == '':
            parent_id = None
        else:
            parent_id = int(parent_id)

        try:
            if node_type == 'category':
                unit = request.POST.get('unit')
                add_category(name, parent_id, unit)
            elif node_type == 'product':
                sku = request.POST.get('sku')
                price = int(request.POST.get('price'))
                supplier = request.POST.get('supplier')
                weight_gram = int(request.POST.get('weight_gram'))
                add_product(name, parent_id, sku, price, supplier, weight_gram)

            return redirect(request.path)

        except ValueError as e:
            messages.error(request, str(e))

    all_categories = base_output()
    nodes = build_tree_with_levels(all_categories)

    node_id = request.GET.get('node_id')

    if node_id:
        node_id = int(node_id)

    selected_category = None
    products = []

    if node_id:
        all_products = base_product_output()
        selected_category, products = display_parent_product(all_categories, all_products, node_id)

    #обработка поиска
    search_category_id = request.GET.get('search_category_id')
    search_type = request.GET.get('search_type')

    search_category = None
    descendants = []
    parents = []
    terminal_products = []

    if search_category_id:
        search_category_id = int(search_category_id)
        all_cats = base_output()
        all_prods = base_product_output()

        # Находим выбранную категорию
        for cat in all_cats:
            if cat.id == search_category_id:
                search_category = cat
                break

        if search_type == 'descendants':
            descendants = search_child_nodes(all_cats, search_category_id)
        elif search_type == 'parents':
            parents = search_parent_nodes(all_cats, search_category_id)
        elif search_type == 'terminals':
            all_descendants = search_child_nodes(all_cats, search_category_id)
            all_descendants.append(search_category)
            category_ids = [cat.id for cat in all_descendants]
            for product in all_prods:
                if product.classifier_node.id in category_ids:
                    terminal_products.append(product)

    return render(request, 'home.html', {
        'nodes': nodes,
        'selected_category': selected_category,
        'products': products,
        'search_category': search_category,
        'search_type': search_type,
        'descendants': descendants,
        'parents': parents,
        'terminal_products': terminal_products,
    })