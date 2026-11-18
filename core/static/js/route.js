var routeState = {
    productId: '',
    routeId: '',
    products: [],
    routes: [],
    refs: null
};

// ---------- вспомогательные функции ----------

// <option> для списка простых записей {id, ...}
function routeSelectOptions(items, labelFn, selectedId, placeholder) {
    var html = placeholder ? '<option value="">' + placeholder + '</option>' : '';
    items.forEach(function (item) {
        html += '<option value="' + item.id + '"'
            + (String(selectedId) === String(item.id) ? ' selected' : '') + '>'
            + escapeHtml(labelFn(item)) + '</option>';
    });
    return html;
}

// <option> для дерева (классы операций, ГРЦ): отступ по уровню вложенности
function routeTreeOptions(nodes, selectedId, placeholder) {
    var html = placeholder ? '<option value="">' + placeholder + '</option>' : '';
    nodes.forEach(function (n) {
        html += '<option value="' + n.id + '"' + (String(selectedId) === String(n.id) ? ' selected' : '') + '>'
            + new Array(n.level + 1).join('\u00A0\u00A0\u00A0') + escapeHtml(n.name) + '</option>';
    });
    return html;
}

function routeProductLabel(p) {
    return (p.designation ? p.designation + ' — ' : '') + p.name;
}

function routeProfessionLabel(p) {
    return p.name + ', разряд ' + p.grade + ' (' + p.hourly_rate + ' руб/ч)';
}

function routeFail(err) {
    showMessage(err.message, 'error');
}

// ---------- загрузка справочников и списка изделий ----------

function loadRouteRefs() {
    return Promise.all([
        apiRequest('/api/operation-classes/'),
        apiRequest('/api/work-center-groups/'),
        apiRequest('/api/professions/'),
        apiRequest('/api/tooling/'),
        apiRequest('/api/units/'),
        apiRequest('/api/products/')
    ]).then(function (r) {
        routeState.refs = {
            operationClasses: r[0],
            workCenters: r[1],
            professions: r[2],
            tooling: r[3],
            units: r[4],
            timeUnits: r[4].filter(function (u) { return u.dimension_name === 'Время'; }),
            products: r[5]
        };
    });
}

// Форма добавления операции: варианты выбора из справочников
function fillRouteOperationForm() {
    var refs = routeState.refs;
    var minutes = refs.timeUnits.filter(function (u) { return u.symbol === 'мин'; })[0];
    document.getElementById('routeOpClass').innerHTML =
        routeTreeOptions(refs.operationClasses, '', 'Класс операций');
    document.getElementById('routeOpGroup').innerHTML =
        routeTreeOptions(refs.workCenters, '', 'Оборудование (ГРЦ)');
    document.getElementById('routeOpProfession').innerHTML =
        routeSelectOptions(refs.professions, routeProfessionLabel, '', 'Профессия, квалификация');
    document.getElementById('routeOpTimeUnit').innerHTML =
        routeSelectOptions(refs.timeUnits, function (u) { return u.symbol; }, minutes ? minutes.id : '', '');
}

tabLoaders.route = function () {
    Promise.all([apiRequest('/api/routes/products/'), loadRouteRefs()])
        .then(function (results) {
            routeState.products = results[0];

            // адрес вида #route/15 открывает вкладку и изделие 15
            var parts = location.hash.replace('#', '').split('/');
            if (parts[0] === 'route' && parts[1] && !routeState.productId) {
                routeState.productId = parts[1];
            }

            var html = '<option value="">— Выберите изделие —</option>';
            routeState.products.forEach(function (p) {
                html += '<option value="' + p.id + '"'
                    + (String(routeState.productId) === String(p.id) ? ' selected' : '') + '>'
                    + escapeHtml(routeProductLabel(p) + ' (' + productTypeName(p.product_type_code) + ')'
                        + (p.route_count ? ' · маршрутов: ' + p.route_count : ''))
                    + '</option>';
            });
            document.getElementById('routeProductSelect').innerHTML = html;

            fillRouteOperationForm();
            loadRouteProduct();
        })
        .catch(routeFail);
};

