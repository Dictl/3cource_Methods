// Вкладка «Каталог»: дерево категорий, товары, карточка товара

var nodesData = [];           // все вершины дерева (с полем level)
var selectedCategoryId = null;
var expandedNodeIds = {};

var treeContainer = document.getElementById('treeContainer');
var contentContainer = document.getElementById('contentContainer');
var productCard = document.getElementById('productCard');

var overlay = document.getElementById('overlay');
var modal = document.getElementById('modal');
var moveModal = document.getElementById('moveModal');
var productSearchPanel = document.getElementById('productSearchPanel');
var productSearchCategory = document.getElementById('productSearchCategory');
var productSearchFilters = document.getElementById('productSearchFilters');

var addForm = document.getElementById('addForm');
var moveForm = document.getElementById('moveForm');

var parentSelect = document.getElementById('parent_id');
var moveNodeSelect = document.getElementById('move_node_id');
var newParentSelect = document.getElementById('new_parent_id');
var targetPositionSelect = document.getElementById('target_position');
var baseUnitSelect = document.getElementById('base_unit_id');

// ---------- Дерево ----------

function loadTree() {
    window.__treeLoadStarted = true;
    treeContainer.innerHTML = '<p class="muted">Загрузка...</p>';
    return apiRequest('/api/tree/')
        .then(function (data) {
            nodesData = data || [];
            expandedNodeIds = {};
            renderTree();
            fillNodeSelects();
        })
        .catch(function (err) {
            treeContainer.innerHTML = '<p class="error">Ошибка загрузки дерева: ' + escapeHtml(err.message) + '</p>';
        });
}

function loadBaseUnits() {
    return apiRequest('/api/units/').then(function (units) {
        baseUnitSelect.innerHTML = '<option value="">— Не выбрана —</option>';
        units.forEach(function (unit) {
            baseUnitSelect.innerHTML += '<option value="' + unit.id + '">' + escapeHtml(unit.symbol + ' — ' + unit.name) + '</option>';
        });
    });
}

function renderTree() {
    if (!nodesData.length) {
        treeContainer.innerHTML = '<p class="muted">Дерево пустое</p>';
        return;
    }

    var html = '<ul class="tree">';
    nodesData.forEach(function (n) {
        if (!isNodeVisible(n)) return;
        var cls = ' class="tree-level-' + Math.min(n.level, 4)
            + (n.id === selectedCategoryId ? ' selected' : '') + '"';
        var children = hasChildren(n.id);
        var expanded = Boolean(expandedNodeIds[n.id]);
        html += '<li' + cls + ' style="padding-left:' + (n.level * 20) + 'px">'
            + (children
                ? '<button type="button" class="tree-toggle" data-id="' + n.id + '" aria-label="' + (expanded ? 'Свернуть' : 'Развернуть') + '">'
                    + (expanded ? '&#9662;' : '&#9656;') + '</button> '
                : '<span class="tree-leaf">&#8226;</span> ')
            + '<a href="#" class="node-link" data-id="' + n.id + '">' + escapeHtml(n.name) + '</a>'
            + '<span class="node-buttons">'
            + '<button type="button" class="small danger delete-category-btn" data-id="' + n.id + '" title="Удалить">&#10005;</button>'
            + '</span>'
            + '</li>';
    });
    html += '</ul>';
    treeContainer.innerHTML = html;
}

