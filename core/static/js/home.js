var apiUrls = window.apiUrls || {};

var state = {
    nodesData: [],
    selectedCategoryId: null,
    selectedCategoryName: null,
    selectedProductId: null,
    selectedEnumDefinitionId: null,
    editingParamId: null,
    constraintParamId: null,
    constraintExists: false,
    enumsCache: null,
    unitsCache: null,
    paramsCache: null,
    productParamValues: null,
    currentEnumValues: [],
};

var modal = document.getElementById('modal');
var moveModal = document.getElementById('moveModal');
var constraintModal = document.getElementById('constraintModal');
var overlay = document.getElementById('overlay');
var messageBox = document.getElementById('messageBox');

var treeContainer = document.getElementById('treeContainer');
var contentContainer = document.getElementById('contentContainer');

var openBtn = document.getElementById('openModalBtn');
var openMoveBtn = document.getElementById('openMoveModalBtn');
var cancelBtn = document.getElementById('cancelBtn');
var cancelMoveBtn = document.getElementById('cancelMoveBtn');

var addForm = document.getElementById('addForm');
var moveForm = document.getElementById('moveForm');
var searchForm = document.getElementById('searchForm');

var typeCategory = document.getElementById('type_category');
var typeProduct = document.getElementById('type_product');
var productFields = document.getElementById('product_fields');
var unitField = document.getElementById('unit_field');

var parentSelect = document.getElementById('parent_id');
var moveNodeSelect = document.getElementById('move_node_id');
var newParentSelect = document.getElementById('new_parent_id');
var targetPositionSelect = document.getElementById('target_position');

var moveTypeParent = document.getElementById('move_type_parent');
var moveTypeSibling = document.getElementById('move_type_sibling');
var targetParentDiv = document.getElementById('target_parent_div');
var targetPositionDiv = document.getElementById('target_position_div');

var searchPanel = document.getElementById('searchPanel');
var searchCategoryIdInput = document.getElementById('search_category_id');
var closeSearchBtn = document.getElementById('closeSearchPanel');

var selectedCategoryBadge = document.getElementById('selectedCategoryBadge');
var paramsCategoryBadge = document.getElementById('paramsCategoryBadge');
var enumsCategoryBadge = document.getElementById('enumsCategoryBadge');
var productBadge = document.getElementById('productBadge');
var searchCategoryBadge = document.getElementById('searchCategoryBadge');

var contentTitle = document.getElementById('contentTitle');
var paramsTable = document.getElementById('paramsTable');
var paramNameInput = document.getElementById('param_name');
var paramValueTypeSelect = document.getElementById('param_value_type');
var paramUnitSelect = document.getElementById('param_unit');
var paramSortOrderInput = document.getElementById('param_sort_order');
var paramSaveBtn = document.getElementById('paramSaveBtn');
var paramCancelBtn = document.getElementById('paramCancelBtn');

var enumDescriptionInput = document.getElementById('enum_description');
var enumCreateBtn = document.getElementById('enumCreateBtn');
var enumDefinitionsContainer = document.getElementById('enumDefinitions');
var enumValuesTitle = document.getElementById('enumValuesTitle');
var enumValueStrInput = document.getElementById('enum_value_str');
var enumValueIntInput = document.getElementById('enum_value_int');
var enumValueRealInput = document.getElementById('enum_value_real');
var enumValueAddBtn = document.getElementById('enumValueAddBtn');
var enumValuesContainer = document.getElementById('enumValues');

var productDetails = document.getElementById('productDetails');

var searchLoadParamsBtn = document.getElementById('searchLoadParamsBtn');
var searchRunBtn = document.getElementById('searchRunBtn');
var searchFiltersContainer = document.getElementById('searchFilters');
var searchResultsContainer = document.getElementById('searchResults');

var constraintMinInput = document.getElementById('constraint_min');
var constraintMaxInput = document.getElementById('constraint_max');
var constraintCancelBtn = document.getElementById('constraintCancelBtn');
var constraintSaveBtn = document.getElementById('constraintSaveBtn');

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showMessage(text, type) {
    if (!messageBox) return;
    var color = type === 'error' ? '#c0392b' : '#2e7d32';
    messageBox.innerHTML = '<p style="color:' + color + ';">' + escapeHtml(text) + '</p>';
}

function clearMessage() {
    if (messageBox) messageBox.innerHTML = '';
}