// ---------- выбранное изделие и его маршруты ----------

function loadRouteProduct() {
    var content = document.getElementById('routeContent');
    var product = routeState.products.filter(function (p) {
        return String(p.id) === String(routeState.productId);
    })[0];

    if (!product) {
        routeState.productId = '';
        routeState.routeId = '';
        content.hidden = true;
        return;
    }

    apiRequest('/api/routes/?product_id=' + product.id)
        .then(function (routes) {
            routeState.routes = routes;
            content.hidden = false;
            document.getElementById('routeTitle').textContent =
                routeProductLabel(product) + ' (' + productTypeName(product.product_type_code) + ')';

            var exists = routes.some(function (r) { return String(r.id) === String(routeState.routeId); });
            if (!exists) routeState.routeId = routes.length ? routes[0].id : '';

            document.getElementById('routeSelect').innerHTML = routes.map(function (r) {
                return '<option value="' + r.id + '"' + (String(routeState.routeId) === String(r.id) ? ' selected' : '') + '>'
                    + escapeHtml('№' + r.route_no + ' — ' + r.name) + '</option>';
            }).join('');

            document.getElementById('routeEmpty').hidden = routes.length > 0;
            document.getElementById('routeManage').hidden = routes.length === 0;

            if (routeState.routeId) {
                loadRouteDetails();
            } else {
                document.getElementById('routeOperations').innerHTML = '';
                loadRouteCalc();
            }
        })
        .catch(routeFail);
}

// ---------- маршрут целиком ----------

function loadRouteDetails() {
    return apiRequest('/api/routes/' + routeState.routeId + '/')
        .then(function (details) {
            document.getElementById('routeNameInput').value = details.route.name;
            renderRouteOperations(details);
            loadRouteCalc();
        })
        .catch(routeFail);
}

function renderRouteOperations(details) {
    var container = document.getElementById('routeOperations');
    if (!details.operations.length) {
        container.innerHTML = '<p class="muted">В маршруте пока нет операций. Добавьте первую операцию.</p>';
        return;
    }
    var lastIndex = details.operations.length - 1;
    container.innerHTML = details.operations.map(function (op, index) {
        return renderRouteOperationCard(op, index === 0, index === lastIndex);
    }).join('');
}

