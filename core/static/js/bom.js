// Вкладка «Спецификация (BOM)»
//
// API:
//   GET  /api/bom/<id>/tree/                       — дерево состава на всю глубину (find_bom)
//   GET  /api/bom/<id>/calc/?quantity=N&class_id=C — потребность в ресурсах на N изделий (calc_bom)
//   GET  /api/bom/<id>/calc-by-class/?quantity=N   — то же, сгруппированное по классам
//   GET  /api/bom/<id>/changes/                    — история изменений
//   POST /api/bom/modifications/create/            — создать модификацию
//   POST /api/bom/changes/register/                — зарегистрировать изменение

var bomProductSelect = document.getElementById('bomProductSelect');
var bomClassSelect = document.getElementById('bomClassSelect');
var bomContent = document.getElementById('bomContent');
var bomProductId = null;
var bomProductsLoaded = false;

// Типы, у которых может быть состав (материалы и покупные изделия — нет)
var BOM_TYPES = ['part', 'assembly', 'kit', 'complex'];

function loadBomProducts() {
    return apiRequest('/api/products/').then(function (products) {
        var html = '<option value="">— Выберите изделие —</option>';
        products.forEach(function (p) {
            if (BOM_TYPES.indexOf(p.product_type) === -1) return;
            html += '<option value="' + p.id + '">'
                + (p.designation ? escapeHtml(p.designation) + ' — ' : '')
                + escapeHtml(p.name) + ' (' + productTypeName(p.product_type).toLowerCase() + ')'
                + '</option>';
        });
        bomProductSelect.innerHTML = html;
        bomProductsLoaded = true;
    });
}

function loadBomClasses() {
    return apiRequest('/api/tree/').then(function (nodes) {
        var html = '<option value="">— Все ресурсы —</option>';
        nodes.forEach(function (n) {
            var indent = new Array(n.level + 1).join('   ');
            html += '<option value="' + n.id + '">' + indent + escapeHtml(n.name) + '</option>';
        });
        bomClassSelect.innerHTML = html;
    });
}

tabLoaders.bom = function () {
    // список изделий может измениться на других вкладках, поэтому перечитываем
    loadBomProducts().then(function () {
        if (bomProductId) bomProductSelect.value = bomProductId;
    }).catch(function (err) {
        showMessage(err.message, 'error');
    });
    loadBomClasses();
};

// Вызывается из common.js при адресе вида #bom/15
function selectBomProduct(productId) {
    var go = function () {
        bomProductSelect.value = productId;
        showBomProduct(productId);
    };
    if (bomProductsLoaded) {
        go();
    } else {
        loadBomProducts().then(go);
    }
}

function showBomProduct(productId) {
    bomProductId = productId;
    if (!productId) {
        bomContent.hidden = true;
        return;
    }

    var option = bomProductSelect.options[bomProductSelect.selectedIndex];
    document.getElementById('bomTitle').textContent = option ? option.textContent : 'Изделие id=' + productId;
    bomContent.hidden = false;

    loadBomTree();
    loadBomCalc();
    loadBomChanges();
}

// ---------- 1. Состав ----------

function loadBomTree() {
    var box = document.getElementById('bomTree');
    box.innerHTML = '<p class="muted">Загрузка...</p>';

    apiRequest('/api/bom/' + bomProductId + '/tree/')
        .then(function (rows) {
            box.innerHTML = renderTable([
                {
                    title: 'Компонент',
                    render: function (r) {
                        return '<span style="padding-left:' + ((r.lvl - 1) * 20) + 'px">'
                            + (r.lvl > 1 ? '&#8627; ' : '') + escapeHtml(r.name) + '</span>'
                            + (r.is_base ? ' <span class="badge">из базы</span>' : '');
                    }
                },
                { title: 'Обозначение', render: function (r) { return escapeHtml(r.designation || '—'); } },
                { title: 'Тип', render: function (r) { return productTypeName(r.product_type_code); } },
                { title: 'Норма', num: true, render: function (r) { return formatNumber(r.norm) + ' ' + escapeHtml(r.norm_unit); } },
                { title: 'На 1 изделие', num: true, render: function (r) { return formatNumber(r.total_quantity) + ' ' + escapeHtml(r.total_unit); } }
            ], rows, 'Состав не задан');
        })
        .catch(function (err) {
            box.innerHTML = '<p class="muted">' + escapeHtml(err.message) + '</p>';
        });
}