function getCookie(name) {
    var cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        var cookies = document.cookie.split(';');
        for (var i = 0; i < cookies.length; i++) {
            var cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

function apiRequest(url, options) {
    var opts = options || {};
    var headers = opts.headers || {};
    if (opts.method && opts.method !== 'GET') {
        headers['X-CSRFToken'] = getCookie('csrftoken');
    }
    opts.headers = headers;
    opts.credentials = 'same-origin';

    return fetch(url, opts)
        .then(function (res) {
            return res.text().then(function (text) {
                var data = null;
                if (text) {
                    try {
                        data = JSON.parse(text);
                    } catch (e) {
                        data = null;
                    }
                }
                return { status: res.status, data: data, raw: text };
            });
        })
        .then(function (result) {
            if (result.status < 200 || result.status >= 300) {
                if (result.data && result.data.error) {
                    throw new Error(result.data.error);
                }
                throw new Error('Ошибка API: ' + result.status);
            }
            if (!result.data) {
                throw new Error('Ошибка API: ответ не JSON');
            }
            if (Object.prototype.hasOwnProperty.call(result.data, 'ok')) {
                if (!result.data.ok) {
                    throw new Error(result.data.error || 'Ошибка API');
                }
                return result.data.data;
            }
            return result.data;
        });
}

function setBadge(badgeEl, text) {
    if (!badgeEl) return;
    badgeEl.textContent = text;
}

function setSelectedCategory(categoryId, categoryName) {
    state.selectedCategoryId = categoryId;
    state.selectedCategoryName = categoryName;
    setBadge(selectedCategoryBadge, categoryName ? 'Категория: ' + categoryName : 'Категория не выбрана');
    setBadge(paramsCategoryBadge, categoryName ? 'Категория: ' + categoryName : 'Категория не выбрана');
    setBadge(enumsCategoryBadge, categoryName ? 'Категория: ' + categoryName : 'Категория не выбрана');
    setBadge(searchCategoryBadge, categoryName ? 'Категория: ' + categoryName : 'Категория не выбрана');
    if (contentTitle) {
        contentTitle.textContent = categoryName ? 'Содержимое: ' + categoryName : 'Содержимое категории';
    }
}

function openModalFunc() {
    if (modal) modal.style.display = 'block';
    if (overlay) overlay.style.display = 'block';
}

function openMoveModalFunc() {
    if (moveModal) moveModal.style.display = 'block';
    if (overlay) overlay.style.display = 'block';
    updateParentOptions();
    updateTargetPositionOptions();
}

function openConstraintModal() {
    if (constraintModal) constraintModal.style.display = 'block';
    if (overlay) overlay.style.display = 'block';
}

function closeModalFunc() {
    if (modal) modal.style.display = 'none';
    if (moveModal) moveModal.style.display = 'none';
    if (constraintModal) constraintModal.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
}

function toggleFields() {
    if (typeProduct && typeProduct.checked) {
        if (productFields) productFields.style.display = 'block';
        if (unitField) unitField.style.display = 'none';
    } else {
        if (productFields) productFields.style.display = 'none';
        if (unitField) unitField.style.display = 'block';
    }
}

function toggleMoveType() {
    if (moveTypeParent && moveTypeParent.checked) {
        if (targetParentDiv) targetParentDiv.style.display = 'block';
        if (targetPositionDiv) targetPositionDiv.style.display = 'none';
    } else {
        if (targetParentDiv) targetParentDiv.style.display = 'none';
        if (targetPositionDiv) targetPositionDiv.style.display = 'block';
    }
}

function getNodeById(nodeId) {
    for (var i = 0; i < state.nodesData.length; i++) {
        if (state.nodesData[i].id === nodeId) return state.nodesData[i];
    }
    return null;
}

function getDescendantsIds(rootId) {
    var descendants = [];
    var stack = [rootId];
    var visited = {};

    while (stack.length) {
        var current = stack.pop();
        if (visited[current]) continue;
        visited[current] = true;

        for (var i = 0; i < state.nodesData.length; i++) {
            if (state.nodesData[i].parent_id === current) {
                descendants.push(state.nodesData[i].id);
                stack.push(state.nodesData[i].id);
            }
        }
    }

    return descendants;
}

function updateSelectOptions() {
    if (!parentSelect || !moveNodeSelect || !newParentSelect) return;

    var options = '<option value="">— Корневая категория —</option>';
    var moveOptions = '<option value="">— Выберите вершину —</option>';

    for (var i = 0; i < state.nodesData.length; i++) {
        var n = state.nodesData[i];
        options += '<option value="' + n.id + '">' + escapeHtml(n.name) + ' (id=' + n.id + ')</option>';
        moveOptions += '<option value="' + n.id + '">' + escapeHtml(n.name) + ' (id=' + n.id + ')</option>';
    }

    parentSelect.innerHTML = options;
    newParentSelect.innerHTML = options;
    moveNodeSelect.innerHTML = moveOptions;
}

function updateParentOptions() {
    if (!moveNodeSelect || !newParentSelect) return;

    var selectedId = parseInt(moveNodeSelect.value, 10);
    if (!selectedId || isNaN(selectedId)) return;

    var descendantsIds = getDescendantsIds(selectedId);

    for (var i = 0; i < newParentSelect.options.length; i++) {
        var option = newParentSelect.options[i];
        var rawValue = option.value;
        if (rawValue === '') {
            option.disabled = false;
            continue;
        }

        var nodeId = parseInt(rawValue, 10);
        option.disabled = nodeId === selectedId || descendantsIds.indexOf(nodeId) !== -1;
    }
}

function updateTargetPositionOptions() {
    if (!moveNodeSelect || !targetPositionSelect) return;

    var selectedId = parseInt(moveNodeSelect.value, 10);
    if (!selectedId || isNaN(selectedId)) {
        targetPositionSelect.innerHTML = '<option value="">— Сначала выберите вершину —</option>';
        return;
    }

    var selectedNode = getNodeById(selectedId);
    if (!selectedNode) return;

    var options = '<option value="">— В начало —</option>';
    var siblingCount = 0;

    for (var i = 0; i < state.nodesData.length; i++) {
        var n = state.nodesData[i];
        if (n.id !== selectedId && n.parent_id === selectedNode.parent_id) {
            options += '<option value="' + n.id + '">После ' + escapeHtml(n.name) + ' (id=' + n.id + ')</option>';
            siblingCount += 1;
        }
    }

    if (siblingCount === 0) {
        options = '<option value="">— Нет других вершин на этом уровне —</option>';
    }

    targetPositionSelect.innerHTML = options;
}

function renderTree() {
    if (!treeContainer) return;

    if (!state.nodesData.length) {
        treeContainer.innerHTML = '<p class="muted">Нет данных</p>';
        return;
    }

    var html = '<ul>';
    for (var i = 0; i < state.nodesData.length; i++) {
        var n = state.nodesData[i];
        var isActive = state.selectedCategoryId === n.id;
        html += '<li style="margin-left:' + (n.level * 1.4) + 'rem;">'
            + '<div class="tree-node">'
            + '<a href="#" class="node-link' + (isActive ? ' active' : '') + '" data-node-id="' + n.id + '">'
            + escapeHtml(n.name)
            + '</a>'
            + '<span class="node-actions">'
            + '<button type="button" class="search-btn" data-node-id="' + n.id + '" data-node-name="' + escapeHtml(n.name) + '">🔍</button>'
            + '<button type="button" class="delete-category-btn delete" data-id="' + n.id + '" data-name="' + escapeHtml(n.name) + '">✖</button>'
            + '</span>'
            + '</div>'
            + '</li>';
    }
    html += '</ul>';
    treeContainer.innerHTML = html;
}

function renderProductsTable(products) {
    if (!products || !products.length) {
        return '<p class="muted">В этой категории нет товаров</p>';
    }

    var html = ''
        + '<table class="table">'
        + '<thead><tr>'
        + '<th>Название</th><th>SKU</th><th>Цена</th><th>Поставщик</th><th>Вес</th><th>Действие</th>'
        + '</tr></thead><tbody>';

    for (var i = 0; i < products.length; i++) {
        var p = products[i];
        html += '<tr>'
            + '<td>' + escapeHtml(p.name) + '</td>'
            + '<td>' + escapeHtml(p.sku || '—') + '</td>'
            + '<td>' + escapeHtml(p.price) + '</td>'
            + '<td>' + escapeHtml(p.supplier) + '</td>'
            + '<td>' + escapeHtml(p.weight_gram) + '</td>'
            + '<td>'
            + '<button type="button" class="secondary open-product-btn" data-id="' + p.id + '" data-name="' + escapeHtml(p.name) + '">Карточка</button> '
            + '<button type="button" class="danger delete-product-btn" data-id="' + p.id + '" data-name="' + escapeHtml(p.name) + '">Удалить</button>'
            + '</td>'
            + '</tr>';
    }

    html += '</tbody></table>';
    return html;
}

function renderCategoryContent(payload) {
    var category = payload.category;
    var products = payload.products;
    setSelectedCategory(category.id, category.name);
    contentContainer.innerHTML = renderProductsTable(products);
}

function renderSearchTreeResult(data, searchType) {
    var category = data.category;
    var html = '<h3>Результаты поиска для "' + escapeHtml(category.name) + '"</h3>';

    if (searchType === 'descendants') {
        html += '<p class="muted">Все потомки:</p>';
        var items = data.children || [];
        if (items.length) {
            html += '<ul>';
            items.forEach(function (d) {
                html += '<li><a href="#" class="node-link" data-node-id="' + d.id + '">' + escapeHtml(d.name) + '</a></li>';
            });
            html += '</ul>';
        } else {
            html += '<p class="muted">Нет потомков</p>';
        }
    } else if (searchType === 'parents') {
        html += '<p class="muted">Все родители:</p>';
        var parents = data.parents || [];
        if (parents.length) {
            html += '<ul>';
            parents.forEach(function (p) {
                html += '<li><a href="#" class="node-link" data-node-id="' + p.id + '">' + escapeHtml(p.name) + '</a></li>';
            });
            html += '</ul>';
        } else {
            html += '<p class="muted">Нет родителей</p>';
        }
    } else if (searchType === 'terminals') {
        html += '<p class="muted">Терминальные узлы:</p>';
        var terminals = data.terminal_nodes || [];
        if (terminals.length) {
            html += '<ul>';
            terminals.forEach(function (t) {
                html += '<li><a href="#" class="node-link" data-node-id="' + t.id + '">' + escapeHtml(t.name) + '</a></li>';
            });
            html += '</ul>';
        } else {
            html += '<p class="muted">Нет терминальных узлов</p>';
        }
    }

    html += '<p><button type="button" class="secondary" id="clearSearchBtn">Очистить</button></p>';
    contentContainer.innerHTML = html;
}

function setActiveTab(tabId) {
    var buttons = document.querySelectorAll('.tab-btn');
    var sections = document.querySelectorAll('.tab-section');
    for (var i = 0; i < buttons.length; i++) {
        buttons[i].classList.toggle('active', buttons[i].getAttribute('data-tab') === tabId);
    }
    for (var j = 0; j < sections.length; j++) {
        sections[j].classList.toggle('active', sections[j].id === tabId);
    }
}

function activateTab(tabId) {
    setActiveTab(tabId);
    if (tabId === 'tab-params') {
        loadParamsForCategory();
    } else if (tabId === 'tab-enums') {
        renderEnumDefinitions();
    } else if (tabId === 'tab-search') {
        renderSearchFilters();
    } else if (tabId === 'tab-product' && state.selectedProductId) {
        loadProductCard(state.selectedProductId);
    }
}

function loadTree() {
    return apiRequest(apiUrls.tree)
        .then(function (data) {
            state.nodesData = data || [];
            renderTree();
            updateSelectOptions();
            updateParentOptions();
            updateTargetPositionOptions();
        })
        .catch(function (err) {
            treeContainer.innerHTML = '<p class="muted">Ошибка загрузки дерева: ' + escapeHtml(err.message) + '</p>';
        });
}

function loadCategoryProducts(categoryId) {
    clearMessage();
    apiRequest(apiUrls.categoryProducts + categoryId + '/products/')
        .then(function (data) {
            renderCategoryContent(data);
            renderTree();
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function showSearchPanel(nodeId) {
    if (!searchPanel || !searchCategoryIdInput) return;
    searchCategoryIdInput.value = nodeId;
    searchPanel.classList.add('active');
}

function closeSearchPanel() {
    if (searchPanel) searchPanel.classList.remove('active');
}

function handleAddSubmit(e) {
    e.preventDefault();
    clearMessage();

    var nodeType = document.querySelector('input[name="node_type"]:checked').value;
    var payload = {
        name: document.getElementById('name').value,
        parent_id: document.getElementById('parent_id').value || null
    };

    var url = apiUrls.addCategory;

    if (nodeType === 'category') {
        payload.unit = document.getElementById('unit').value || null;
    } else {
        url = apiUrls.addProduct;
        payload.sku = document.getElementById('sku').value || null;
        payload.price = document.getElementById('price').value;
        payload.supplier = document.getElementById('supplier').value;
        payload.weight_gram = document.getElementById('weight_gram').value;
    }

    apiRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then(function () {
            showMessage('Успешно добавлено', 'success');
            addForm.reset();
            toggleFields();
            closeModalFunc();
            return loadTree();
        })
        .then(function () {
            if (state.selectedCategoryId) {
                loadCategoryProducts(state.selectedCategoryId);
            }
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function handleMoveSubmit(e) {
    e.preventDefault();
    clearMessage();

    var categoryId = parseInt(moveNodeSelect.value, 10);
    if (!categoryId || isNaN(categoryId)) {
        showMessage('Выберите вершину для перемещения', 'error');
        return;
    }

    var url;
    var payload;

    if (moveTypeParent && moveTypeParent.checked) {
        url = apiUrls.moveCategory;
        payload = {
            category_id: categoryId,
            new_parent_id: newParentSelect.value === '' ? null : parseInt(newParentSelect.value, 10)
        };
    } else {
        url = apiUrls.reorderCategory;
        payload = {
            category_id: categoryId,
            target_position_id: targetPositionSelect.value === '' ? null : parseInt(targetPositionSelect.value, 10)
        };
    }

    apiRequest(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then(function () {
            showMessage('Перемещение выполнено', 'success');
            closeModalFunc();
            return loadTree();
        })
        .then(function () {
            if (state.selectedCategoryId) {
                loadCategoryProducts(state.selectedCategoryId);
            }
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function handleSearchSubmit(e) {
    e.preventDefault();
    clearMessage();

    var selectedRadio = document.querySelector('#searchForm input[name="search_type"]:checked');
    if (!selectedRadio) {
        showMessage('Выберите тип поиска', 'error');
        return;
    }

    var categoryId = searchCategoryIdInput.value;
    if (!categoryId) {
        showMessage('Категория не выбрана', 'error');
        return;
    }

    var searchType = selectedRadio.value;
    var url;

    if (searchType === 'descendants') {
        url = apiUrls.children + categoryId + '/children/';
    } else if (searchType === 'parents') {
        url = apiUrls.parents + categoryId + '/parents/';
    } else if (searchType === 'terminals') {
        url = apiUrls.terminals + categoryId + '/terminals/';
    } else {
        showMessage('Неизвестный тип поиска', 'error');
        return;
    }

    apiRequest(url)
        .then(function (data) {
            renderSearchTreeResult(data, searchType);
            closeSearchPanel();
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function handleDelete(deleteType, deleteId, itemName) {
    if (!confirm('Удалить ' + itemName + '?')) return;
    clearMessage();

    var url = deleteType === 'category' ? apiUrls.deleteCategory : apiUrls.deleteProduct;

    apiRequest(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete_id: deleteId })
    })
        .then(function () {
            showMessage('Удалено', 'success');
            if (deleteType === 'category' && deleteId === state.selectedCategoryId) {
                state.selectedCategoryId = null;
                setSelectedCategory(null, null);
                contentContainer.innerHTML = '<p class="muted">Выберите категорию слева</p>';
            }
            return loadTree();
        })
        .then(function () {
            if (state.selectedCategoryId) {
                loadCategoryProducts(state.selectedCategoryId);
            }
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function loadUnits() {
    if (state.unitsCache) {
        return Promise.resolve(state.unitsCache);
    }
    return apiRequest(apiUrls.units)
        .then(function (data) {
            state.unitsCache = data || [];
            return state.unitsCache;
        });
}

function fillUnitsSelect() {
    if (!paramUnitSelect) return;
    loadUnits().then(function (units) {
        var html = '<option value="">— Без единицы —</option>';
        for (var i = 0; i < units.length; i++) {
            var u = units[i];
            var label = u.dimension_name ? u.dimension_name + ' / ' + u.name : u.name;
            html += '<option value="' + u.id + '">' + escapeHtml(label) + '</option>';
        }
        paramUnitSelect.innerHTML = html;
    }).catch(function () {
        paramUnitSelect.innerHTML = '<option value="">— Ошибка загрузки —</option>';
    });
}

function loadParamsForCategory() {
    if (!state.selectedCategoryId) {
        paramsTable.innerHTML = '<p class="muted">Выберите категорию.</p>';
        return Promise.resolve([]);
    }
    return apiRequest(apiUrls.parametersForCategory + state.selectedCategoryId + '/')
        .then(function (data) {
            state.paramsCache = data || [];
            return state.paramsCache;
        })
        .then(function (params) {
            renderParamsTable(params || []);
            return params;
        })
        .catch(function (err) {
            paramsTable.innerHTML = '<p class="muted">Ошибка загрузки параметров: ' + escapeHtml(err.message) + '</p>';
        });
}

function getValueTypeLabel(valueType) {
    if (valueType === 'str') return 'Строка';
    if (valueType === 'int') return 'Целое';
    if (valueType === 'real') return 'Вещественное';
    if (valueType === 'enum') return 'Перечисление';
    return valueType || '—';
}

function loadConstraint(paramId) {
    return apiRequest(apiUrls.parameterConstraint + paramId + '/constraint/');
}

function renderParamsTable(params) {
    if (!params || !params.length) {
        paramsTable.innerHTML = '<p class="muted">Параметры для категории не заданы.</p>';
        return;
    }

    var sorted = params.slice().sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });

    var html = '<table class="table"><thead><tr>'
        + '<th>Параметр</th><th>Тип</th><th>Единица</th><th>Порядок</th><th>Ограничения</th><th>Действия</th>'
        + '</tr></thead><tbody>';

    var constraintPromises = [];
    for (var i = 0; i < sorted.length; i++) {
        (function (param) {
            var unitLabel = '—';
            if (param.unit_id && state.unitsCache) {
                for (var u = 0; u < state.unitsCache.length; u++) {
                    if (state.unitsCache[u].id === param.unit_id) {
                        unitLabel = state.unitsCache[u].name;
                        break;
                    }
                }
            }
            html += '<tr data-param-id="' + param.id + '">'
                + '<td>' + escapeHtml(param.name) + '</td>'
                + '<td>' + escapeHtml(getValueTypeLabel(param.value_type)) + '</td>'
                + '<td>' + escapeHtml(unitLabel) + '</td>'
                + '<td>' + escapeHtml(param.sort_order) + '</td>'
                + '<td class="constraint-cell">—</td>'
                + '<td>'
                + '<button class="secondary param-edit-btn" data-id="' + param.id + '">Изменить</button> '
                + '<button class="secondary param-constraint-btn" data-id="' + param.id + '">Ограничения</button> '
                + '<button class="danger param-delete-btn" data-id="' + param.id + '">Удалить</button>'
                + '</td>'
                + '</tr>';
            if (param.value_type === 'int' || param.value_type === 'real') {
                constraintPromises.push(loadConstraint(param.id).then(function (constraint) {
                    var cell = document.querySelector('tr[data-param-id="' + param.id + '"] .constraint-cell');
                    if (cell) {
                        if (constraint && constraint.min_value !== undefined) {
                            cell.textContent = constraint.min_value + ' .. ' + constraint.max_value;
                        } else {
                            cell.textContent = '—';
                        }
                    }
                }).catch(function () {}));
            }
        })(sorted[i]);
    }

    html += '</tbody></table>';
    paramsTable.innerHTML = html;
    Promise.all(constraintPromises);
}

function resetParamForm() {
    state.editingParamId = null;
    if (paramNameInput) paramNameInput.value = '';
    if (paramValueTypeSelect) paramValueTypeSelect.value = 'str';
    if (paramUnitSelect) paramUnitSelect.value = '';
    if (paramSortOrderInput) paramSortOrderInput.value = 0;
}

function saveParameter() {
    if (!state.selectedCategoryId) {
        showMessage('Сначала выберите категорию', 'error');
        return;
    }
    var payload = {
        name: paramNameInput.value.trim(),
        unit_id: paramUnitSelect.value || null,
        value_type: paramValueTypeSelect.value,
        sort_order: parseInt(paramSortOrderInput.value || '0', 10)
    };
    if (!payload.name) {
        showMessage('Название параметра обязательно', 'error');
        return;
    }

    var url = apiUrls.parametersCreate;
    var method = 'POST';
    if (state.editingParamId) {
        url = apiUrls.parametersUpdate;
        method = 'PUT';
        payload.parameter_definition_id = state.editingParamId;
    } else {
        payload.classifier_node_id = state.selectedCategoryId;
    }

    apiRequest(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then(function () {
            showMessage('Параметр сохранен', 'success');
            resetParamForm();
            return loadParamsForCategory();
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function deleteParameter(paramId) {
    apiRequest(apiUrls.parametersDelete + paramId + '/delete/', {
        method: 'DELETE'
    })
        .then(function () {
            showMessage('Параметр удален', 'success');
            return loadParamsForCategory();
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function openConstraintEditor(paramId) {
    state.constraintParamId = paramId;
    state.constraintExists = false;
    constraintMinInput.value = '';
    constraintMaxInput.value = '';
    loadConstraint(paramId)
        .then(function (constraint) {
            if (constraint && constraint.min_value !== undefined) {
                state.constraintExists = true;
                constraintMinInput.value = constraint.min_value;
                constraintMaxInput.value = constraint.max_value;
            }
            openConstraintModal();
        })
        .catch(function () {
            openConstraintModal();
        });
}

function saveConstraint() {
    if (!state.constraintParamId) return;
    var minValue = constraintMinInput.value;
    var maxValue = constraintMaxInput.value;

    if (!minValue && !maxValue) {
        apiRequest(apiUrls.parameterConstraintDelete + state.constraintParamId + '/constraint/delete/', {
            method: 'DELETE'
        }).then(function () {
            showMessage('Ограничение удалено', 'success');
            closeModalFunc();
            return loadParamsForCategory();
        }).catch(function (err) {
            showMessage(err.message, 'error');
        });
        return;
    }

    var payload = {
        parameter_definition_id: state.constraintParamId,
        min_value: minValue,
        max_value: maxValue
    };
    var url = state.constraintExists ? apiUrls.parameterConstraintUpdate : apiUrls.parameterConstraintCreate;

    apiRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then(function () {
            showMessage('Ограничение сохранено', 'success');
            closeModalFunc();
            return loadParamsForCategory();
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function loadEnumsCache() {
    if (state.enumsCache) {
        return Promise.resolve(state.enumsCache);
    }
    return apiRequest(apiUrls.enumsAll)
        .then(function (data) {
            state.enumsCache = data || [];
            return state.enumsCache;
        });
}

function getEnumsForSelectedCategory() {
    if (!state.selectedCategoryId || !state.enumsCache) return [];
    var allowedIds = getDescendantsIds(state.selectedCategoryId);
    allowedIds.push(state.selectedCategoryId);
    var result = [];
    for (var i = 0; i < state.enumsCache.length; i++) {
        var ed = state.enumsCache[i].enum_definition;
        if (allowedIds.indexOf(ed.classifier_node_id) !== -1) {
            result.push(state.enumsCache[i]);
        }
    }
    return result;
}

function renderEnumDefinitions() {
    if (!state.selectedCategoryId) {
        enumDefinitionsContainer.innerHTML = '<p class="muted">Выберите категорию.</p>';
        enumValuesContainer.innerHTML = '';
        return;
    }
    loadEnumsCache().then(function () {
        var defs = getEnumsForSelectedCategory();
        if (!defs.length) {
            enumDefinitionsContainer.innerHTML = '<p class="muted">Перечисления для категории не найдены.</p>';
            enumValuesContainer.innerHTML = '';
            return;
        }

        var html = '<table class="table"><thead><tr><th>Описание</th><th>Категория</th><th>Действия</th></tr></thead><tbody>';
        for (var i = 0; i < defs.length; i++) {
            var ed = defs[i].enum_definition;
            html += '<tr>'
                + '<td>' + escapeHtml(ed.description || 'Без описания') + '</td>'
                + '<td>#' + ed.classifier_node_id + '</td>'
                + '<td>'
                + '<button class="secondary enum-select-btn" data-id="' + ed.id + '">Открыть</button> '
                + '<button class="danger enum-delete-btn" data-id="' + ed.id + '">Удалить</button>'
                + '</td>'
                + '</tr>';
        }
        html += '</tbody></table>';
        enumDefinitionsContainer.innerHTML = html;
    });
}

function loadEnumDefinitionValues(enumDefinitionId) {
    state.selectedEnumDefinitionId = enumDefinitionId;
    enumValuesTitle.textContent = 'Значения перечисления #' + enumDefinitionId;
    apiRequest(apiUrls.enumDefinition + enumDefinitionId + '/')
        .then(function (data) {
            for (var i = 0; i < state.enumsCache.length; i++) {
                if (state.enumsCache[i].enum_definition.id === enumDefinitionId) {
                    state.enumsCache[i].values = data.values || [];
                    break;
                }
            }
            renderEnumValues(data.values || []);
        })
        .catch(function (err) {
            enumValuesContainer.innerHTML = '<p class="muted">Ошибка загрузки значений: ' + escapeHtml(err.message) + '</p>';
        });
}

function renderEnumValues(values) {
    state.currentEnumValues = values || [];
    if (!values || !values.length) {
        enumValuesContainer.innerHTML = '<p class="muted">Значений пока нет.</p>';
        return;
    }
    var html = '<table class="table"><thead><tr><th>Значение</th><th>Порядок</th><th>Действия</th></tr></thead><tbody>';
    for (var i = 0; i < values.length; i++) {
        var v = values[i];
        var label = v.value_str || v.value_int || v.value_real || '—';
        html += '<tr>'
            + '<td>' + escapeHtml(label) + '</td>'
            + '<td>' + escapeHtml(v.sort_order) + '</td>'
            + '<td>'
            + '<button class="secondary enum-move-up-btn" data-id="' + v.id + '" data-index="' + i + '">↑</button> '
            + '<button class="secondary enum-move-down-btn" data-id="' + v.id + '" data-index="' + i + '">↓</button> '
            + '<button class="danger enum-value-delete-btn" data-id="' + v.id + '">Удалить</button>'
            + '</td>'
            + '</tr>';
    }
    html += '</tbody></table>';
    enumValuesContainer.innerHTML = html;
}

function createEnumDefinition() {
    if (!state.selectedCategoryId) {
        showMessage('Выберите категорию для перечисления', 'error');
        return;
    }
    var payload = {
        classifier_node_id: state.selectedCategoryId,
        description: enumDescriptionInput.value.trim() || null
    };
    apiRequest(apiUrls.enumCreate, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then(function () {
            showMessage('Перечисление создано', 'success');
            enumDescriptionInput.value = '';
            state.enumsCache = null;
            renderEnumDefinitions();
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function addEnumValue() {
    if (!state.selectedEnumDefinitionId) {
        showMessage('Сначала выберите перечисление', 'error');
        return;
    }
    var payload = {
        enum_definition_id: state.selectedEnumDefinitionId,
        value_str: enumValueStrInput.value || null,
        value_int: enumValueIntInput.value || null,
        value_real: enumValueRealInput.value || null
    };
    apiRequest(apiUrls.enumValueAdd, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then(function () {
            showMessage('Значение добавлено', 'success');
            enumValueStrInput.value = '';
            enumValueIntInput.value = '';
            enumValueRealInput.value = '';
            return loadEnumDefinitionValues(state.selectedEnumDefinitionId);
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function deleteEnumValue(valueId) {
    apiRequest(apiUrls.enumValueDelete, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enum_value_id: valueId })
    })
        .then(function () {
            showMessage('Значение удалено', 'success');
            return loadEnumDefinitionValues(state.selectedEnumDefinitionId);
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function reorderEnumValue(valueId, targetPositionId) {
    apiRequest(apiUrls.enumValueReorder, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enum_value_id: valueId, target_position_id: targetPositionId })
    })
        .then(function () {
            return loadEnumDefinitionValues(state.selectedEnumDefinitionId);
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function deleteEnumDefinition(enumDefinitionId) {
    apiRequest(apiUrls.enumDefinitionDelete, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enum_definition_id: enumDefinitionId })
    })
        .then(function () {
            showMessage('Перечисление удалено', 'success');
            state.enumsCache = null;
            state.selectedEnumDefinitionId = null;
            renderEnumDefinitions();
            enumValuesContainer.innerHTML = '';
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function loadProductCard(productId, productName) {
    state.selectedProductId = productId;
    setBadge(productBadge, productName ? 'Изделие: ' + productName : 'Изделие #' + productId);
    productDetails.innerHTML = '<p class="muted">Загрузка карточки...</p>';

    var productPromise = apiRequest(apiUrls.products + productId + '/');
    var paramsPromise = productPromise.then(function (product) {
        var categoryId = state.selectedCategoryId || product.classifier_node_id;
        if (categoryId && categoryId !== state.selectedCategoryId) {
            var node = getNodeById(categoryId);
            setSelectedCategory(categoryId, node ? node.name : ('#' + categoryId));
        }
        if (!categoryId) {
            return [];
        }
        return apiRequest(apiUrls.parametersForCategory + categoryId + '/');
    });
    var valuesPromise = apiRequest(apiUrls.productParameterValues + productId + '/parameter-values/');
    var enumsPromise = loadEnumsCache();
    var attributesPromise = apiRequest(apiUrls.productAttributes);

    return Promise.all([productPromise, paramsPromise, valuesPromise, enumsPromise, attributesPromise])
        .then(function (results) {
            var product = results[0];
            var params = results[1] || [];
            var values = results[2] || [];
            var enums = results[3] || [];
            var attributes = results[4] || [];
            state.paramsCache = params;
            state.productParamValues = values;
            renderProductDetails(product, params, values, enums, attributes);
        })
        .catch(function (err) {
            productDetails.innerHTML = '<p class="muted">Ошибка загрузки: ' + escapeHtml(err.message) + '</p>';
        });
}

function buildEnumValueIndex(enums) {
    var map = {};
    for (var i = 0; i < enums.length; i++) {
        var def = enums[i].enum_definition;
        var values = enums[i].values || [];
        for (var j = 0; j < values.length; j++) {
            var v = values[j];
            map[v.id] = {
                defId: def.id,
                defDescription: def.description,
                value: v.value_str || v.value_int || v.value_real || '—'
            };
        }
    }
    return map;
}

function renderProductDetails(product, params, values, enums, attributes) {
    var valueMap = {};
    for (var i = 0; i < values.length; i++) {
        valueMap[values[i].parameter_definition_id] = values[i];
    }

    var enumIndex = buildEnumValueIndex(enums);
    var attrs = [];
    for (var a = 0; a < attributes.length; a++) {
        if (attributes[a].product_id === product.id) {
            attrs.push(attributes[a]);
        }
    }

    var html = '';
    html += '<table class="table"><tbody>'
        + '<tr><th>ID</th><td>' + product.id + '</td></tr>'
        + '<tr><th>Название</th><td>' + escapeHtml(product.name) + '</td></tr>'
        + '<tr><th>SKU</th><td>' + escapeHtml(product.sku || '—') + '</td></tr>'
        + '<tr><th>Цена</th><td>' + escapeHtml(product.price) + '</td></tr>'
        + '<tr><th>Поставщик</th><td>' + escapeHtml(product.supplier) + '</td></tr>'
        + '<tr><th>Вес</th><td>' + escapeHtml(product.weight_gram) + '</td></tr>'
        + '</tbody></table>';

    html += '<h3>Параметры изделия</h3>';
    if (!params.length) {
        html += '<p class="muted">Параметры для категории не заданы.</p>';
    } else {
        html += '<table class="table"><thead><tr>'
            + '<th>Параметр</th><th>Значение</th><th>Действие</th>'
            + '</tr></thead><tbody>';
        for (var p = 0; p < params.length; p++) {
            var param = params[p];
            var existing = valueMap[param.id];
            var valueField = '';
            if (param.value_type === 'str') {
                valueField = '<input type="text" class="ppv-input" data-param-id="' + param.id + '" value="' + escapeHtml(existing ? existing.value_str || '' : '') + '">';
            } else if (param.value_type === 'int') {
                valueField = '<input type="number" class="ppv-input" data-param-id="' + param.id + '" value="' + escapeHtml(existing ? existing.value_int || '' : '') + '">';
            } else if (param.value_type === 'real') {
                valueField = '<input type="number" step="0.01" class="ppv-input" data-param-id="' + param.id + '" value="' + escapeHtml(existing ? existing.value_real || '' : '') + '">';
            } else if (param.value_type === 'enum') {
                var options = '<option value="">— Не выбрано —</option>';
                for (var k = 0; k < enums.length; k++) {
                    var def = enums[k].enum_definition;
                    var vals = enums[k].values || [];
                    for (var m = 0; m < vals.length; m++) {
                        var v = vals[m];
                        var label = (def.description || 'Перечисление') + ': ' + (v.value_str || v.value_int || v.value_real || '—');
                        var selected = existing && existing.value_enum_id === v.id ? ' selected' : '';
                        options += '<option value="' + v.id + '"' + selected + '>' + escapeHtml(label) + '</option>';
                    }
                }
                valueField = '<select class="ppv-input" data-param-id="' + param.id + '">' + options + '</select>';
            }
            html += '<tr data-param-id="' + param.id + '" data-ppv-id="' + (existing ? existing.id : '') + '">'
                + '<td>' + escapeHtml(param.name) + '</td>'
                + '<td>' + valueField + '</td>'
                + '<td>'
                + '<button class="secondary ppv-save-btn" data-param-id="' + param.id + '">Сохранить</button>'
                + (existing ? ' <button class="danger ppv-delete-btn" data-ppv-id="' + existing.id + '">Удалить</button>' : '')
                + '</td>'
                + '</tr>';
        }
        html += '</tbody></table>';
    }

    html += '<h3>Перечисления изделия</h3>';
    if (!attrs.length) {
        html += '<p class="muted">Перечисления пока не назначены.</p>';
    } else {
        html += '<table class="table"><thead><tr><th>Перечисление</th><th>Значение</th><th>Действие</th></tr></thead><tbody>';
        for (var z = 0; z < attrs.length; z++) {
            var attr = attrs[z];
            var enumInfo = enumIndex[attr.enum_value_id] || {};
            html += '<tr>'
                + '<td>' + escapeHtml(enumInfo.defDescription || '—') + '</td>'
                + '<td>' + escapeHtml(enumInfo.value || '—') + '</td>'
                + '<td><button class="danger attr-delete-btn" data-attr-id="' + attr.id + '">Удалить</button></td>'
                + '</tr>';
        }
        html += '</tbody></table>';
    }

    html += '<div class="form-grid">'
        + '<div><label>Перечисление</label><select id="attrEnumDef"></select></div>'
        + '<div><label>Значение</label><select id="attrEnumValue"></select></div>'
        + '</div>'
        + '<div class="modal-actions"><button class="primary" type="button" id="attrAssignBtn">Назначить</button></div>';

    productDetails.innerHTML = html;
    fillAttributeEnumSelects(enums);
}

function fillAttributeEnumSelects(enums) {
    var defSelect = document.getElementById('attrEnumDef');
    var valueSelect = document.getElementById('attrEnumValue');
    if (!defSelect || !valueSelect) return;

    var defsHtml = '<option value="">— Выберите —</option>';
    for (var i = 0; i < enums.length; i++) {
        var def = enums[i].enum_definition;
        defsHtml += '<option value="' + def.id + '">' + escapeHtml(def.description || ('Перечисление #' + def.id)) + '</option>';
    }
    defSelect.innerHTML = defsHtml;

    defSelect.onchange = function () {
        var selectedId = parseInt(defSelect.value, 10);
        var html = '<option value="">— Выберите —</option>';
        for (var j = 0; j < enums.length; j++) {
            if (enums[j].enum_definition.id === selectedId) {
                var values = enums[j].values || [];
                for (var k = 0; k < values.length; k++) {
                    var v = values[k];
                    var label = v.value_str || v.value_int || v.value_real || '—';
                    html += '<option value="' + v.id + '">' + escapeHtml(label) + '</option>';
                }
            }
        }
        valueSelect.innerHTML = html;
    };
}

function assignAttribute() {
    var defSelect = document.getElementById('attrEnumDef');
    var valueSelect = document.getElementById('attrEnumValue');
    if (!defSelect || !valueSelect) return;
    var valueId = valueSelect.value;
    if (!valueId) {
        showMessage('Выберите значение пе��ечисления', 'error');
        return;
    }
    apiRequest(apiUrls.productAttributesAssign, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: state.selectedProductId, enum_value_id: valueId })
    })
        .then(function () {
            showMessage('Перечисление назначено', 'success');
            return loadProductCard(state.selectedProductId);
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function deleteAttribute(attrId) {
    apiRequest(apiUrls.productAttributesDelete, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: attrId })
    })
        .then(function () {
            showMessage('Перечисление удалено', 'success');
            return loadProductCard(state.selectedProductId);
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function saveProductParameter(paramId) {
    var input = document.querySelector('.ppv-input[data-param-id="' + paramId + '"]');
    if (!input) return;
    var existingPpvId = null;
    var existing = state.productParamValues || [];
    for (var i = 0; i < existing.length; i++) {
        if (existing[i].parameter_definition_id === paramId) {
            existingPpvId = existing[i].id;
            break;
        }
    }

    var value = input.value;
    if (!value && existingPpvId) {
        apiRequest(apiUrls.productParameterDelete + existingPpvId + '/delete/', {
            method: 'DELETE'
        }).then(function () {
            showMessage('Значение удалено', 'success');
            return loadProductCard(state.selectedProductId);
        }).catch(function (err) {
            showMessage(err.message, 'error');
        });
        return;
    }
    if (!value) {
        showMessage('Введите значение', 'error');
        return;
    }

    var payload = {
        product_id: state.selectedProductId,
        parameter_definition_id: paramId
    };
    var param = null;
    for (var p = 0; p < state.paramsCache.length; p++) {
        if (state.paramsCache[p].id === paramId) {
            param = state.paramsCache[p];
            break;
        }
    }
    if (!param) return;
    if (param.value_type === 'str') {
        payload.value_str = value;
    } else if (param.value_type === 'int') {
        payload.value_int = value;
    } else if (param.value_type === 'real') {
        payload.value_real = value;
    } else if (param.value_type === 'enum') {
        payload.value_enum_id = value;
    }

    var url = apiUrls.productParameterCreate;
    var method = 'POST';
    if (existingPpvId) {
        if (param.value_type === 'enum') {
            apiRequest(apiUrls.productParameterDelete + existingPpvId + '/delete/', { method: 'DELETE' })
                .then(function () {
                    return apiRequest(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                })
                .then(function () {
                    showMessage('Значение сохранено', 'success');
                    return loadProductCard(state.selectedProductId);
                })
                .catch(function (err) {
                    showMessage(err.message, 'error');
                });
            return;
        }
        url = apiUrls.productParameterUpdate;
        method = 'PUT';
        payload.product_parameter_value_id = existingPpvId;
    }

    apiRequest(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
        .then(function () {
            showMessage('Значение сохранено', 'success');
            return loadProductCard(state.selectedProductId);
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function renderSearchFilters() {
    if (!state.selectedCategoryId) {
        searchFiltersContainer.innerHTML = '<p class="muted">Выберите категорию.</p>';
        return;
    }
    apiRequest(apiUrls.parametersForCategory + state.selectedCategoryId + '/')
        .then(function (params) {
            if (!params.length) {
                searchFiltersContainer.innerHTML = '<p class="muted">Для категории нет параметров.</p>';
                return;
            }
            var html = '<table class="table"><thead><tr><th>Параметр</th><th>Значение</th></tr></thead><tbody>';
            for (var i = 0; i < params.length; i++) {
                var p = params[i];
                var input = '';
                if (p.value_type === 'str') {
                    input = '<input type="text" data-filter-type="str" data-param-id="' + p.id + '">';
                } else if (p.value_type === 'int') {
                    input = '<input type="number" data-filter-type="int" data-param-id="' + p.id + '">';
                } else if (p.value_type === 'real') {
                    input = '<input type="number" step="0.01" data-filter-type="real" data-param-id="' + p.id + '">';
                } else {
                    input = '<span class="muted">Поиск по enum не поддержан</span>';
                }
                html += '<tr><td>' + escapeHtml(p.name) + '</td><td>' + input + '</td></tr>';
            }
            html += '</tbody></table>';
            searchFiltersContainer.innerHTML = html;
        })
        .catch(function (err) {
            searchFiltersContainer.innerHTML = '<p class="muted">Ошибка: ' + escapeHtml(err.message) + '</p>';
        });
}

function runProductSearch() {
    if (!state.selectedCategoryId) {
        showMessage('Выберите категорию', 'error');
        return;
    }
    var inputs = searchFiltersContainer.querySelectorAll('input[data-param-id]');
    var filters = [];
    for (var i = 0; i < inputs.length; i++) {
        var input = inputs[i];
        var value = input.value;
        if (!value) continue;
        var paramId = parseInt(input.getAttribute('data-param-id'), 10);
        var type = input.getAttribute('data-filter-type');
        var filter = { parameter_definition_id: paramId };
        if (type === 'str') {
            filter.value_str = value;
        } else if (type === 'int') {
            filter.value_int = parseInt(value, 10);
        } else if (type === 'real') {
            filter.value_real = parseFloat(value);
        }
        filters.push(filter);
    }

    apiRequest(apiUrls.filterProductsByParams + state.selectedCategoryId + '/filter/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: filters })
    })
        .then(function (data) {
            searchResultsContainer.innerHTML = renderProductsTable(data);
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function handleDocumentClick(e) {
    var nodeLink = e.target.closest('.node-link');
    if (nodeLink) {
        e.preventDefault();
        var nodeId = parseInt(nodeLink.getAttribute('data-node-id'), 10);
        var node = getNodeById(nodeId);
        setSelectedCategory(nodeId, node ? node.name : ('#' + nodeId));
        loadCategoryProducts(nodeId);
        loadParamsForCategory();
        renderEnumDefinitions();
        renderSearchFilters();
        return;
    }

    var searchBtn = e.target.closest('.search-btn');
    if (searchBtn) {
        showSearchPanel(searchBtn.getAttribute('data-node-id'));
        return;
    }

    var deleteCategoryBtn = e.target.closest('.delete-category-btn');
    if (deleteCategoryBtn) {
        handleDelete('category', parseInt(deleteCategoryBtn.getAttribute('data-id'), 10), 'категорию "' + deleteCategoryBtn.getAttribute('data-name') + '"');
        return;
    }

    var deleteProductBtn = e.target.closest('.delete-product-btn');
    if (deleteProductBtn) {
        handleDelete('product', parseInt(deleteProductBtn.getAttribute('data-id'), 10), 'товар "' + deleteProductBtn.getAttribute('data-name') + '"');
        return;
    }

    var openProductBtn = e.target.closest('.open-product-btn');
    if (openProductBtn) {
        setActiveTab('tab-product');
        loadProductCard(parseInt(openProductBtn.getAttribute('data-id'), 10), openProductBtn.getAttribute('data-name'));
        return;
    }

    if (e.target && e.target.id === 'clearSearchBtn') {
        contentContainer.innerHTML = '<p class="muted">Выберите категорию слева.</p>';
    }

    if (e.target && e.target.id === 'attrAssignBtn') {
        assignAttribute();
        return;
    }

    var paramEditBtn = e.target.closest('.param-edit-btn');
    if (paramEditBtn) {
        var paramId = parseInt(paramEditBtn.getAttribute('data-id'), 10);
        var param = null;
        for (var i = 0; i < state.paramsCache.length; i++) {
            if (state.paramsCache[i].id === paramId) {
                param = state.paramsCache[i];
                break;
            }
        }
        if (param) {
            state.editingParamId = paramId;
            paramNameInput.value = param.name;
            paramValueTypeSelect.value = param.value_type;
            paramUnitSelect.value = param.unit_id || '';
            paramSortOrderInput.value = param.sort_order || 0;
        }
        return;
    }

    var paramDeleteBtn = e.target.closest('.param-delete-btn');
    if (paramDeleteBtn) {
        deleteParameter(parseInt(paramDeleteBtn.getAttribute('data-id'), 10));
        return;
    }

    var paramConstraintBtn = e.target.closest('.param-constraint-btn');
    if (paramConstraintBtn) {
        openConstraintEditor(parseInt(paramConstraintBtn.getAttribute('data-id'), 10));
        return;
    }

    var enumSelectBtn = e.target.closest('.enum-select-btn');
    if (enumSelectBtn) {
        loadEnumDefinitionValues(parseInt(enumSelectBtn.getAttribute('data-id'), 10));
        return;
    }

    var enumDeleteBtn = e.target.closest('.enum-delete-btn');
    if (enumDeleteBtn) {
        deleteEnumDefinition(parseInt(enumDeleteBtn.getAttribute('data-id'), 10));
        return;
    }

    var enumValueDeleteBtn = e.target.closest('.enum-value-delete-btn');
    if (enumValueDeleteBtn) {
        deleteEnumValue(parseInt(enumValueDeleteBtn.getAttribute('data-id'), 10));
        return;
    }

    var enumMoveUpBtn = e.target.closest('.enum-move-up-btn');
    if (enumMoveUpBtn && state.selectedEnumDefinitionId) {
        var indexUp = parseInt(enumMoveUpBtn.getAttribute('data-index'), 10);
        if (indexUp > 0) {
            var prevId = state.currentEnumValues[indexUp - 1].id;
            reorderEnumValue(parseInt(enumMoveUpBtn.getAttribute('data-id'), 10), prevId);
        }
        return;
    }

    var enumMoveDownBtn = e.target.closest('.enum-move-down-btn');
    if (enumMoveDownBtn && state.selectedEnumDefinitionId) {
        var indexDown = parseInt(enumMoveDownBtn.getAttribute('data-index'), 10);
        var nextValue = state.currentEnumValues[indexDown + 1];
        if (nextValue) {
            reorderEnumValue(parseInt(enumMoveDownBtn.getAttribute('data-id'), 10), nextValue.id);
        }
        return;
    }

    var attrDeleteBtn = e.target.closest('.attr-delete-btn');
    if (attrDeleteBtn) {
        deleteAttribute(parseInt(attrDeleteBtn.getAttribute('data-attr-id'), 10));
        return;
    }

    var ppvSaveBtn = e.target.closest('.ppv-save-btn');
    if (ppvSaveBtn) {
        saveProductParameter(parseInt(ppvSaveBtn.getAttribute('data-param-id'), 10));
        return;
    }

    var ppvDeleteBtn = e.target.closest('.ppv-delete-btn');
    if (ppvDeleteBtn) {
        var ppvId = parseInt(ppvDeleteBtn.getAttribute('data-ppv-id'), 10);
        apiRequest(apiUrls.productParameterDelete + ppvId + '/delete/', { method: 'DELETE' })
            .then(function () {
                showMessage('Значение удалено', 'success');
                return loadProductCard(state.selectedProductId);
            })
            .catch(function (err) {
                showMessage(err.message, 'error');
            });
    }
}

var tabButtons = document.querySelectorAll('.tab-btn');
for (var t = 0; t < tabButtons.length; t++) {
    tabButtons[t].onclick = function (e) {
        e.preventDefault();
        activateTab(this.getAttribute('data-tab'));
    };
}

if (openBtn) openBtn.onclick = openModalFunc;
if (openMoveBtn) openMoveBtn.onclick = openMoveModalFunc;
if (cancelBtn) cancelBtn.onclick = closeModalFunc;
if (cancelMoveBtn) cancelMoveBtn.onclick = closeModalFunc;
if (overlay) overlay.onclick = closeModalFunc;

if (typeCategory) typeCategory.onclick = toggleFields;
if (typeProduct) typeProduct.onclick = toggleFields;

if (moveTypeParent) moveTypeParent.onclick = toggleMoveType;
if (moveTypeSibling) moveTypeSibling.onclick = toggleMoveType;

if (moveNodeSelect) {
    moveNodeSelect.onchange = function () {
        updateParentOptions();
        updateTargetPositionOptions();
    };
}

if (searchForm) searchForm.onsubmit = handleSearchSubmit;
if (addForm) addForm.onsubmit = handleAddSubmit;
if (moveForm) moveForm.onsubmit = handleMoveSubmit;
if (closeSearchBtn) closeSearchBtn.onclick = closeSearchPanel;

if (paramSaveBtn) paramSaveBtn.onclick = saveParameter;
if (paramCancelBtn) paramCancelBtn.onclick = resetParamForm;
if (constraintCancelBtn) constraintCancelBtn.onclick = closeModalFunc;
if (constraintSaveBtn) constraintSaveBtn.onclick = saveConstraint;

if (enumCreateBtn) enumCreateBtn.onclick = createEnumDefinition;
if (enumValueAddBtn) enumValueAddBtn.onclick = addEnumValue;

if (searchLoadParamsBtn) searchLoadParamsBtn.onclick = renderSearchFilters;
if (searchRunBtn) searchRunBtn.onclick = runProductSearch;

document.addEventListener('click', handleDocumentClick);

toggleFields();
toggleMoveType();
fillUnitsSelect();
loadTree();
