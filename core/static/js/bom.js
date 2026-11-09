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
var bomComponentSelect = document.getElementById('bomComponentSelect');
var bomItemQuantity = document.getElementById('bomItemQuantity');
var bomItemPerQuantity = document.getElementById('bomItemPerQuantity');
var bomItemUnitSelect = document.getElementById('bomItemUnitSelect');
var bomContent = document.getElementById('bomContent');
var bomProductId = null;
var bomProductsLoaded = false;
var bomUnits = [];

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

// Классы, в которых у изделия есть ресурсы: остальные в расчёте дадут пустую таблицу
function loadBomClasses() {
    if (bomProductId === null) return Promise.resolve();

    var quantity = document.getElementById('bomQuantity').value || 1;
    var selected = bomClassSelect.value;

    return apiRequest('/api/bom/' + bomProductId + '/calc-classes/?quantity=' + encodeURIComponent(quantity))
        .then(function (rows) {
            var html = '<option value="">— Все ресурсы —</option>';
            rows.forEach(function (c) {
                html += '<option value="' + c.id + '">'
                    + escapeHtml(c.name) + ' (' + c.resource_count + ')'
                    + '</option>';
            });
            bomClassSelect.innerHTML = html;
            if (selected) bomClassSelect.value = selected;
        });
}

function loadBomUnits() {
    return apiRequest('/api/units/').then(function (units) {
        bomUnits = units || [];
        var html = '';
        bomUnits.forEach(function (u) {
            html += '<option value="' + u.id + '">' + escapeHtml(u.symbol + ' — ' + u.name) + '</option>';
        });
        bomItemUnitSelect.innerHTML = html;
    });
}

function loadBomComponents() {
    if (!bomProductId) {
        bomComponentSelect.innerHTML = '<option value="">— Выберите изделие —</option>';
        return Promise.resolve();
    }
    return apiRequest('/api/products/').then(function (products) {
        var html = '<option value="">— Выберите компонент —</option>';
        products.forEach(function (p) {
            if (p.id === bomProductId) return;
            html += '<option value="' + p.id + '">' + escapeHtml(p.designation || p.name) + ' — ' + escapeHtml(p.name) + '</option>';
        });
        bomComponentSelect.innerHTML = html;
    });
}

tabLoaders.bom = function () {
    // список изделий может измениться на других вкладках, поэтому перечитываем
    loadBomProducts().then(function () {
        if (bomProductId) bomProductSelect.value = bomProductId;
    }).catch(function (err) {
        showMessage(err.message, 'error');
    });
    loadBomUnits();
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

    loadBomUnits();
    loadBomComponents();
    loadBomTree();
    // Расчёт зависит от списка классов, поэтому запускаем после его загрузки
    loadBomClasses().then(loadBomCalc).catch(loadBomCalc);
    loadBomChanges();
}

// ---------- 1. Состав ----------

