// Вкладка «Каталог»: дерево категорий, товары, карточка товара

var nodesData = [];           // все вершины дерева (с полем level)
var selectedCategoryId = null;

var treeContainer = document.getElementById('treeContainer');
var contentContainer = document.getElementById('contentContainer');
var productCard = document.getElementById('productCard');

var overlay = document.getElementById('overlay');
var modal = document.getElementById('modal');
var moveModal = document.getElementById('moveModal');

var addForm = document.getElementById('addForm');
var moveForm = document.getElementById('moveForm');

var parentSelect = document.getElementById('parent_id');
var moveNodeSelect = document.getElementById('move_node_id');
var newParentSelect = document.getElementById('new_parent_id');
var targetPositionSelect = document.getElementById('target_position');

// ---------- Дерево ----------

function loadTree() {
    return apiRequest('/api/tree/')
        .then(function (data) {
            nodesData = data || [];
            renderTree();
            fillNodeSelects();
        })
        .catch(function (err) {
            treeContainer.innerHTML = '<p class="muted">Ошибка загрузки дерева: ' + escapeHtml(err.message) + '</p>';
        });
}

function renderTree() {
    if (!nodesData.length) {
        treeContainer.innerHTML = '<p class="muted">Дерево пустое</p>';
        return;
    }

    var html = '<ul class="tree">';
    nodesData.forEach(function (n) {
        var cls = n.id === selectedCategoryId ? ' class="selected"' : '';
        html += '<li' + cls + ' style="padding-left:' + (n.level * 20) + 'px">'
            + (hasChildren(n.id) ? '&#9662; ' : '&middot; ')
            + '<a href="#" class="node-link" data-id="' + n.id + '">' + escapeHtml(n.name) + '</a>'
            + '<span class="node-buttons">'
            + '<button type="button" class="small danger delete-category-btn" data-id="' + n.id + '" title="Удалить">&#10005;</button>'
            + '</span>'
            + '</li>';
    });
    html += '</ul>';
    treeContainer.innerHTML = html;
}

function hasChildren(nodeId) {
    for (var i = 0; i < nodesData.length; i++) {
        if (nodesData[i].parent_id === nodeId) return true;
    }
    return false;
}

function getNodeById(nodeId) {
    for (var i = 0; i < nodesData.length; i++) {
        if (nodesData[i].id === nodeId) return nodesData[i];
    }
    return null;
}

function getDescendantsIds(rootId) {
    var result = [];
    var stack = [rootId];
    while (stack.length) {
        var current = stack.pop();
        nodesData.forEach(function (n) {
            if (n.parent_id === current) {
                result.push(n.id);
                stack.push(n.id);
            }
        });
    }
    return result;
}

// ---------- Содержимое категории ----------