// Карточка операции: поля операции, инструмент и оснастка, материалы и комплектующие
function renderRouteOperationCard(op, isFirst, isLast) {
    var refs = routeState.refs;
    var materialProducts = refs.products.filter(function (p) {
        return String(p.id) !== String(routeState.productId);
    });

    var html = '<div class="route-operation" data-id="' + op.id + '" data-position="' + op.position_no + '"'
        + ' style="border:1px solid #d5dbe6;border-radius:8px;padding:12px 16px;margin:14px 0">';

    html += '<h4 style="margin:0 0 10px">Операция ' + op.position_no + '</h4>';

    // поля операции
    html += '<div class="form-row">'
        + '<input class="op-name" value="' + escapeHtml(op.name) + '" placeholder="Название операции">'
        + '<select class="op-class">' + routeTreeOptions(refs.operationClasses, op.operation_class.id, 'Класс операций') + '</select>'
        + '<select class="op-group">' + routeTreeOptions(refs.workCenters, op.work_center_group.id, 'Оборудование (ГРЦ)') + '</select>'
        + '<select class="op-profession">'
        + routeSelectOptions(refs.professions, routeProfessionLabel, op.profession.id, '') + '</select>'
        + '<input class="op-time" type="number" min="0.01" step="any" value="' + op.time_norm + '">'
        + '<select class="op-time-unit">'
        + routeSelectOptions(refs.timeUnits, function (u) { return u.symbol; }, op.time_unit_id, '') + '</select>'
        + '<button type="button" class="op-up"' + (isFirst ? ' disabled' : '') + '>↑</button>'
        + '<button type="button" class="op-down"' + (isLast ? ' disabled' : '') + '>↓</button>'
        + '<button type="button" class="op-save">Сохранить</button>'
        + '<button type="button" class="op-delete danger">Удалить</button>'
        + '</div>';

    // инструмент и оснастка
    html += '<p style="margin:14px 0 6px"><strong>Инструмент и оснастка</strong></p>';
    html += renderTable([
        { title: 'Обозначение', render: function (t) { return escapeHtml(t.designation); } },
        { title: 'Название', render: function (t) { return escapeHtml(t.name); } },
        { title: 'Вид', render: function (t) { return t.tooling_type === 'fixture' ? 'Оснастка' : 'Инструмент'; } },
        { title: 'Количество', num: true, render: function (t) {
            return '<input class="tool-qty-edit" type="number" min="1" step="1" value="' + t.quantity + '">';
        } },
        { title: 'Действия', className: 'action-cell', render: function (t) {
            return '<button type="button" class="tool-save" data-id="' + t.id + '">Сохранить</button>'
                + '<button type="button" class="tool-delete danger" data-id="' + t.id + '">Удалить</button>';
        } }
    ], op.tools, 'Инструмент не указан', 'refs-table');

    html += '<div class="form-row">'
        + '<select class="tool-new-select">'
        + routeSelectOptions(refs.tooling, function (t) { return t.designation + ' — ' + t.name; }, '', 'Инструмент или оснастка')
        + '</select>'
        + '<label>Количество</label>'
        + '<input class="tool-new-qty" type="number" min="1" step="1" value="1">'
        + '<button type="button" class="tool-add">Добавить инструмент</button>'
        + '</div>';

    // материалы и комплектующие
    html += '<p style="margin:14px 0 6px"><strong>Материалы и комплектующие</strong></p>';
    html += renderTable([
        { title: 'Обозначение', render: function (m) { return escapeHtml(m.designation || '—'); } },
        { title: 'Материал', render: function (m) { return escapeHtml(m.name); } },
        { title: 'Норма', num: true, render: function (m) {
            return '<input class="mat-qty-edit" type="number" min="0.000001" step="any" value="' + m.quantity + '">';
        } },
        { title: 'На', num: true, render: function (m) {
            return '<input class="mat-per-edit" type="number" min="0.000001" step="any" value="' + m.per_quantity + '">';
        } },
        { title: 'Ед. изм.', render: function (m) {
            return '<select class="mat-unit-edit">'
                + routeSelectOptions(refs.units, function (u) { return u.symbol; }, m.unit_id, '') + '</select>';
        } },
        { title: 'Действия', className: 'action-cell', render: function (m) {
            return '<button type="button" class="mat-save" data-id="' + m.id + '">Сохранить</button>'
                + '<button type="button" class="mat-delete danger" data-id="' + m.id + '">Удалить</button>';
        } }
    ], op.materials, 'Материалы не указаны', 'refs-table');

    html += '<div class="form-row">'
        + '<select class="mat-new-product">'
        + routeSelectOptions(materialProducts, routeProductLabel, '', 'Материал или комплектующее')
        + '</select>'
        + '<label>Норма</label>'
        + '<input class="mat-new-qty" type="number" min="0.000001" step="any" value="1">'
        + '<label>На</label>'
        + '<input class="mat-new-per" type="number" min="0.000001" step="any" value="1">'
        + '<select class="mat-new-unit">'
        + routeSelectOptions(refs.units, function (u) { return u.symbol; }, '', 'Ед. изм.')
        + '</select>'
        + '<button type="button" class="mat-add">Добавить материал</button>'
        + '</div>';

    html += '</div>';
    return html;
}

// ---------- выбор изделия и маршрута ----------