function loadBomTree() {
    var box = document.getElementById('bomTree');
    box.innerHTML = '<p class="muted">Загрузка...</p>';

    Promise.all([
        apiRequest('/api/bom/' + bomProductId + '/items/'),
        apiRequest('/api/bom/' + bomProductId + '/tree/')
    ])
        .then(function (results) {
            var rows = results[0] || [];
            var treeRows = results[1] || [];
            var unitOptions = bomUnits.map(function (u) {
                return '<option value="' + u.id + '">' + escapeHtml(u.symbol + ' — ' + u.name) + '</option>';
            }).join('');

            if (!rows.length) {
                box.innerHTML = '<p class="muted">Состав не задан</p>';
                return;
            }

            var html = '<div class="table-wrap"><table><thead><tr>'
                + '<th>Компонент</th><th>Обозначение</th><th>Тип</th><th>Норма</th><th>Норма на 1</th><th>Ед. изм.</th><th>Действие</th>'
                + '</tr></thead><tbody>';

            rows.forEach(function (r) {
                // поля ввода стоят в своих ячейках, но принадлежат форме строки через атрибут form
                var formId = 'bom-form-' + r.id;
                var unitSelect = '<select name="unit_id" form="' + formId + '">'
                    + unitOptions.replace('value="' + r.unit_id + '"', 'value="' + r.unit_id + '" selected') + '</select>';
                html += '<tr>'
                    + '<td>' + escapeHtml(r.component_name || '—') + (r.is_base ? ' <span class="badge">из базы</span>' : '') + '</td>'
                    + '<td>' + escapeHtml(r.component_designation || '—') + '</td>'
                    + '<td>' + productTypeName(r.product_type_code) + '</td>'
                    + '<td><input type="number" name="quantity" form="' + formId + '" min="0.001" step="any" value="' + Number(r.quantity || 0) + '"></td>'
                    + '<td><input type="number" name="per_quantity" form="' + formId + '" min="0.001" step="any" value="' + Number(r.per_quantity || 1) + '"></td>'
                    + '<td>' + unitSelect + '</td>'
                    + '<td><form id="' + formId + '" class="bom-item-form" data-bom-item-id="' + r.id + '"><button type="submit" class="small">Сохранить</button>'
                    + '<button type="button" class="small danger bom-delete-btn" data-bom-item-id="' + r.id + '">Удалить</button></form></td>'
                    + '</tr>';
            });
            html += '</tbody></table></div>';
            box.innerHTML = html;

            if (treeRows.length) {
                var treeHint = '<h4>Дерево состава</h4>' + renderTable([
                    {
                        title: 'Компонент',
                        render: function (row) {
                            return '<span style="padding-left:' + ((row.lvl - 1) * 20) + 'px">'
                                + (row.lvl > 1 ? '&#8627; ' : '') + escapeHtml(row.name) + '</span>'
                                + (row.is_base ? ' <span class="badge">из базы</span>' : '');
                        }
                    },
                    { title: 'Обозначение', render: function (row) { return escapeHtml(row.designation || '—'); } },
                    { title: 'Тип', render: function (row) { return productTypeName(row.product_type_code); } },
                    { title: 'Норма', num: true, render: function (row) { return formatNumber(row.norm) + ' ' + escapeHtml(row.norm_unit); } },
                    { title: 'На 1 изделие', num: true, render: function (row) { return formatNumber(row.total_quantity) + ' ' + escapeHtml(row.total_unit); } }
                ], treeRows, '');
                box.innerHTML += treeHint;
            }
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
            ], rows, 'В выбранном классе нет ресурсов — выберите другой или «Все ресурсы»');

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
    var logBox = document.getElementById('bomChangeLog');
    if (logBox) logBox.innerHTML = '<p class="muted">Загрузка...</p>';

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

    if (!logBox) return;

    apiRequest('/api/bom/' + bomProductId + '/change-log/')
        .then(function (rows) {
            logBox.innerHTML = renderTable([
                { title: 'Изменение', num: true, render: function (r) { return r.change_no || '—'; } },
                { title: 'Компонент', render: function (r) { return escapeHtml(r.component_name || ('id=' + r.component_id)); } },
                { title: 'Операция', render: function (r) { return bomOperationName(r.operation); } },
                { title: 'Норма', num: true, render: function (r) { return bomLogValue(r, 'quantity', ''); } },
                { title: 'Норма на 1', num: true, render: function (r) { return bomLogValue(r, 'per_quantity', ''); } },
                { title: 'Ед. изм.', render: function (r) { return bomLogValue(r, 'unit', 'symbol'); } },
                { title: 'Из базы', render: function (r) { return bomLogBool(r.old_is_base, r.new_is_base); } },
                { title: 'Автор', render: function (r) { return escapeHtml(r.changed_by || '—'); } },
                { title: 'Когда', render: function (r) { return r.changed_at ? new Date(r.changed_at).toLocaleString('ru-RU') : '—'; } }
            ], rows, 'Правок состава пока не было');
        })
        .catch(function (err) {
            logBox.innerHTML = '<p class="muted">' + escapeHtml(err.message) + '</p>';
        });
}