function loadCategory(categoryId) {
    selectedCategoryId = categoryId;
    productCard.innerHTML = '';
    clearMessage();
    renderTree();

    return apiRequest('/api/categories/' + categoryId + '/products/')
        .then(renderCategory)
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function renderCategory(data) {
    var category = data.category;

    var html = '<h2>' + escapeHtml(category.name) + '</h2>'
        + '<div class="form-row">'
        + '<span class="muted">Найти:</span>'
        + '<button type="button" class="search-btn" data-type="children">Все подкатегории</button>'
        + '<button type="button" class="search-btn" data-type="parents">Все родители</button>'
        + '<button type="button" class="search-btn" data-type="terminals">Конечные категории</button>'
        + '</div>'
        + '<div id="searchResult"></div>'
        + '<h3>Товары (' + data.products.length + ')</h3>'
        + '<p class="hint">Показаны товары этой категории и всех её подкатегорий. Нажмите на строку, чтобы открыть карточку.</p>';

    if (!data.products.length) {
        html += '<p class="muted">В этой категории нет товаров</p>';
    } else {
        html += '<div class="table-wrap"><table><thead><tr>'
            + '<th>Название</th><th>Обозначение</th><th>Тип</th><th>Цена, руб</th><th>Поставщик</th><th>Вес, г</th><th></th>'
            + '</tr></thead><tbody>';
        data.products.forEach(function (p) {
            html += '<tr class="clickable product-row" data-id="' + p.id + '">'
                + '<td>' + escapeHtml(p.name) + '</td>'
                + '<td>' + escapeHtml(p.designation || '—') + '</td>'
                + '<td>' + productTypeName(p.product_type) + '</td>'
                + '<td class="num">' + formatNumber(p.price) + '</td>'
                + '<td>' + escapeHtml(p.supplier) + '</td>'
                + '<td class="num">' + formatNumber(p.weight_gram) + '</td>'
                + '<td><button type="button" class="small danger delete-product-btn" data-id="' + p.id
                + '" data-name="' + escapeHtml(p.name) + '" title="Удалить">&#10005;</button></td>'
                + '</tr>';
        });
        html += '</tbody></table></div>';
    }

    contentContainer.innerHTML = html;
}

// Поиск родителей / потомков / конечных категорий
function runSearch(type) {
    var titles = {
        children: 'Все подкатегории',
        parents: 'Все родители (от ближнего к корню)',
        terminals: 'Конечные категории (без подкатегорий)'
    };
    var listKey = { children: 'children', parents: 'parents', terminals: 'terminal_nodes' };

    apiRequest('/api/categories/' + selectedCategoryId + '/' + type + '/')
        .then(function (data) {
            var items = data[listKey[type]] || [];
            var html = '<div class="info"><b>' + titles[type] + ':</b> ';
            if (!items.length) {
                html += '<span class="muted">ничего не найдено</span>';
            } else {
                html += items.map(function (n) {
                    return '<a href="#" class="node-link" data-id="' + n.id + '">' + escapeHtml(n.name) + '</a>';
                }).join(', ');
            }
            html += '</div>';
            document.getElementById('searchResult').innerHTML = html;
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

// ---------- Карточка товара ----------

function loadProductCard(productId) {
    apiRequest('/api/products/' + productId + '/')
        .then(function (product) {
            // параметры и атрибуты берём из выборки по категории товара
            return apiRequest('/api/products/for-category/' + product.classifier_node_id + '/with-params/')
                .then(function (items) {
                    var extra = null;
                    for (var i = 0; i < items.length; i++) {
                        if (items[i].product.id === product.id) extra = items[i];
                    }
                    renderProductCard(product, extra || { parameters: [], attributes: [] });
                });
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function paramValue(p) {
    if (p.value_str !== null && p.value_str !== undefined) return escapeHtml(p.value_str);
    if (p.value_int !== null && p.value_int !== undefined) return formatNumber(p.value_int);
    if (p.value_real !== null && p.value_real !== undefined) return formatNumber(p.value_real);
    return '—';
}

function enumValue(v) {
    if (v.value_str) return escapeHtml(v.value_str);
    if (v.value_int !== null) return formatNumber(v.value_int);
    return formatNumber(v.value_real);
}

function renderProductCard(product, extra) {
    var canHaveBom = ['part', 'assembly', 'kit', 'complex'].indexOf(product.product_type) !== -1;

    var html = '<h2>' + escapeHtml(product.name) + '</h2>'
        + '<dl class="props">'
        + '<dt>id</dt><dd>' + product.id + '</dd>'
        + '<dt>Обозначение</dt><dd>' + escapeHtml(product.designation || '—') + '</dd>'
        + '<dt>Тип</dt><dd>' + productTypeName(product.product_type) + '</dd>'
        + '<dt>SKU</dt><dd>' + escapeHtml(product.sku || '—') + '</dd>'
        + '<dt>Цена</dt><dd>' + formatNumber(product.price) + ' руб</dd>'
        + '<dt>Поставщик</dt><dd>' + escapeHtml(product.supplier) + '</dd>'
        + '<dt>Вес</dt><dd>' + formatNumber(product.weight_gram) + ' г</dd>';
    if (product.base_product_id) {
        html += '<dt>Модификация от</dt><dd><a href="#" class="open-product" data-id="' + product.base_product_id
            + '">изделия id=' + product.base_product_id + '</a></dd>';
    }
    html += '</dl>';

    if (canHaveBom) {
        html += '<p><a href="#bom/' + product.id + '">Открыть спецификацию (состав) &rarr;</a></p>';
    } else {
        html += '<p class="hint">Это ' + productTypeName(product.product_type).toLowerCase()
            + ' &mdash; у него нет своего состава, оно само входит в состав других изделий.</p>';
    }

    html += '<h3>Параметры</h3>';
    html += renderTable([
        { title: 'Параметр', render: function (p) { return escapeHtml(p.parameter_definition.name); } },
        { title: 'Значение', render: paramValue, num: true },
        { title: 'Ед. изм.', render: function (p) { return escapeHtml(p.parameter_definition.unit.symbol || ''); } }
    ], extra.parameters, 'Параметры не заполнены');

    html += '<h3>Характеристики</h3>';
    html += renderTable([
        { title: 'Перечисление', render: function (a) { return escapeHtml(a.enum_definition.description); } },
        { title: 'Значение', render: function (a) { return enumValue(a.enum_value); } }
    ], extra.attributes, 'Характеристики не заданы');

    productCard.innerHTML = html;
    productCard.scrollIntoView();
}

// ---------- Окна добавления / перемещения ----------

function openModal(which) {
    which.hidden = false;
    overlay.hidden = false;
}

function closeModals() {
    modal.hidden = true;
    moveModal.hidden = true;
    overlay.hidden = true;
}

function fillNodeSelects() {
    var options = '';
    nodesData.forEach(function (n) {
        var indent = new Array(n.level + 1).join('   ');
        options += '<option value="' + n.id + '">' + indent + escapeHtml(n.name) + '</option>';
    });

    parentSelect.innerHTML = '<option value="">— Корень —</option>' + options;
    newParentSelect.innerHTML = '<option value="">— Корень —</option>' + options;
    moveNodeSelect.innerHTML = '<option value="">— Выберите —</option>' + options;

    if (selectedCategoryId) parentSelect.value = selectedCategoryId;
}

function toggleProductFields() {
    var isProduct = document.getElementById('type_product').checked;
    document.getElementById('product_fields').hidden = !isProduct;
    document.getElementById('unit_field').hidden = isProduct;
}

function toggleMoveType() {
    var reorder = document.getElementById('move_type_sibling').checked;
    document.getElementById('target_parent_div').hidden = reorder;
    document.getElementById('target_position_div').hidden = !reorder;
}

// Нельзя переместить вершину в себя или в потомка — такие пункты отключаем
function updateMoveOptions() {
    var selectedId = parseInt(moveNodeSelect.value, 10);
    var blocked = selectedId ? getDescendantsIds(selectedId).concat([selectedId]) : [];

    for (var i = 0; i < newParentSelect.options.length; i++) {
        var opt = newParentSelect.options[i];
        var isBlocked = blocked.indexOf(parseInt(opt.value, 10)) !== -1;
        opt.disabled = isBlocked;
        opt.classList.toggle('error-option', isBlocked);
    }

    var node = getNodeById(selectedId);
    if (!node) {
        targetPositionSelect.innerHTML = '<option value="">— Сначала выберите вершину —</option>';
        return;
    }
    var html = '<option value="">— В начало —</option>';
    nodesData.forEach(function (n) {
        if (n.id !== selectedId && n.parent_id === node.parent_id) {
            html += '<option value="' + n.id + '">' + escapeHtml(n.name) + '</option>';
        }
    });
    targetPositionSelect.innerHTML = html;
}

function afterChange(message) {
    showMessage(message, 'success');
    closeModals();
    return loadTree().then(function () {
        if (selectedCategoryId && getNodeById(selectedCategoryId)) {
            loadCategory(selectedCategoryId).then(function () { showMessage(message, 'success'); });
        }
    });
}

addForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var isProduct = document.getElementById('type_product').checked;
    var payload = {
        name: document.getElementById('name').value,
        parent_id: parentSelect.value || null
    };
    var url = '/api/categories/add/';

    if (isProduct) {
        url = '/api/products/add/';
        payload.sku = document.getElementById('sku').value || null;
        payload.price = document.getElementById('price').value || 0;
        payload.supplier = document.getElementById('supplier').value;
        payload.weight_gram = document.getElementById('weight_gram').value || 0;
    } else {
        payload.unit = document.getElementById('unit').value || null;
    }

    apiRequest(url, 'POST', payload)
        .then(function () {
            addForm.reset();
            toggleProductFields();
            return afterChange('Добавлено');
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
});

moveForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var categoryId = parseInt(moveNodeSelect.value, 10);
    var url, payload;

    if (document.getElementById('move_type_sibling').checked) {
        url = '/api/categories/reorder/';
        payload = {
            category_id: categoryId,
            target_position_id: targetPositionSelect.value ? parseInt(targetPositionSelect.value, 10) : null
        };
    } else {
        url = '/api/categories/move/';
        payload = {
            category_id: categoryId,
            new_parent_id: newParentSelect.value ? parseInt(newParentSelect.value, 10) : null
        };
    }

    apiRequest(url, 'PUT', payload)
        .then(function () { return afterChange('Перемещено'); })
        .catch(function (err) { showMessage(err.message, 'error'); });
});

function deleteItem(type, id, name) {
    if (!confirm('Удалить «' + name + '»?')) return;
    var url = type === 'category' ? '/api/categories/delete/' : '/api/products/delete/';

    apiRequest(url, 'DELETE', { delete_id: id })
        .then(function () {
            if (type === 'category' && id === selectedCategoryId) {
                selectedCategoryId = null;
                contentContainer.innerHTML = '<p class="muted">Выберите категорию в дереве слева.</p>';
                productCard.innerHTML = '';
            }
            return afterChange('Удалено');
        })
        .catch(function (err) { showMessage(err.message, 'error'); });
}

// ---------- Обработчики ----------

document.getElementById('tab-catalog').addEventListener('click', function (e) {
    var t = e.target;

    if (t.closest('.node-link')) {
        e.preventDefault();
        loadCategory(parseInt(t.closest('.node-link').getAttribute('data-id'), 10));
    } else if (t.closest('.delete-category-btn')) {
        var id = parseInt(t.closest('.delete-category-btn').getAttribute('data-id'), 10);
        deleteItem('category', id, getNodeById(id).name);
    } else if (t.closest('.delete-product-btn')) {
        var btn = t.closest('.delete-product-btn');
        deleteItem('product', parseInt(btn.getAttribute('data-id'), 10), btn.getAttribute('data-name'));
    } else if (t.closest('.product-row')) {
        loadProductCard(parseInt(t.closest('.product-row').getAttribute('data-id'), 10));
    } else if (t.closest('.open-product')) {
        e.preventDefault();
        loadProductCard(parseInt(t.closest('.open-product').getAttribute('data-id'), 10));
    } else if (t.closest('.search-btn')) {
        runSearch(t.closest('.search-btn').getAttribute('data-type'));
    }
});

document.getElementById('openModalBtn').onclick = function () { openModal(modal); };
document.getElementById('openMoveModalBtn').onclick = function () {
    openModal(moveModal);
    updateMoveOptions();
};

var cancelButtons = document.querySelectorAll('.cancel-btn');
for (var i = 0; i < cancelButtons.length; i++) cancelButtons[i].onclick = closeModals;
overlay.onclick = closeModals;
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModals();
});

document.getElementById('type_category').onchange = toggleProductFields;
document.getElementById('type_product').onchange = toggleProductFields;
document.getElementById('move_type_parent').onchange = toggleMoveType;
document.getElementById('move_type_sibling').onchange = toggleMoveType;
moveNodeSelect.onchange = updateMoveOptions;

toggleProductFields();
toggleMoveType();
loadTree();