document.getElementById('routeProductSelect').addEventListener('change', function (e) {
    routeState.productId = e.target.value;
    routeState.routeId = '';
    loadRouteProduct();
});

document.getElementById('routeSelect').addEventListener('change', function (e) {
    routeState.routeId = e.target.value;
    if (routeState.routeId) loadRouteDetails();
});

// ---------- маршрут: создание, переименование, удаление ----------

// Ещё один вариант (версия) маршрута для того же изделия
document.getElementById('routeNewVersionBtn').addEventListener('click', function () {
    apiRequest('/api/routes/create/', 'POST', { product_id: routeState.productId })
        .then(function (route) {
            showMessage('Создана новая версия маршрута', 'success');
            routeState.routeId = route.id;
            tabLoaders.route();
        })
        .catch(routeFail);
});

document.getElementById('routeSaveBtn').addEventListener('click', function () {
    apiRequest('/api/routes/update/', 'PUT', {
        route_id: routeState.routeId,
        name: document.getElementById('routeNameInput').value
    }).then(function () {
        showMessage('Название маршрута сохранено', 'success');
        loadRouteProduct();
    }).catch(routeFail);
});

document.getElementById('routeDeleteBtn').addEventListener('click', function () {
    if (!confirm('Удалить маршрут вместе со всеми операциями?')) return;
    apiRequest('/api/routes/' + routeState.routeId + '/delete/', 'DELETE')
        .then(function () {
            showMessage('Маршрут удалён', 'delete');
            routeState.routeId = '';
            tabLoaders.route();
        })
        .catch(routeFail);
});

// ---------- добавление операции ----------

// Маршрут создаётся автоматически при добавлении первой операции (как состав в спецификации)
function ensureRoute() {
    if (routeState.routeId) return Promise.resolve(routeState.routeId);
    return apiRequest('/api/routes/create/', 'POST', { product_id: routeState.productId })
        .then(function (route) {
            routeState.routeId = route.id;
            return route.id;
        });
}

document.getElementById('routeOperationForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var routeWasMissing = !routeState.routeId;

    ensureRoute()
        .then(function (routeId) {
            return apiRequest('/api/route-operations/create/', 'POST', {
                route_id: routeId,
                name: document.getElementById('routeOpName').value,
                operation_class_id: document.getElementById('routeOpClass').value,
                work_center_group_id: document.getElementById('routeOpGroup').value,
                profession_id: document.getElementById('routeOpProfession').value,
                time_norm: document.getElementById('routeOpTime').value,
                time_unit_id: document.getElementById('routeOpTimeUnit').value
            });
        })
        .then(function () {
            showMessage('Операция добавлена', 'success');
            document.getElementById('routeOpName').value = '';
            document.getElementById('routeOpTime').value = '1';
            // если маршрут только что создан, обновляем и список маршрутов, и список изделий
            if (routeWasMissing) tabLoaders.route(); else loadRouteDetails();
        })
        .catch(function (err) {
            routeFail(err);
            if (routeWasMissing && routeState.routeId) tabLoaders.route();
        });
});

// ---------- действия внутри карточек операций ----------