var BOM_OPERATIONS = { add: 'добавление', update: 'изменение', remove: 'удаление' };

function bomOperationName(operation) {
    return BOM_OPERATIONS[operation] || escapeHtml(operation || '');
}

// Старое -> новое значение поля журнала
function bomLogChange(oldValue, newValue, format) {
    var fmt = format || function (v) { return escapeHtml(String(v)); };
    if (oldValue === null || oldValue === undefined) {
        return newValue === null || newValue === undefined ? '—' : fmt(newValue);
    }
    var before = fmt(oldValue);
    if (newValue === null || newValue === undefined || newValue === oldValue) return before;
    return before + ' → ' + fmt(newValue);
}

function bomLogValue(row, field, suffix) {
    var numeric = field !== 'unit';
    var format = function (v) {
        return numeric
            ? formatNumber(v) + (suffix ? ' ' + escapeHtml(suffix) : '')
            : escapeHtml(String(v));
    };
    if (field === 'unit') {
        return bomLogChange(row.old_unit_symbol, row.new_unit_symbol);
    }
    return bomLogChange(row['old_' + field], row['new_' + field], format);
}

function bomLogBool(oldValue, newValue) {
    var fmt = function (v) { return v ? 'да' : 'нет'; };
    return bomLogChange(oldValue, newValue, fmt);
}

// ---------- Обработчики ----------

bomProductSelect.addEventListener('change', function () {
    var id = parseInt(bomProductSelect.value, 10);
    // меняем адрес, чтобы ссылку на изделие можно было скопировать
    history.replaceState(null, '', id ? '#bom/' + id : '#bom');
    showBomProduct(id || null);
});

document.getElementById('bomAddItemForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!bomProductId) {
        showMessage('Сначала выберите изделие', 'error');
        return;
    }
    apiRequest('/api/bom/items/create/', 'POST', {
        parent_product_id: bomProductId,
        component_id: bomComponentSelect.value,
        quantity: bomItemQuantity.value,
        per_quantity: bomItemPerQuantity.value,
        unit_id: bomItemUnitSelect.value
    })
        .then(function () {
            e.target.reset();
            bomItemQuantity.value = 1;
            bomItemPerQuantity.value = 1;
            loadBomTree();
            loadBomCalc();
            showMessage('Компонент добавлен в состав', 'success');
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
});

document.addEventListener('submit', function (e) {
    if (!e.target.classList.contains('bom-item-form')) return;
    e.preventDefault();
    var form = e.target;
    var id = parseInt(form.getAttribute('data-bom-item-id'), 10);
    var payload = {
        bom_item_id: id,
        quantity: form.elements['quantity'].value,
        per_quantity: form.elements['per_quantity'].value,
        unit_id: form.elements['unit_id'].value
    };
    apiRequest('/api/bom/items/update/', 'PUT', payload)
        .then(function () {
            showMessage('Норма компонента обновлена', 'success');
            loadBomTree();
            loadBomCalc();
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
});

document.addEventListener('click', function (e) {
    var btn = e.target.closest('.bom-delete-btn');
    if (!btn) return;
    var bomItemId = parseInt(btn.getAttribute('data-bom-item-id'), 10);
    if (!confirm('Удалить строку состава?')) return;
    apiRequest('/api/bom/items/' + bomItemId + '/delete/', 'DELETE')
        .then(function () {
            showMessage('Компонент удалён из состава', 'success');
            loadBomTree();
            loadBomCalc();
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
});

document.getElementById('bomCalcForm').addEventListener('submit', function (e) {
    e.preventDefault();
    loadBomCalc();
});

// Расчёт обновляется сразу при смене количества или класса — кнопка не обязательна
bomClassSelect.addEventListener('change', function () {
    if (bomProductId !== null) loadBomCalc();
});

document.getElementById('bomQuantity').addEventListener('change', function () {
    if (bomProductId !== null) loadBomCalc();
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
