var apiUrls = window.apiUrls || {};
var nodesData = [];
var selectedCategoryId = null;

var modal = document.getElementById('modal');
var moveModal = document.getElementById('moveModal');
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
var searchCategoryTitle = document.getElementById('searchCategoryTitle');
var closeSearchBtn = document.getElementById('closeSearchPanel');

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
    var color = type === 'error' ? 'red' : 'green';
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

    return fetch(url, opts)
        .then(function (res) {
            return res.json().then(function (data) {
                return { status: res.status, data: data };
            });
        })
        .then(function (result) {
            if (result.status >= 200 && result.status < 300 && result.data.ok) {
                return result.data.data;
            }
            throw new Error(result.data.error || 'Ошибка API');
        });
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

function closeModalFunc() {
    if (modal) modal.style.display = 'none';
    if (moveModal) moveModal.style.display = 'none';
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
    for (var i = 0; i < nodesData.length; i++) {
        if (nodesData[i].id === nodeId) return nodesData[i];
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

        for (var i = 0; i < nodesData.length; i++) {
            if (nodesData[i].parent_id === current) {
                descendants.push(nodesData[i].id);
                stack.push(nodesData[i].id);
            }
        }
    }

    return descendants;
}

function updateSelectOptions() {
    if (!parentSelect || !moveNodeSelect || !newParentSelect) return;

    var options = '<option value="">— Корневая категория —</option>';
    var moveOptions = '<option value="">— Выберите вершину —</option>';

    for (var i = 0; i < nodesData.length; i++) {
        var n = nodesData[i];
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
            option.classList.remove('error-option');
            continue;
        }

        var nodeId = parseInt(rawValue, 10);
        var disabled = nodeId === selectedId || descendantsIds.indexOf(nodeId) !== -1;
        option.disabled = disabled;
        if (disabled) {
            option.classList.add('error-option');
        } else {
            option.classList.remove('error-option');
        }
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

    for (var i = 0; i < nodesData.length; i++) {
        var n = nodesData[i];
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
    treeContainer.innerHTML = '';
    if (!treeContainer) return;

    if (!nodesData.length) {
        treeContainer.innerHTML = '<p>Нет данных</p>';
        return;
    }

    var html = '<ul style="list-style-type:none; padding-left:0;">';
    for (var i = 0; i < nodesData.length; i++) {
        var n = nodesData[i];
        html += '<li style="margin-left:' + (n.level * 2.5) + 'rem;">'
            + '<a href="#" class="node-link" data-node-id="' + n.id + '" style="text-decoration:none;">'
            + 'id: ' + n.id + ', p_id: ' + (n.parent_id === null ? 'None' : n.parent_id) + ' - ' + escapeHtml(n.name)
            + '</a>'
            + '<span style="white-space:nowrap; margin-left:6px;">'
            + '<button type="button" class="delete-category-btn" data-id="' + n.id + '" data-name="' + escapeHtml(n.name) + '">✖</button>'
            + '<button type="button" class="search-btn" data-node-id="' + n.id + '" data-node-name="' + escapeHtml(n.name) + '">🔍</button>'
            + '</span>'
            + '</li>';
    }
    html += '</ul>';
    treeContainer.innerHTML = html;
}

function renderProductsTable(products) {
    if (!products || !products.length) {
        return '<p>В этой категории нет товаров</p>';
    }

    var html = ''
        + '<table border="1" cellpadding="5" cellspacing="0" width="100%">'
        + '<thead><tr>'
        + '<th>Название товара</th><th>SKU</th><th>Цена (руб)</th><th>Поставщик</th><th>Вес (грамм)</th><th>Действие</th>'
        + '</tr></thead><tbody>';

    for (var i = 0; i < products.length; i++) {
        var p = products[i];
        html += '<tr>'
            + '<td>' + escapeHtml(p.name) + '</td>'
            + '<td>' + escapeHtml(p.sku || '—') + '</td>'
            + '<td>' + escapeHtml(p.price) + '</td>'
            + '<td>' + escapeHtml(p.supplier) + '</td>'
            + '<td>' + escapeHtml(p.weight_gram) + '</td>'
            + '<td><button type="button" class="delete-product-btn" data-id="' + p.id + '" data-name="' + escapeHtml(p.name) + '">✖</button></td>'
            + '</tr>';
    }

    html += '</tbody></table>';
    return html;
}

function renderCategoryContent(payload) {
    var category = payload.category;
    var products = payload.products;

    contentContainer.innerHTML = '<h2>' + escapeHtml(category.name) + ' (id=' + category.id + ')</h2>' + renderProductsTable(products);
}

function renderSearchResult(data, searchType, categoryId) {
    var category = data.category;

    var html = '<h2>Поиск для категории "' + escapeHtml(category.name) + '" (id=' + category.id + ')</h2>';

    if (searchType === 'descendants') {
        html += '<h3>Все потомки:</h3>';
        var items = data.children || [];
        if (items.length) {
            html += '<ul>';
            items.forEach(function(d) {
                html += '<li><a href="#" class="node-link" data-node-id="' + d.id + '">' + escapeHtml(d.name) + '</a> (id=' + d.id + ')</li>';
            });
            html += '</ul>';
        } else {
            html += '<p>Нет потомков</p>';
        }
    } else if (searchType === 'parents') {
        html += '<h3>Все родители:</h3>';
        var items = data.parents || [];
        if (items.length) {
            html += '<ul>';
            items.forEach(function(p) {
                html += '<li><a href="#" class="node-link" data-node-id="' + p.id + '">' + escapeHtml(p.name) + '</a> (id=' + p.id + ')</li>';
            });
            html += '</ul>';
        } else {
            html += '<p>Нет родителей (корневая категория)</p>';
        }
    } else if (searchType === 'terminals') {
        html += '<h3>Терминальные узлы:</h3>';
        var items = data.terminal_nodes || [];
        if (items.length) {
            html += '<ul>';
            items.forEach(function(t) {
                html += '<li><a href="#" class="node-link" data-node-id="' + t.id + '">' + escapeHtml(t.name) + '</a> (id=' + t.id + ')</li>';
            });
            html += '</ul>';
        } else {
            html += '<p>Нет терминальных узлов</p>';
        }
    }

    html += '<p><button type="button" id="clearSearchBtn">Очистить результаты поиска</button></p>';
    contentContainer.innerHTML = html;
}


function loadTree() {
    return apiRequest(apiUrls.tree)
        .then(function (data) {
            nodesData = data || [];
            renderTree();
            updateSelectOptions();
            updateParentOptions();
            updateTargetPositionOptions();
        })
        .catch(function (err) {
            treeContainer.innerHTML = '<p style="color:red;">Ошибка загрузки дерева: ' + escapeHtml(err.message) + '</p>';
        });
}

function loadCategoryProducts(categoryId) {
    selectedCategoryId = categoryId;
    clearMessage();

    apiRequest('/api/categories/' + categoryId + '/products/')
        .then(function (data) {
            renderCategoryContent(data);
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function showSearchPanel(nodeId, nodeName) {
    if (!searchPanel || !searchCategoryIdInput || !searchCategoryTitle) return;
    searchCategoryIdInput.value = nodeId;
    searchCategoryTitle.textContent = 'Поиск для категории "' + nodeName + '" (id=' + nodeId + ')';
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
            if (selectedCategoryId) {
                loadCategoryProducts(selectedCategoryId);
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
            if (selectedCategoryId) {
                loadCategoryProducts(selectedCategoryId);
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
        url = '/api/categories/' + categoryId + '/children/';
    } else if (searchType === 'parents') {
        url = '/api/categories/' + categoryId + '/parents/';
    } else if (searchType === 'terminals') {
        url = '/api/categories/' + categoryId + '/terminals/';
    } else {
        showMessage('Неизвестный тип поиска', 'error');
        return;
    }

    apiRequest(url)
        .then(function (data) {
            renderSearchResult(data, searchType, categoryId);
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
            if (deleteType === 'category' && deleteId === selectedCategoryId) {
                selectedCategoryId = null;
                contentContainer.innerHTML = '<p>Выберите категорию слева</p>';
            }
            return loadTree();
        })
        .then(function () {
            if (selectedCategoryId) {
                loadCategoryProducts(selectedCategoryId);
            }
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

function handleDocumentClick(e) {
    var nodeLink = e.target.closest('.node-link');
    if (nodeLink) {
        e.preventDefault();
        loadCategoryProducts(parseInt(nodeLink.getAttribute('data-node-id'), 10));
        return;
    }

    var searchBtn = e.target.closest('.search-btn');
    if (searchBtn) {
        showSearchPanel(searchBtn.getAttribute('data-node-id'), searchBtn.getAttribute('data-node-name'));
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

    if (e.target && e.target.id === 'clearSearchBtn') {
        contentContainer.innerHTML = '<p>Выберите категорию слева или нажмите 🔍 для поиска</p>';
    }
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

document.addEventListener('click', handleDocumentClick);

toggleFields();
toggleMoveType();
loadTree();