document.getElementById('routeOperations').addEventListener('click', function (e) {
    var t = e.target;
    var card = t.closest('.route-operation');
    if (!card || t.tagName !== 'BUTTON') return;

    var operationId = card.getAttribute('data-id');
    var position = Number(card.getAttribute('data-position'));
    var rowId = t.getAttribute('data-id');
    var row = t.closest('tr');

    function done(text, type) {
        showMessage(text, type || 'success');
        loadRouteDetails();
    }

    // --- операция ---
    if (t.classList.contains('op-save')) {
        apiRequest('/api/route-operations/update/', 'PUT', {
            operation_id: operationId,
            name: card.querySelector('.op-name').value,
            operation_class_id: card.querySelector('.op-class').value,
            work_center_group_id: card.querySelector('.op-group').value,
            profession_id: card.querySelector('.op-profession').value,
            time_norm: card.querySelector('.op-time').value,
            time_unit_id: card.querySelector('.op-time-unit').value
        }).then(function () { done('Операция сохранена'); }).catch(routeFail);
        return;
    }
    if (t.classList.contains('op-delete')) {
        if (!confirm('Удалить операцию вместе с её инструментом и материалами?')) return;
        apiRequest('/api/route-operations/' + operationId + '/delete/', 'DELETE')
            .then(function () { done('Операция удалена', 'delete'); }).catch(routeFail);
        return;
    }
    if (t.classList.contains('op-up') || t.classList.contains('op-down')) {
        apiRequest('/api/route-operations/move/', 'PUT', {
            operation_id: operationId,
            position_no: t.classList.contains('op-up') ? position - 1 : position + 1
        }).then(function () { loadRouteDetails(); }).catch(routeFail);
        return;
    }

    // --- инструмент и оснастка ---
    if (t.classList.contains('tool-add')) {
        apiRequest('/api/route-operation-tools/add/', 'POST', {
            operation_id: operationId,
            tooling_id: card.querySelector('.tool-new-select').value,
            quantity: card.querySelector('.tool-new-qty').value
        }).then(function () { done('Инструмент добавлен'); }).catch(routeFail);
        return;
    }
    if (t.classList.contains('tool-save')) {
        apiRequest('/api/route-operation-tools/update/', 'PUT', {
            operation_tool_id: rowId,
            quantity: row.querySelector('.tool-qty-edit').value
        }).then(function () { done('Количество инструмента сохранено'); }).catch(routeFail);
        return;
    }
    if (t.classList.contains('tool-delete')) {
        if (!confirm('Убрать инструмент из операции?')) return;
        apiRequest('/api/route-operation-tools/' + rowId + '/delete/', 'DELETE')
            .then(function () { done('Инструмент убран', 'delete'); }).catch(routeFail);
        return;
    }

    // --- материалы и комплектующие ---
    if (t.classList.contains('mat-add')) {
        apiRequest('/api/route-operation-materials/add/', 'POST', {
            operation_id: operationId,
            product_id: card.querySelector('.mat-new-product').value,
            quantity: card.querySelector('.mat-new-qty').value,
            per_quantity: card.querySelector('.mat-new-per').value,
            unit_id: card.querySelector('.mat-new-unit').value
        }).then(function () { done('Материал добавлен'); }).catch(routeFail);
        return;
    }
    if (t.classList.contains('mat-save')) {
        apiRequest('/api/route-operation-materials/update/', 'PUT', {
            operation_material_id: rowId,
            quantity: row.querySelector('.mat-qty-edit').value,
            per_quantity: row.querySelector('.mat-per-edit').value,
            unit_id: row.querySelector('.mat-unit-edit').value
        }).then(function () { done('Норма расхода сохранена'); }).catch(routeFail);
        return;
    }
    if (t.classList.contains('mat-delete')) {
        if (!confirm('Убрать материал из операции?')) return;
        apiRequest('/api/route-operation-materials/' + rowId + '/delete/', 'DELETE')
            .then(function () { done('Материал убран', 'delete'); }).catch(routeFail);
    }
});

// ---------- анализ, нормы, калькуляция ----------