function isNodeVisible(node) {
    var parentId = node.parent_id;
    while (parentId !== null && parentId !== undefined) {
        if (!expandedNodeIds[parentId]) return false;
        var parent = getNodeById(parentId);
        if (!parent) return false;
        parentId = parent.parent_id;
    }
    return true;
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

// Поиск и фильтры должны быть доступны обработчикам страницы, а не только
// локальной функции renderCategory.
function renderCategorySearch(data, type) {
    var key = type === 'children' ? 'children' : type === 'parents' ? 'parents' : 'terminal_nodes';
    var items = data[key] || [];
    var title = type === 'children' ? 'Потомки' : type === 'parents' ? 'Родители' : 'Терминальные классы';
    var html = '<h2>' + escapeHtml(data.category.name) + ': ' + title + '</h2>';
    if (!items.length) {
        html += '<p class="muted">Ничего не найдено</p>';
    } else {
        html += '<ul>';
        items.forEach(function (item) {
            html += '<li><a href="#" class="node-link" data-id="' + item.id + '">' + escapeHtml(item.name) + '</a></li>';
        });
        html += '</ul>';
    }
    contentContainer.innerHTML = html;
}

function loadProductSearchCategories() {
    var html = '<option value="">Все классы</option>';
    nodesData.forEach(function (n) {
        html += '<option value="' + n.id + '">' + new Array(n.level + 1).join('   ') + escapeHtml(n.name) + '</option>';
    });
    productSearchCategory.innerHTML = html;
}

function loadProductSearchParameters() {
    var categoryId = productSearchCategory.value;
    productSearchFilters.innerHTML = '';
    if (!categoryId) return Promise.resolve();
    return apiRequest('/api/parameters/for-category/' + categoryId + '/').then(function (params) {
        params.forEach(function (p) {
            var input;
            if (p.value_type === 'enum') {
                input = '<select class="filter-value"><option value="">Любое значение</option>'
                    + (p.enum_values || []).map(function (v) {
                        var value = v.value_str !== null ? v.value_str
                            : formatNumber(v.value_int !== null ? v.value_int : v.value_real);
                        return '<option value="' + v.id + '">' + escapeHtml(value) + '</option>';
                    }).join('') + '</select>';
            } else if (p.value_type === 'str') {
                var allowedValues = p.allowed_values || [];
                input = allowedValues.length
                    ? '<select class="filter-value"><option value="">Любое значение</option>'
                        + allowedValues.map(function (value) {
                            return '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + '</option>';
                        }).join('') + '</select>'
                    : '<input type="text" class="filter-value" placeholder="Любое значение">';
            } else {
                var minValue = p.min_value !== null && p.min_value !== undefined ? p.min_value : 0;
                var maxAttribute = p.max_value !== null && p.max_value !== undefined
                    ? ' max="' + p.max_value + '"' : '';
                input = '<span class="range-fields">'
                    + '<input type="number" class="filter-min" placeholder="от" min="' + minValue
                        + '"' + maxAttribute + ' step="' + (p.value_type === 'int' ? '1' : 'any') + '">'
                    + '<input type="number" class="filter-max" placeholder="до" min="' + minValue
                        + '"' + maxAttribute + ' step="' + (p.value_type === 'int' ? '1' : 'any') + '">'
                    + '</span>';
            }
            productSearchFilters.innerHTML += '<div class="form-row parameter-filter" data-id="' + p.id
                + '" data-type="' + p.value_type + '">'
                + '<label>' + escapeHtml(p.name) + '</label>' + input
                + (p.unit_symbol ? '<span class="parameter-unit">' + escapeHtml(p.unit_symbol) + '</span>' : '')
                + '</div>';
        });
    });
}

function renderProductSearchResults(products) {
    var html = '<h2>Результаты поиска</h2>'
        + '<h3>Товары (' + products.length + ')</h3>'
        + '<p class="hint">Нажмите на строку, чтобы открыть карточку изделия.</p>';

    if (!products.length) {
        html += '<p class="muted">Изделия не найдены</p>';
    } else {
        html += '<div class="table-wrap"><table><thead><tr>'
            + '<th>Название</th><th>Обозначение</th><th>Тип</th><th>Цена, руб</th><th>Поставщик</th><th>Вес, г</th><th></th>'
            + '</tr></thead><tbody>';
        products.forEach(function (p) {
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
            return Promise.all([
                apiRequest('/api/products/for-category/' + product.classifier_node_id + '/with-params/'),
                apiRequest('/api/parameters/for-category/' + product.classifier_node_id + '/'),
                apiRequest('/api/enums/for-class-tree/' + product.classifier_node_id + '/'),
                apiRequest('/api/units/')
            ]).then(function (results) {
                var items = results[0];
                var available = results[1] || [];
                var availableEnums = results[2] || [];
                var availableUnits = results[3] || [];
                var extra = null;
                for (var i = 0; i < items.length; i++) {
                    if (items[i].product.id === product.id) extra = items[i];
                }
                renderProductCard(product, extra || { parameters: [], attributes: [] }, available, availableEnums, availableUnits);
            });
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function isStaff() {
    return document.body.classList.contains('staff');
}

// Не-администратору сервер изменения запрещает — не показываем ему кнопки
function staffOnly(html) {
    return isStaff() ? html : '';
}

function formatEnumValue(v) {
    if (v.value_str !== null && v.value_str !== undefined && v.value_str !== '') return escapeHtml(v.value_str);
    if (v.value_int !== null && v.value_int !== undefined) return formatNumber(v.value_int);
    if (v.value_real !== null && v.value_real !== undefined) return formatNumber(v.value_real);
    return '—';
}

function parameterInputHtml(param, current) {
    var type = param.value_type;
    if (type === 'enum') {
        return '<select name="value">' + (param.enum_values || []).map(function (v) {
            return '<option value="' + v.id + '"'
                + (current !== null && String(current) === String(v.id) ? ' selected' : '') + '>'
                + formatEnumValue(v) + '</option>';
        }).join('') + '</select>';
    }
    if (type === 'int' || type === 'real') {
        var step = type === 'int' ? '1' : '0.01';
        var numberValue = current === null || current === undefined ? '' : current;
        return '<input name="value" type="number" min="0" step="' + step + '" value="' + escapeHtml(numberValue) + '">';
    }
    return '<input name="value" value="' + escapeHtml(current === null || current === undefined ? '' : current) + '">';
}

function parameterCurrentValue(p) {
    if (p.parameter_definition.value_type === 'enum') return p.value_enum_id;
    if (p.value_str !== null && p.value_str !== undefined) return p.value_str;
    if (p.value_int !== null && p.value_int !== undefined) return p.value_int;
    if (p.value_real !== null && p.value_real !== undefined) return p.value_real;
    return null;
}

function renderProductCard(product, extra, availableParameters, availableEnums, availableUnits) {
    var usedParameterIds = {};
    (extra.parameters || []).forEach(function (p) { usedParameterIds[p.parameter_definition.id] = true; });
    var missingParameters = (availableParameters || []).filter(function (p) {
        return !usedParameterIds[p.id];
    });

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
    html += '<h3>Редактирование изделия</h3>'
        + '<form id="productEditForm" class="form-row" data-id="' + product.id + '">'
        + '<label>Название <input name="name" value="' + escapeHtml(product.name) + '" required></label>'
        + '<label>Обозначение <input name="designation" value="' + escapeHtml(product.designation || '') + '"></label>'
        + '<label>SKU <input name="sku" value="' + escapeHtml(product.sku || '') + '"></label>'
        + '<label>Цена <input name="price" type="number" min="0" value="' + product.price + '"></label>'
        + '<label>Поставщик <input name="supplier" value="' + escapeHtml(product.supplier || '') + '"></label>'
        + '<label>Вес, г <input name="weight_gram" type="number" min="0" value="' + product.weight_gram + '"></label>'
        + '<button type="submit">Сохранить изделие</button></form>';

    var canHaveBom = ['part', 'assembly', 'kit', 'complex'].indexOf(product.product_type) !== -1;
    if (canHaveBom) {
        html += '<p><a href="#bom/' + product.id + '">Открыть спецификацию (состав) &rarr;</a></p>';
    } else {
        html += '<p class="hint">Это ' + productTypeName(product.product_type).toLowerCase()
            + ' &mdash; у него нет своего состава, оно само входит в состав других изделий.</p>';
    }

    if (missingParameters.length) {
        html += '<form id="productParameterCreateForm" data-product-id="' + product.id + '" class="form-row">'
            + '<select name="parameter_definition_id" required>'
            + missingParameters.map(function (p) {
                return '<option value="' + p.id + '" data-type="' + p.value_type + '" data-enum-values="'
                    + escapeHtml(JSON.stringify(p.enum_values || [])) + '">' + escapeHtml(p.name) + '</option>';
            }).join('')
            + '</select>'
            + '<span class="parameter-create-field">'
            + parameterInputHtml(missingParameters[0], null)
            + '</span>'
            + '<button type="submit">Добавить параметр</button>'
            + '</form>';
    }

    html += '<h3>Параметры</h3>';
    if ((extra.parameters || []).length) {
        html += '<div class="table-wrap"><table class="refs-table product-params-table"><thead><tr>'
            + '<th>Параметр</th><th>Значение</th><th>Ед. изм.</th><th class="action-cell">Действия</th>'
            + '</tr></thead><tbody>';
        (extra.parameters || []).forEach(function (p) {
            html += '<tr class="parameter-edit" data-product-id="' + product.id + '" data-ppv-id="' + p.id
                + '" data-type="' + p.parameter_definition.value_type + '">'
                + '<td>' + escapeHtml(p.parameter_definition.name) + '</td>'
                + '<td class="num">' + parameterInputHtml(p.parameter_definition, parameterCurrentValue(p)) + '</td>'
                + '<td class="num">' + escapeHtml(p.parameter_definition.unit ? p.parameter_definition.unit.symbol || '' : '') + '</td>'
                + '<td class="action-cell">'
                + staffOnly('<button type="button" class="save-parameter-btn">Сохранить</button>'
                    + '<button type="button" class="danger delete-parameter-btn" data-ppv-id="' + p.id + '">Удалить</button>')
                + '</td></tr>';
        });
        html += '</tbody></table></div>';
    } else {
        html += '<p class="muted">Значения параметров не заданы</p>';
    }

    // Характеристика — это значение перечисления из справочника, закреплённое за изделием.
    html += '<h3>Характеристики</h3>';
    if (extra.attributes && extra.attributes.length) {
        html += '<div class="table-wrap"><table class="refs-table product-params-table product-attributes-table"><thead><tr>'
            + '<th>Характеристика</th><th>Значение</th><th>Состав</th><th class="action-cell">Действия</th>'
            + '</tr></thead><tbody>';
        extra.attributes.forEach(function (a) {
            var composition = a.enum_value.value_real;
            html += '<tr class="attribute-edit" data-product-id="' + product.id + '" data-attribute-id="' + a.id + '">'
                + '<td>' + escapeHtml(a.enum_definition.description || '—') + '</td>'
                + '<td>' + formatEnumValue(a.enum_value) + '</td>'
                + '<td class="num">' + (composition === null || composition === undefined
                    ? '—' : formatNumber(composition) + ' ' + escapeHtml(a.enum_definition.unit_symbol || '')) + '</td>'
                + '<td class="action-cell">'
                + staffOnly('<button type="button" class="danger delete-attribute-btn" data-attribute-id="' + a.id + '">Удалить</button>')
                + '</td></tr>';
        });
        html += '</tbody></table></div>';
    } else {
        html += '<p class="muted">Характеристики не заданы</p>';
    }

    if (!(availableEnums || []).length) {
        html += '<p class="hint">Для класса изделия не задано ни одного перечисления &mdash; добавить характеристику нельзя. '
            + 'Перечисления и их значения задаются во вкладке «Справочники».</p>';
    } else {
        html += '<form id="productCharacteristicForm" data-product-id="' + product.id + '" class="form-row">'
            + '<select name="enum_definition_id" required>'
            + availableEnums.map(function (e) {
                return '<option value="' + e.id + '" data-values="' + escapeHtml(JSON.stringify(e.values || [])) + '">'
                    + escapeHtml(e.description) + '</option>';
            }).join('')
            + '</select>'
            + '<select name="enum_value_id" required>'
            + (availableEnums[0].values || []).map(function (v) {
                return '<option value="' + v.id + '">' + formatEnumValue(v) + '</option>';
            }).join('')
            + '</select>'
            + '<input name="new_value" placeholder="Своё значение (необязательно)">'
            + '<button type="submit">Добавить характеристику</button>'
            + '</form>';
    }

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

function afterChange(message, type) {
    showMessage(message, type || 'success');
    closeModals();
    return loadTree().then(function () {
        if (selectedCategoryId && getNodeById(selectedCategoryId)) {
            loadCategory(selectedCategoryId).then(function () { showMessage(message, type || 'success'); });
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
        payload.base_unit_id = baseUnitSelect.value || null;
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
            return afterChange('Удалено', 'delete');
        })
        .catch(function (err) { showMessage(err.message, 'error'); });
}

// ---------- Обработчики ----------

document.getElementById('tab-catalog').addEventListener('click', function (e) {
    var t = e.target;

    if (t.closest('.tree-toggle')) {
        e.preventDefault();
        var toggle = t.closest('.tree-toggle');
        var nodeId = parseInt(toggle.getAttribute('data-id'), 10);
        expandedNodeIds[nodeId] = !expandedNodeIds[nodeId];
        renderTree();
    } else if (t.closest('.search-btn')) {
        e.preventDefault();
        runSearch(t.closest('.search-btn').getAttribute('data-type'));
    } else if (t.closest('.node-link')) {
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
    } else if (t.closest('.product-search-result')) {
        e.preventDefault();
        loadProductCard(parseInt(t.closest('.product-search-result').getAttribute('data-id'), 10));
    }
});

document.getElementById('openProductSearchBtn').onclick = function () {
    productSearchPanel.hidden = false;
    loadProductSearchCategories();
};
document.getElementById('closeProductSearchPanel').onclick = function () { productSearchPanel.hidden = true; };
productSearchCategory.onchange = loadProductSearchParameters;
document.getElementById('productSearchForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var filters = [];
    var invalidRange = false;
    document.querySelectorAll('.parameter-filter').forEach(function (row) {
        var type = row.getAttribute('data-type');
        var parameterId = parseInt(row.getAttribute('data-id'), 10);
        if (type === 'enum') {
            var enumValue = row.querySelector('.filter-value').value;
            if (enumValue) filters.push({ parameter_definition_id: parameterId, value_enum_id: parseInt(enumValue, 10) });
            return;
        }
        if (type === 'str') {
            var textValue = row.querySelector('.filter-value').value.trim();
            if (textValue) filters.push({ parameter_definition_id: parameterId, value_str: textValue, operator: 'contains' });
            return;
        }
        var field = type === 'int' ? 'value_int' : 'value_real';
        var min = row.querySelector('.filter-min').value;
        var max = row.querySelector('.filter-max').value;
        var allowedMin = Number(row.querySelector('.filter-min').getAttribute('min'));
        if ((min !== '' && Number(min) < allowedMin) || (max !== '' && Number(max) < allowedMin)) {
            invalidRange = true;
            return;
        }
        if (min !== '' && max !== '' && Number(min) > Number(max)) {
            invalidRange = true;
            return;
        }
        if (min !== '') {
            var minFilter = { parameter_definition_id: parameterId, operator: 'gte' };
            minFilter[field] = type === 'int' ? parseInt(min, 10) : parseFloat(min);
            filters.push(minFilter);
        }
        if (max !== '') {
            var maxFilter = { parameter_definition_id: parameterId, operator: 'lte' };
            maxFilter[field] = type === 'int' ? parseInt(max, 10) : parseFloat(max);
            filters.push(maxFilter);
        }
    });
    if (invalidRange) {
        showMessage('Минимальное значение не может быть больше максимального', 'error');
        return;
    }
    var categoryId = productSearchCategory.value;
    var url = categoryId ? '/api/products/for-category/' + categoryId + '/filter/' : '/api/products/filter/';
    apiRequest(url, 'POST', { filters: filters }).then(renderProductSearchResults)
        .catch(function (err) { showMessage(err.message, 'error'); });
});

document.addEventListener('submit', function (e) {
    if (e.target.id !== 'productEditForm') return;
    e.preventDefault();
    var payload = { product_id: e.target.getAttribute('data-id') };
    new FormData(e.target).forEach(function (value, key) { payload[key] = value; });
    apiRequest('/api/products/update/', 'PUT', payload).then(function () {
        showMessage('Изделие сохранено', 'success');
        loadProductCard(parseInt(payload.product_id, 10));
    }).catch(function (err) { showMessage(err.message, 'error'); });
});

document.addEventListener('change', function (e) {
    if (e.target.name === 'parameter_definition_id' && e.target.closest('#productParameterCreateForm')) {
        var parameterForm = e.target.closest('#productParameterCreateForm');
        var parameterOption = e.target.options[e.target.selectedIndex];
        parameterForm.querySelector('.parameter-create-field').innerHTML = parameterInputHtml({
            value_type: parameterOption.getAttribute('data-type'),
            enum_values: JSON.parse(parameterOption.getAttribute('data-enum-values') || '[]')
        }, null);
        return;
    }
    if (e.target.name !== 'enum_definition_id' || !e.target.closest('#productCharacteristicForm')) return;
    var characteristicForm = e.target.closest('#productCharacteristicForm');
    var values = JSON.parse(e.target.options[e.target.selectedIndex].getAttribute('data-values') || '[]');
    characteristicForm.querySelector('[name="enum_value_id"]').innerHTML = values.map(function (v) {
        return '<option value="' + v.id + '">' + formatEnumValue(v) + '</option>';
    }).join('');
});

document.addEventListener('click', function (e) {
    var saveButton = e.target.closest('.save-parameter-btn');
    if (saveButton) {
        createOrUpdateParameterValue(saveButton.closest('.parameter-edit'), 'PUT', false);
        return;
    }

    var deleteParameterButton = e.target.closest('.delete-parameter-btn');
    if (deleteParameterButton) {
        var parameterRow = deleteParameterButton.closest('.parameter-edit');
        if (!confirm('Удалить параметр?')) return;
        apiRequest('/api/product-parameters/' + parseInt(deleteParameterButton.getAttribute('data-ppv-id'), 10) + '/delete/', 'DELETE')
            .then(function () {
                showMessage('Параметр удалён', 'delete');
                loadProductCard(parseInt(parameterRow.getAttribute('data-product-id'), 10));
            })
            .catch(function (err) { showMessage(err.message, 'error'); });
        return;
    }

    var deleteAttributeButton = e.target.closest('.delete-attribute-btn');
    if (!deleteAttributeButton) return;
    var attributeRow = deleteAttributeButton.closest('.attribute-edit');
    if (!confirm('Удалить характеристику?')) return;
    apiRequest('/api/product-attributes/delete', 'DELETE', {
        product_attribute_value_id: parseInt(deleteAttributeButton.getAttribute('data-attribute-id'), 10)
    })
        .then(function () {
            showMessage('Характеристика удалена', 'delete');
            loadProductCard(parseInt(attributeRow.getAttribute('data-product-id'), 10));
        })
        .catch(function (err) { showMessage(err.message, 'error'); });
});
document.addEventListener('submit', function (e) {
    if (e.target.id === 'productParameterCreateForm') {
        e.preventDefault();
        createOrUpdateParameterValue(e.target, 'POST');
        return;
    }
    if (e.target.id === 'productCharacteristicForm') {
        e.preventDefault();
        createCharacteristic(e.target);
        return;
    }
});

// Строка таблицы параметров и форма добавления устроены одинаково,
// это позволяет сохранять и новые, и уже заданные значения одной функцией.
function createOrUpdateParameterValue(source, method) {
    var isNew = method === 'POST';
    var field = source.querySelector('[name="value"]');
    var value = field ? field.value : '';
    if (isNew && value === '') {
        showMessage('Введите значение параметра', 'error');
        return;
    }

    var productId = parseInt(source.getAttribute('data-product-id'), 10);
    var payload = { product_id: productId };
    var type = source.getAttribute('data-type');

    if (isNew) {
        var select = source.querySelector('select[name="parameter_definition_id"]');
        payload.parameter_definition_id = parseInt(select.value, 10);
        type = select.options[select.selectedIndex].getAttribute('data-type');
    } else {
        payload.product_parameter_value_id = parseInt(source.getAttribute('data-ppv-id'), 10);
    }

    if (type === 'int') {
        payload.value_int = parseInt(value, 10);
    } else if (type === 'real') {
        payload.value_real = parseFloat(value);
    } else if (type === 'enum') {
        payload.value_enum_id = parseInt(value, 10);
    } else {
        payload.value_str = value;
    }

    var url = isNew ? '/api/product-parameters/create/' : '/api/product-parameters/update/';
    apiRequest(url, method, payload)
        .then(function () {
            showMessage(isNew ? 'Параметр добавлен' : 'Параметр сохранён', 'success');
            loadProductCard(productId);
        })
        .catch(function (err) { showMessage(err.message, 'error'); });
}

// Характеристика — значение перечисления из справочника либо новое значение для него
function createCharacteristic(form) {
    var productId = parseInt(form.getAttribute('data-product-id'), 10);
    var newValue = form.querySelector('[name="new_value"]').value.trim();
    var valuePromise = newValue
        ? apiRequest('/api/enum-values/add/', 'POST', {
            enum_definition_id: parseInt(form.querySelector('[name="enum_definition_id"]').value, 10),
            value_str: newValue
        })
        : Promise.resolve({ id: parseInt(form.querySelector('[name="enum_value_id"]').value, 10) });

    valuePromise.then(function (enumValue) {
        return apiRequest('/api/product-attributes/assign/', 'POST', {
            product_id: productId,
            enum_value_id: enumValue.id
        });
    })
        .then(function () {
            showMessage('Характеристика добавлена', 'success');
            loadProductCard(productId);
        })
        .catch(function (err) { showMessage(err.message, 'error'); });
}
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
loadBaseUnits();