// ---------- 2. Расчёт потребности ----------

function loadBomCalc() {
    var quantity = document.getElementById('bomQuantity').value || 1;
    var classId = bomClassSelect.value;
    var calcBox = document.getElementById('bomCalc');
    var byClassBox = document.getElementById('bomCalcByClass');

    var url = '/api/bom/' + bomProductId + '/calc/?quantity=' + encodeURIComponent(quantity);
    if (classId) url += '&class_id=' + classId;

    apiRequest(url)
        .then(function (rows) {
            var total = 0;
            rows.forEach(function (r) { total += Number(r.total_cost) || 0; });

            var html = renderTable([
                { title: 'Обозначение', render: function (r) { return escapeHtml(r.designation || '—'); } },
                { title: 'Наименование', render: function (r) { return escapeHtml(r.name); } },
                { title: 'Класс', render: function (r) { return escapeHtml(r.class_name); } },
                { title: 'Количество', num: true, render: function (r) { return formatNumber(r.total_quantity) + ' ' + escapeHtml(r.unit); } },
                { title: 'Стоимость, руб', num: true, render: function (r) { return formatNumber(r.total_cost); } }
            ], rows, 'Нечего считать');

            if (rows.length) {
                html += '<p><b>Итого стоимость: ' + formatNumber(total) + ' руб</b></p>';
            }
            calcBox.innerHTML = html;
        })
        .catch(function (err) {
            calcBox.innerHTML = '<p class="muted">' + escapeHtml(err.message) + '</p>';
        });

    apiRequest('/api/bom/' + bomProductId + '/calc-by-class/?quantity=' + encodeURIComponent(quantity))
        .then(function (rows) {
            byClassBox.innerHTML = renderTable([
                { title: 'Класс ресурсов', render: function (r) { return escapeHtml(r.class_name); } },
                { title: 'Количество', num: true, render: function (r) { return formatNumber(r.total_quantity) + ' ' + escapeHtml(r.unit); } },
                { title: 'Стоимость, руб', num: true, render: function (r) { return formatNumber(r.total_cost); } }
            ], rows, 'Нет данных');
        })
        .catch(function (err) {
            byClassBox.innerHTML = '<p class="muted">' + escapeHtml(err.message) + '</p>';
        });
}

// ---------- 4. История изменений ----------

function loadBomChanges() {
    var box = document.getElementById('bomChanges');

    apiRequest('/api/bom/' + bomProductId + '/changes/')
        .then(function (rows) {
            box.innerHTML = renderTable([
                { title: '№', num: true, render: function (r) { return r.change_no; } },
                { title: 'Описание', render: function (r) { return escapeHtml(r.description); } },
                { title: 'Автор', render: function (r) { return escapeHtml(r.author); } },
                { title: 'Дата', render: function (r) { return r.created_at ? new Date(r.created_at).toLocaleString('ru-RU') : '—'; } }
            ], rows, 'Изменений пока не было');
        })
        .catch(function (err) {
            box.innerHTML = '<p class="muted">' + escapeHtml(err.message) + '</p>';
        });
}

// ---------- Обработчики ----------

bomProductSelect.addEventListener('change', function () {
    var id = parseInt(bomProductSelect.value, 10);
    // меняем адрес, чтобы ссылку на изделие можно было скопировать
    history.replaceState(null, '', id ? '#bom/' + id : '#bom');
    showBomProduct(id || null);
});

document.getElementById('bomCalcForm').addEventListener('submit', function (e) {
    e.preventDefault();
    loadBomCalc();
});

document.getElementById('bomModForm').addEventListener('submit', function (e) {
    e.preventDefault();
    apiRequest('/api/bom/modifications/create/', 'POST', {
        base_product_id: bomProductId,
        name: document.getElementById('modName').value,
        designation: document.getElementById('modDesignation').value
    })
        .then(function (product) {
            e.target.reset();
            return loadBomProducts().then(function () {
                location.hash = 'bom/' + product.id;
                showMessage('Создана модификация «' + product.name + '»', 'success');
            });
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
});

document.getElementById('bomChangeForm').addEventListener('submit', function (e) {
    e.preventDefault();
    apiRequest('/api/bom/changes/register/', 'POST', {
        product_id: bomProductId,
        description: document.getElementById('changeDescription').value
    })
        .then(function (change) {
            e.target.reset();
            showMessage('Зарегистрировано изменение №' + change.change_no, 'success');
            loadBomChanges();
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
});
