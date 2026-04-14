
var nodesData = window.nodesData || [];

var modal = document.getElementById('modal');
var moveModal = document.getElementById('moveModal');
var overlay = document.getElementById('overlay');

var openBtn = document.getElementById('openModalBtn');
var openMoveBtn = document.getElementById('openMoveModalBtn');
var cancelBtn = document.getElementById('cancelBtn');
var cancelMoveBtn = document.getElementById('cancelMoveBtn');

var typeCategory = document.getElementById('type_category');
var typeProduct = document.getElementById('type_product');
var productFields = document.getElementById('product_fields');
var unitField = document.getElementById('unit_field');

var moveTypeParent = document.getElementById('move_type_parent');
var moveTypeSibling = document.getElementById('move_type_sibling');
var targetParentDiv = document.getElementById('target_parent_div');
var targetPositionDiv = document.getElementById('target_position_div');

var moveNodeSelect = document.getElementById('move_node_id');
var targetPositionSelect = document.getElementById('target_position');
var newParentSelect = document.getElementById('new_parent_id');

var submitMoveBtn = document.getElementById('submitMoveBtn');         // обычная отправка формы
var submitMoveApiBtn = document.getElementById('submitMoveApiBtn');   // API-кнопка (если есть)

var searchPanel = document.getElementById('searchPanel');
var searchCategoryId = document.getElementById('search_category_id');
var searchCategoryTitle = document.getElementById('searchCategoryTitle');
var closeSearchBtn = document.getElementById('closeSearchPanel');
var searchBtns = document.querySelectorAll('.search-btn');

function openModalFunc() {
    if (modal) modal.style.display = 'block';
    if (overlay) overlay.style.display = 'block';
}

function openMoveModalFunc() {
    if (moveModal) moveModal.style.display = 'block';
    if (overlay) overlay.style.display = 'block';
    updateTargetPositionOptions();
    updateParentOptions();
}

function closeModalFunc() {
    if (modal) modal.style.display = 'none';
    if (moveModal) moveModal.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
}

function toggleFields() {
    if (!typeProduct || !productFields || !unitField) return;
    if (typeProduct.checked) {
        productFields.style.display = 'block';
        unitField.style.display = 'none';
    } else {
        productFields.style.display = 'none';
        unitField.style.display = 'block';
    }
}

function toggleMoveType() {
    if (!moveTypeParent || !targetParentDiv || !targetPositionDiv) return;

    if (moveTypeParent.checked) {
        targetParentDiv.style.display = 'block';
        targetPositionDiv.style.display = 'none';
    } else {
        targetParentDiv.style.display = 'none';
        targetPositionDiv.style.display = 'block';
        updateTargetPositionOptions();
    }
}

function getDescendantsIds(rootId) {
    var descendants = [];
    var stack = [rootId];
    var visited = new Set();

    while (stack.length > 0) {
        var current = stack.pop();
        if (visited.has(current)) continue;
        visited.add(current);

        for (var i = 0; i < nodesData.length; i++) {
            var p = nodesData[i].parent_id;
            if (p === current || p === String(current)) {
                descendants.push(nodesData[i].id);
                stack.push(nodesData[i].id);
            }
        }
    }
    return descendants;
}

function updateParentOptions() {
    if (!moveNodeSelect || !newParentSelect) return;

    var selectedRaw = moveNodeSelect.value;
    if (!selectedRaw) return;
    var selectedId = parseInt(selectedRaw, 10);

    var descendantsIds = getDescendantsIds(selectedId);

    for (var i = 0; i < newParentSelect.options.length; i++) {
        var option = newParentSelect.options[i];
        var valRaw = option.value;

        // корень ("")
        if (valRaw === '') {
            option.disabled = false;
            option.classList.remove('error-option');
            option.text = option.text.replace(/ ⚠️.*$/, '');
            continue;
        }

        var optionValue = parseInt(valRaw, 10);

        if (optionValue === selectedId) {
            option.disabled = true;
            option.classList.add('error-option');
            option.text = option.text.replace(/ ⚠️.*$/, '') + ' ⚠️ НЕЛЬЗЯ (это та же вершина)';
        } else if (descendantsIds.indexOf(optionValue) !== -1) {
            option.disabled = true;
            option.classList.add('error-option');
            option.text = option.text.replace(/ ⚠️.*$/, '') + ' ⚠️ НЕЛЬЗЯ (это потомок)';
        } else {
            option.disabled = false;
            option.classList.remove('error-option');
            option.text = option.text.replace(/ ⚠️.*$/, '');
        }
    }
}