function loadRouteCalc() {
    var pid = routeState.productId;
    if (!pid) return;
    var quantity = document.getElementById('routeQuantity').value || 1;
    var q = encodeURIComponent(quantity);

    function show(boxId, err) {
        document.getElementById(boxId).innerHTML = '<p class="muted">' + escapeHtml(err.message) + '</p>';
    }

    // 2. все операции маршрутов на всю глубину
    apiRequest('/api/technology/' + pid + '/routes/').then(function (rows) {
        document.getElementById('routeDeep').innerHTML = renderTable([
            { title: 'Изделие', render: function (r) {
                return '<span style="padding-left:' + (r.lvl * 20) + 'px">'
                    + (r.lvl > 0 ? '&#8627; ' : '') + escapeHtml((r.designation ? r.designation + ' — ' : '') + r.product_name) + '</span>';
            } },
            { title: 'Маршрут', num: true, render: function (r) { return '№' + r.route_no; } },
            { title: '№ оп.', num: true, render: function (r) { return r.position_no; } },
            { title: 'Операция', render: function (r) { return escapeHtml(r.operation_name); } },
            { title: 'Класс', render: function (r) { return escapeHtml(r.operation_class); } },
            { title: 'ГРЦ', render: function (r) { return escapeHtml(r.work_center_group); } },
            { title: 'Профессия', render: function (r) { return escapeHtml(r.profession + ', разр. ' + r.grade); } },
            { title: 'Норма времени', num: true, render: function (r) { return formatNumber(r.time_norm) + ' ' + escapeHtml(r.time_unit); } },
            { title: 'Количество', num: true, render: function (r) { return formatNumber(r.qty) + ' ' + escapeHtml(r.qty_unit || ''); } }
        ], rows, 'Маршруты для изделия и его компонентов не заданы');
    }).catch(function (e) { show('routeDeep', e); });

    // 3. материалы (расчёт по спецификации) и труд
    apiRequest('/api/bom/' + pid + '/calc/?quantity=' + q).then(function (rows) {
        document.getElementById('routeMaterials').innerHTML = renderTable([
            { title: 'Обозначение', render: function (r) { return escapeHtml(r.designation || '—'); } },
            { title: 'Наименование', render: function (r) { return escapeHtml(r.name); } },
            { title: 'Класс', render: function (r) { return escapeHtml(r.class_name); } },
            { title: 'Количество', num: true, render: function (r) { return formatNumber(r.total_quantity) + ' ' + escapeHtml(r.unit); } },
            { title: 'Стоимость, руб', num: true, render: function (r) { return formatNumber(r.total_cost); } }
        ], rows, 'Состав изделия не задан');
    }).catch(function (e) { show('routeMaterials', e); });

    apiRequest('/api/technology/' + pid + '/labor/?quantity=' + q).then(function (rows) {
        document.getElementById('routeLabor').innerHTML = renderTable([
            { title: 'Профессия', render: function (r) { return escapeHtml(r.profession); } },
            { title: 'Разряд', num: true, render: function (r) { return r.grade; } },
            { title: 'Ставка, руб/ч', num: true, render: function (r) { return formatNumber(r.hourly_rate); } },
            { title: 'Трудоёмкость, ч', num: true, render: function (r) { return formatNumber(r.total_hours); } },
            { title: 'Стоимость, руб', num: true, render: function (r) { return formatNumber(r.total_cost); } }
        ], rows, 'Нет операций для расчёта');
    }).catch(function (e) { show('routeLabor', e); });

    // 4. калькуляция
    apiRequest('/api/technology/' + pid + '/cost/?quantity=' + q).then(function (c) {
        document.getElementById('routeCost').innerHTML = renderTable([
            { title: 'Материалы, руб', num: true, render: function (r) { return formatNumber(r.material_cost); } },
            { title: 'Труд, руб', num: true, render: function (r) { return formatNumber(r.labor_cost); } },
            { title: 'Итого, руб', num: true, render: function (r) { return formatNumber(r.total_cost); } },
            { title: 'Себестоимость единицы, руб', num: true, render: function (r) { return formatNumber(r.unit_cost); } }
        ], [c], '');
    }).catch(function (e) { show('routeCost', e); });
}

document.getElementById('routeCalcForm').addEventListener('submit', function (e) { e.preventDefault(); loadRouteCalc(); });
document.getElementById('routeQuantity').addEventListener('change', loadRouteCalc);

// Если страница открыта сразу на этой вкладке, а загрузчик зарегистрирован позже открытия вкладки
if (!document.getElementById('tab-route').hidden) {
    tabLoaders.route();
}