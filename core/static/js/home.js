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

function renderProductCard(product, extra, availableParameters, availableEnums, availableUnits) {
    var canHaveBom = ['part', 'assembly', 'kit', 'complex'].indexOf(product.product_type) !== -1;
    var usedParamIds = {};
    (extra.parameters || []).forEach(function (p) {
        usedParamIds[p.parameter_definition.id] = true;
    });
    var missingParameters = (availableParameters || []).filter(function (p) {
        return !usedParamIds[p.id];
    });
    var usedEnumIds = {};
    (extra.attributes || []).forEach(function (a) {
        usedEnumIds[a.enum_definition.id] = true;
    });
    var missingEnums = (availableEnums || []).filter(function (e) {
        return !usedEnumIds[e.id] && e.values && e.values.length;
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

    if (canHaveBom) {
        html += '<p><a href="#bom/' + product.id + '">Открыть спецификацию (состав) &rarr;</a></p>';
    } else {
        html += '<p class="hint">Это ' + productTypeName(product.product_type).toLowerCase()
            + ' &mdash; у него нет своего состава, оно само входит в состав других изделий.</p>';
    }

    html += '<h3>Параметры</h3>';
    if (missingParameters.length) {
        var defaultParam = missingParameters[0];
        var createFieldHtml = '';
        if (defaultParam && defaultParam.value_type === 'enum' && defaultParam.enum_values && defaultParam.enum_values.length) {
            createFieldHtml = '<select name="enum_value_id">' + defaultParam.enum_values.map(function (v) {
                var enumValue = v.value_str !== null ? v.value_str : v.value_int !== null ? v.value_int : v.value_real;
                return '<option value="' + v.id + '">' + escapeHtml(enumValue) + '</option>';
            }).join('') + '</select>';
        } else {
            createFieldHtml = '<input type="text" name="value" placeholder="Значение" required>';
        }

        var parameterSelector = '<select name="parameter_definition_id" required>'
            + missingParameters.map(function (p) {
                var enumText = p.value_type === 'enum' && p.enum_values && p.enum_values.length
                    ? ' (' + p.enum_values.length + ' знач.)'
                    : ' (' + p.value_type + ')';
                return '<option value="' + p.id + '" data-type="' + p.value_type + '" data-enum-values="' +
                    escapeHtml(JSON.stringify(p.enum_values || [])) + '">' + escapeHtml(p.name) + escapeHtml(enumText) + '</option>';
            }).join('')
            + '</select>';
        html += '<form id="productParameterCreateForm" data-product-id="' + product.id + '" class="form-row">'
            + parameterSelector
            + '<span class="parameter-create-field">' + createFieldHtml + '</span>'
            + '<button type="submit">Добавить параметр</button>'
            + '</form>';
    }
    html += '<form id="productNewParameterForm" data-product-id="' + product.id + '" class="form-row">'
        + '<strong>Новый параметр:</strong>'
        + '<input name="name" placeholder="Название параметра" required>'
        + '<select name="value_type" required>'
        + '<option value="str">Строка</option>'
        + '<option value="int">Целое</option>'
        + '<option value="real">Дробное</option>'
        + '</select>'
        + '<select name="unit_id" required>'
        + (availableUnits || []).map(function (unit) {
            return '<option value="' + unit.id + '">' + escapeHtml(unit.symbol + ' — ' + unit.name) + '</option>';
        }).join('')
        + '</select>'
        + '<input name="value" type="text" placeholder="Значение" required>'
        + '<button type="submit">Добавить параметр</button>'
        + '</form>';
    if ((extra.parameters || []).length) {
        html += '<div class="table-wrap"><table class="refs-table product-params-table"><thead><tr>'
            + '<th>Параметр</th><th>Значение</th><th>Ед. изм.</th><th class="action-cell">Действия</th>'
            + '</tr></thead><tbody>';
        (extra.parameters || []).forEach(function (p) {
            var value = p.value_str !== null && p.value_str !== undefined ? p.value_str :
                p.value_int !== null && p.value_int !== undefined ? p.value_int :
                p.value_real !== null && p.value_real !== undefined ? p.value_real : '';
            var valueInputHtml = '';
            if (p.parameter_definition.value_type === 'enum' && p.parameter_definition.enum_values && p.parameter_definition.enum_values.length) {
                valueInputHtml = '<select name="value" class="parameter-value-select">' + p.parameter_definition.enum_values.map(function (ev) {
                    var evText = ev.value_str !== null && ev.value_str !== undefined ? ev.value_str :
                        ev.value_int !== null && ev.value_int !== undefined ? ev.value_int : ev.value_real;
                    return '<option value="' + ev.id + '"' + (String(p.value_enum_id) === String(ev.id) ? ' selected' : '') + '>'
                        + escapeHtml(evText) + '</option>';
                }).join('') + '</select>';
            } else if (p.parameter_definition.value_type === 'int') {
                valueInputHtml = '<input name="value" type="number" min="0" step="1" value="' + escapeHtml(value === null ? '' : value) + '">';
            } else if (p.parameter_definition.value_type === 'real') {
                valueInputHtml = '<input name="value" type="number" min="0" step="0.01" value="' + escapeHtml(value === null ? '' : value) + '">';
            } else {
                valueInputHtml = '<input name="value" value="' + escapeHtml(value === null ? '' : value) + '">';
            }
            html += '<tr class="parameter-edit" data-product-id="' + product.id + '" data-ppv-id="' + p.id + '" data-type="' + p.parameter_definition.value_type + '">'
                + '<td>' + escapeHtml(p.parameter_definition.name) + '</td>'
                + '<td class="num">' + valueInputHtml + '</td>'
                + '<td class="num">' + escapeHtml(p.parameter_definition.unit ? p.parameter_definition.unit.symbol || '' : '') + '</td>'
                + '<td class="action-cell">'
                + '<button type="button" class="save-parameter-btn">Сохранить</button>'
                + '<button type="button" class="danger delete-parameter-btn" data-ppv-id="' + p.id + '">Удалить</button>'
                + '</td></tr>';
        });
        html += '</tbody></table></div>';
    }

    html += '<h3>Характеристики</h3>';
    if (extra.attributes && extra.attributes.length) {
        html += '<div class="table-wrap"><table class="refs-table product-params-table product-attributes-table"><thead><tr>'
            + '<th>Перечисление</th><th>Значение</th><th class="action-cell">Действия</th>'
            + '</tr></thead><tbody>';
        extra.attributes.forEach(function (a) {
            var valueText = a.enum_value.value_str !== null && a.enum_value.value_str !== undefined
                ? a.enum_value.value_str
                : a.enum_value.value_int !== null && a.enum_value.value_int !== undefined
                    ? a.enum_value.value_int
                    : a.enum_value.value_real;
            html += '<tr class="attribute-edit" data-product-id="' + product.id + '" data-attribute-id="' + a.id + '">'
                + '<td>' + escapeHtml(a.enum_definition.description) + '</td>'
                + '<td class="num">' + escapeHtml(valueText) + '</td>'
                + '<td class="action-cell">'
                + '<button type="button" class="danger delete-attribute-btn">Удалить</button>'
                + '</td></tr>';
        });
        html += '</tbody></table></div>';
    } else {
        html += '<p class="muted">Характеристики не заданы</p>';
    }
    if (availableEnums && availableEnums.length) {
        html += '<form id="productNewCharacteristicForm" data-product-id="' + product.id + '" class="form-row">'
            + '<strong>Новая характеристика:</strong>'
            + '<select name="enum_definition_id" required>'
            + availableEnums.map(function (e) {
                return '<option value="' + e.id + '">' + escapeHtml(e.description) + '</option>';
            }).join('')
            + '</select>'
            + '<input name="value_str" placeholder="Новое значение" required>'
            + '<button type="submit">Добавить характеристику</button>'
            + '</form>';
    }
    if (missingEnums.length) {
        html += '<form id="productAttributeCreateForm" data-product-id="' + product.id + '" class="form-row">'
            + '<select name="enum_definition_id" required>'
            + missingEnums.map(function (e) {
                return '<option value="' + e.id + '" data-values="' + escapeHtml(JSON.stringify(e.values || [])) + '">'
                    + escapeHtml(e.description) + '</option>';
            }).join('')
            + '</select><select name="enum_value_id" required>'
            + missingEnums[0].values.map(function (v) {
                var text = v.value_str !== null && v.value_str !== undefined ? v.value_str :
                    v.value_int !== null && v.value_int !== undefined ? v.value_int : v.value_real;
                return '<option value="' + v.id + '">' + escapeHtml(text) + '</option>';
            }).join('')
            + '</select><button type="submit">Добавить характеристику</button></form>';
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
        var parameterType = parameterOption.getAttribute('data-type');
        var enumValues = JSON.parse(parameterOption.getAttribute('data-enum-values') || '[]');
        var field = parameterForm.querySelector('.parameter-create-field');
        if (parameterType === 'enum') {
            field.innerHTML = '<select name="enum_value_id" required>' + enumValues.map(function (v) {
                var text = v.value_str !== null && v.value_str !== undefined ? v.value_str :
                    v.value_int !== null && v.value_int !== undefined ? v.value_int : v.value_real;
                return '<option value="' + v.id + '">' + escapeHtml(text) + '</option>';
            }).join('') + '</select>';
        } else {
            var inputType = parameterType === 'int' || parameterType === 'real' ? 'number' : 'text';
            var step = parameterType === 'int' ? ' step="1" min="0"' :
                parameterType === 'real' ? ' step="0.01" min="0"' : '';
            field.innerHTML = '<input type="' + inputType + '" name="value" placeholder="Значение" required' + step + '>';
        }
        return;
    }
    if (e.target.name !== 'enum_definition_id' || !e.target.closest('#productAttributeCreateForm')) return;
    var form = e.target.closest('#productAttributeCreateForm');
    var selected = e.target.options[e.target.selectedIndex];
    var values = JSON.parse(selected.getAttribute('data-values') || '[]');
    var valueSelect = form.querySelector('[name="enum_value_id"]');
    valueSelect.innerHTML = values.map(function (v) {
        var text = v.value_str !== null && v.value_str !== undefined ? v.value_str :
            v.value_int !== null && v.value_int !== undefined ? v.value_int : v.value_real;
        return '<option value="' + v.id + '">' + escapeHtml(text) + '</option>';
    }).join('');
});

document.addEventListener('click', function (e) {
    var saveButton = e.target.closest('.save-parameter-btn');
    if (saveButton) {
        var row = saveButton.closest('.parameter-edit');
        var valueInput = row.querySelector('input[name="value"], select[name="value"]');
        var value = valueInput ? valueInput.value : '';
        var type = row.getAttribute('data-type');
        var payload = {
            product_parameter_value_id: row.getAttribute('data-ppv-id'),
        };

        if (type === 'int') {
            payload.value_int = parseInt(value, 10);
        } else if (type === 'real') {
            payload.value_real = parseFloat(value);
        } else if (type === 'enum') {
            payload.value_enum_id = parseInt(value, 10);
        } else {
            payload.value_str = value;
        }

        apiRequest('/api/product-parameters/update/', 'PUT', payload).then(function () {
            showMessage('Параметр сохранен', 'success');
            var productId = parseInt(row.getAttribute('data-product-id'), 10);
            if (!isNaN(productId)) loadProductCard(productId);
        }).catch(function (err) { showMessage(err.message, 'error'); });
        return;
    }

    var deleteButton = e.target.closest('.delete-parameter-btn');
    if (deleteButton) {
        var ppvId = parseInt(deleteButton.getAttribute('data-ppv-id'), 10);
        if (!confirm('Удалить параметр?')) return;
        apiRequest('/api/product-parameters/' + ppvId + '/delete/', 'DELETE').then(function () {
            showMessage('Параметр удалён', 'success');
            var row = deleteButton.closest('.parameter-edit');
            var productId = parseInt(row.getAttribute('data-product-id'), 10);
            if (!isNaN(productId)) loadProductCard(productId);
        }).catch(function (err) { showMessage(err.message, 'error'); });
    }

    var deleteAttributeButton = e.target.closest('.delete-attribute-btn');
    if (deleteAttributeButton) {
        var attributeRow = deleteAttributeButton.closest('.attribute-edit');
        if (!confirm('Удалить характеристику?')) return;
        apiRequest('/api/product-attributes/delete', 'DELETE', {
            product_id: attributeRow.getAttribute('data-attribute-id')
        }).then(function () {
            showMessage('Характеристика удалена', 'delete');
            loadProductCard(parseInt(attributeRow.getAttribute('data-product-id'), 10));
        }).catch(function (err) { showMessage(err.message, 'error'); });
    }
});

document.addEventListener('submit', function (e) {
    if (e.target.id !== 'productNewParameterForm') return;
    e.preventDefault();
    var form = e.target;
    var productId = parseInt(form.getAttribute('data-product-id'), 10);
    var type = form.querySelector('[name="value_type"]').value;
    var value = form.querySelector('[name="value"]').value.trim();
    var parameterPayload = {
        classifier_node_id: getNodeById(productId) ? getNodeById(productId).id : null,
        name: form.querySelector('[name="name"]').value.trim(),
        value_type: type,
        unit_id: form.querySelector('[name="unit_id"]').value
    };

    apiRequest('/api/parameters/create/', 'POST', parameterPayload).then(function (parameter) {
        var valuePayload = {
            product_id: productId,
            parameter_definition_id: parameter.id
        };
        if (type === 'int') {
            valuePayload.value_int = parseInt(value, 10);
        } else if (type === 'real') {
            valuePayload.value_real = parseFloat(value);
        } else {
            valuePayload.value_str = value;
        }
        return apiRequest('/api/product-parameters/create/', 'POST', valuePayload);
    }).then(function () {
        showMessage('Новый параметр добавлен', 'success');
        loadProductCard(productId);
    }).catch(function (err) { showMessage(err.message, 'error'); });
});

document.addEventListener('submit', function (e) {
    if (e.target.id !== 'productNewCharacteristicForm') return;
    e.preventDefault();
    var form = e.target;
    var productId = parseInt(form.getAttribute('data-product-id'), 10);
    var enumDefinitionId = parseInt(form.querySelector('[name="enum_definition_id"]').value, 10);
    var value = form.querySelector('[name="value_str"]').value.trim();

    apiRequest('/api/enum-values/add/', 'POST', {
        enum_definition_id: enumDefinitionId,
        value_str: value
    }).then(function (enumValue) {
        return apiRequest('/api/product-attributes/assign/', 'POST', {
            product_id: productId,
            enum_value_id: enumValue.id
        });
    }).then(function () {
        showMessage('Новая характеристика добавлена', 'success');
        loadProductCard(productId);
    }).catch(function (err) { showMessage(err.message, 'error'); });
});

document.addEventListener('submit', function (e) {
    if (e.target.id !== 'productAttributeCreateForm') return;
    e.preventDefault();
    var form = e.target;
    apiRequest('/api/product-attributes/assign/', 'POST', {
        product_id: form.getAttribute('data-product-id'),
        enum_value_id: form.querySelector('[name="enum_value_id"]').value
    }).then(function () {
        showMessage('Характеристика добавлена', 'success');
        loadProductCard(parseInt(form.getAttribute('data-product-id'), 10));
    }).catch(function (err) { showMessage(err.message, 'error'); });
});

document.addEventListener('submit', function (e) {
    if (e.target.id !== 'productParameterCreateForm') return;
    e.preventDefault();
    var form = e.target;
    var productId = parseInt(form.getAttribute('data-product-id'), 10);
    var select = form.querySelector('select[name="parameter_definition_id"]');
    var paramId = parseInt(select.value, 10);
    var type = (select.options[select.selectedIndex] || {}).getAttribute('data-type') || 'str';
    var payload = {
        product_id: productId,
        parameter_definition_id: paramId,
    };

    if (type === 'int') {
        payload.value_int = parseInt(form.querySelector('input[name="value"]').value, 10);
    } else if (type === 'real') {
        payload.value_real = parseFloat(form.querySelector('input[name="value"]').value);
    } else if (type === 'enum') {
        payload.value_enum_id = parseInt(form.querySelector('select[name="enum_value_id"]').value, 10);
    } else {
        payload.value_str = form.querySelector('input[name="value"]').value;
    }

    apiRequest('/api/product-parameters/create/', 'POST', payload).then(function () {
        showMessage('Параметр добавлен', 'success');
        loadProductCard(productId);
    }).catch(function (err) { showMessage(err.message, 'error'); });
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
loadBaseUnits();