function updateTargetPositionOptions() {
    if (!moveNodeSelect || !targetPositionSelect) return;

    var selectedNodeId = parseInt(moveNodeSelect.value, 10);
    if (!selectedNodeId || isNaN(selectedNodeId)) {
        targetPositionSelect.innerHTML = '<option value="">— Сначала выберите вершину —</option>';
        return;
    }

    var parentId = null;
    for (var i = 0; i < nodesData.length; i++) {
        if (nodesData[i].id === selectedNodeId) {
            parentId = (nodesData[i].parent_id !== null && nodesData[i].parent_id !== 'null')
                ? parseInt(nodesData[i].parent_id, 10)
                : null;
            break;
        }
    }

    var siblings = [];
    for (var j = 0; j < nodesData.length; j++) {
        var node = nodesData[j];
        var nodeParentId = (node.parent_id !== null && node.parent_id !== 'null')
            ? parseInt(node.parent_id, 10)
            : null;

        if (node.id !== selectedNodeId && nodeParentId === parentId) {
            siblings.push(node);
        }
    }

    var options = '<option value="">— В начало —</option>';
    for (var k = 0; k < siblings.length; k++) {
        options += '<option value="' + siblings[k].id + '">После ' + siblings[k].name + '</option>';
    }

    if (siblings.length === 0) {
        options = '<option value="">— Нет других вершин на этом уровне —</option>';
    }

    targetPositionSelect.innerHTML = options;
}

function showSearchPanel(nodeId, nodeName) {
    if (!searchCategoryId || !searchCategoryTitle || !searchPanel) return;

    searchCategoryId.value = nodeId;
    searchCategoryTitle.textContent = 'Поиск для категории "' + nodeName + '" (id=' + nodeId + ')';
    searchPanel.classList.add('active');

    var radios = document.querySelectorAll('#searchForm input[type="radio"]');
    radios.forEach(function (radio) {
        radio.checked = false;
    });
}

function closeSearchPanel() {
    if (searchPanel) searchPanel.classList.remove('active');
}

function isDescendant(ancestorId, maybeDescendantId) {
    // true если maybeDescendantId находится в поддереве ancestorId
    var stack = [ancestorId];
    var visited = new Set();

    while (stack.length > 0) {
        var current = stack.pop();
        if (visited.has(current)) continue;
        visited.add(current);

        for (var i = 0; i < nodesData.length; i++) {
            if (nodesData[i].parent_id == current) {
                if (nodesData[i].id == maybeDescendantId) return true;
                stack.push(nodesData[i].id);
            }
        }
    }
    return false;
}

function validateMove() {
    if (!moveNodeSelect) return true;

    var selectedNodeId = parseInt(moveNodeSelect.value, 10);
    if (!selectedNodeId || isNaN(selectedNodeId)) {
        alert('Выберите вершину для перемещения');
        return false;
    }

    if (moveTypeParent && moveTypeParent.checked) {
        if (!newParentSelect) return true;

        var newParentRaw = newParentSelect.value;
        if (newParentRaw === '') return true; // в корень можно

        var newParentId = parseInt(newParentRaw, 10);

        if (selectedNodeId === newParentId) {
            alert('Нельзя переместить вершину в саму себя!');
            return false;
        }

        if (isDescendant(selectedNodeId, newParentId)) {
            alert('Нельзя переместить вершину в своего потомка!');
            return false;
        }
    }

    return true;
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

function moveViaApi() {
    if (!validateMove()) return;

    if (!moveTypeParent || !moveTypeParent.checked) {
        alert('API-кнопка сейчас поддерживает только "смену родителя". Для reorder используй обычную кнопку.');
        return;
    }

    var categoryId = parseInt(moveNodeSelect.value, 10);
    var newParentRaw = newParentSelect ? newParentSelect.value : '';
    var newParentId = (newParentRaw === '' || newParentRaw === null) ? null : parseInt(newParentRaw, 10);

    fetch('/api/category/move/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken')
        },
        body: JSON.stringify({
            category_id: categoryId,
            new_parent_id: newParentId
        })
    })
    .then(function (res) {
        return res.json().then(function (data) {
            return { status: res.status, data: data };
        });
    })
    .then(function (result) {
        if (result.status >= 200 && result.status < 300 && result.data.ok) {
            alert('Успешно перемещено через API');
            window.location.reload();
        } else {
            alert(result.data.error || 'Ошибка API');
        }
    })
    .catch(function () {
        alert('Ошибка сети при вызове API');
    });
}

// ===== bind events =====
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
        updateTargetPositionOptions();
        updateParentOptions();
    };
}

if (submitMoveBtn) {
    submitMoveBtn.onclick = function (e) {
        // обычная HTML-форма
        if (!validateMove()) {
            e.preventDefault();
            return false;
        }
    };
}

if (submitMoveApiBtn) {
    submitMoveApiBtn.onclick = function () {
        moveViaApi();
    };
}

if (searchBtns && searchBtns.length) {
    searchBtns.forEach(function (btn) {
        btn.onclick = function () {
            var nodeId = this.getAttribute('data-node-id');
            var nodeName = this.getAttribute('data-node-name');
            showSearchPanel(nodeId, nodeName);
        };
    });
}

if (closeSearchBtn) closeSearchBtn.onclick = closeSearchPanel;

// ===== init =====
toggleFields();
toggleMoveType();
updateTargetPositionOptions();
updateParentOptions();