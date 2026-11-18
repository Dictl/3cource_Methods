// Вкладка «Справочники»: справочники техпроцесса
// (классы операций, группы рабочих центров, профессии, инструмент и оснастка)

var TOOLING_TYPES = { tool: 'Инструмент', fixture: 'Оснастка' };

// id узла и всех его потомков: их нельзя выбирать родителем этого узла
function treeDescendantIds(nodes, id) {
    var ids = {};
    ids[id] = true;
    var changed = true;
    while (changed) {
        changed = false;
        nodes.forEach(function (n) {
            if (n.parent_id !== null && ids[n.parent_id] && !ids[n.id]) {
                ids[n.id] = true;
                changed = true;
            }
        });
    }
    return ids;
}

// Варианты выбора родителя с отступом по уровню вложенности
function treeOptions(nodes, selectedId, excludeIds, rootLabel) {
    var html = '<option value="">' + rootLabel + '</option>';
    nodes.forEach(function (n) {
        if (excludeIds && excludeIds[n.id]) return;
        html += '<option value="' + n.id + '"' + (String(selectedId) === String(n.id) ? ' selected' : '') + '>'
            + new Array(n.level + 1).join('\u00A0\u00A0\u00A0') + escapeHtml(n.name) + '</option>';
    });
    return html;
}

// Таблица дерева (классы операций и ГРЦ): название, родитель, действия
function renderTreeTable(nodes, prefix, emptyText) {
    return renderTable([
        { title: 'Название', render: function (n) {
            return '<span style="display:inline-block;width:' + (n.level * 16) + 'px"></span>'
                + '<input class="' + prefix + '-name" value="' + escapeHtml(n.name) + '">';
        } },
        { title: 'Родитель', render: function (n) {
            return '<select class="' + prefix + '-parent">'
                + treeOptions(nodes, n.parent_id, treeDescendantIds(nodes, n.id), '— Корень —')
                + '</select>';
        } },
        { title: 'Действия', className: 'action-cell', render: function (n) {
            return '<button type="button" class="' + prefix + '-save" data-id="' + n.id + '">Сохранить</button>'
                + '<button type="button" class="' + prefix + '-delete danger" data-id="' + n.id + '">Удалить</button>';
        } }
    ], nodes, emptyText, 'refs-table');
}

function loadProcessRefs() {
    Promise.all([
        apiRequest('/api/operation-classes/'),
        apiRequest('/api/work-center-groups/'),
        apiRequest('/api/professions/'),
        apiRequest('/api/tooling/')
    ])
        .then(function (results) {
            var operationClasses = results[0];
            var workCenters = results[1];
            var professions = results[2];
            var tooling = results[3];

            document.getElementById('operationClassParentSelect').innerHTML =
                treeOptions(operationClasses, null, null, 'Родитель (необязательно)');
            document.getElementById('workCenterParentSelect').innerHTML =
                treeOptions(workCenters, null, null, 'Родитель (необязательно)');

            document.getElementById('operationClassesTable').innerHTML =
                renderTreeTable(operationClasses, 'opclass', 'Классов операций нет');
            document.getElementById('workCentersTable').innerHTML =
                renderTreeTable(workCenters, 'workcenter', 'Групп рабочих центров нет');

            document.getElementById('professionsTable').innerHTML = renderTable([
                { title: 'Профессия', render: function (p) {
                    return '<input class="profession-name" value="' + escapeHtml(p.name) + '">';
                } },
                { title: 'Разряд', num: true, render: function (p) {
                    return '<input class="profession-grade" type="number" min="1" max="8" step="1" value="' + p.grade + '">';
                } },
                { title: 'Ставка, руб/ч', num: true, render: function (p) {
                    return '<input class="profession-rate" type="number" min="0" step="any" value="' + p.hourly_rate + '">';
                } },
                { title: 'Действия', className: 'action-cell', render: function (p) {
                    return '<button type="button" class="profession-save" data-id="' + p.id + '">Сохранить</button>'
                        + '<button type="button" class="profession-delete danger" data-id="' + p.id + '">Удалить</button>';
                } }
            ], professions, 'Профессий нет', 'refs-table');

            document.getElementById('toolingTable').innerHTML = renderTable([
                { title: 'Обозначение', render: function (t) {
                    return '<input class="tooling-designation" value="' + escapeHtml(t.designation) + '">';
                } },
                { title: 'Название', render: function (t) {
                    return '<input class="tooling-name" value="' + escapeHtml(t.name) + '">';
                } },
                { title: 'Вид', render: function (t) {
                    return '<select class="tooling-type">'
                        + ['tool', 'fixture'].map(function (type) {
                            return '<option value="' + type + '"' + (t.tooling_type === type ? ' selected' : '') + '>'
                                + escapeHtml(TOOLING_TYPES[type]) + '</option>';
                        }).join('')
                        + '</select>';
                } },
                { title: 'Действия', className: 'action-cell', render: function (t) {
                    return '<button type="button" class="tooling-save" data-id="' + t.id + '">Сохранить</button>'
                        + '<button type="button" class="tooling-delete danger" data-id="' + t.id + '">Удалить</button>';
                } }
            ], tooling, 'Инструмента нет', 'refs-table');
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
}

// Новые справочники загружаются вместе со старыми: оборачиваем загрузчик вкладки.
// Существующие кнопки вызывают tabLoaders.refs() после правок, поэтому таблицы обновятся и после них.
var baseRefsLoader = tabLoaders.refs;
tabLoaders.refs = function () {
    baseRefsLoader();
    loadProcessRefs();
};

// Если страница открыта сразу на вкладке «Справочники», загрузчик уже отработал до обёртки
if (!document.getElementById('tab-refs').hidden) {
    loadProcessRefs();
}

// ---------- формы добавления ----------

document.getElementById('operationClassForm').addEventListener('submit', function (e) {
    e.preventDefault();
    apiRequest('/api/operation-classes/create/', 'POST', {
        name: document.getElementById('operationClassName').value,
        parent_id: document.getElementById('operationClassParentSelect').value
    }).then(function () {
        showMessage('Класс операций создан', 'success');
        e.target.reset();
        tabLoaders.refs();
    }).catch(function (err) { showMessage(err.message, 'error'); });
});

document.getElementById('workCenterForm').addEventListener('submit', function (e) {
    e.preventDefault();
    apiRequest('/api/work-center-groups/create/', 'POST', {
        name: document.getElementById('workCenterName').value,
        parent_id: document.getElementById('workCenterParentSelect').value
    }).then(function () {
        showMessage('Группа рабочих центров создана', 'success');
        e.target.reset();
        tabLoaders.refs();
    }).catch(function (err) { showMessage(err.message, 'error'); });
});

document.getElementById('professionForm').addEventListener('submit', function (e) {
    e.preventDefault();
    apiRequest('/api/professions/create/', 'POST', {
        name: document.getElementById('professionName').value,
        grade: document.getElementById('professionGrade').value,
        hourly_rate: document.getElementById('professionRate').value
    }).then(function () {
        showMessage('Профессия создана', 'success');
        e.target.reset();
        document.getElementById('professionGrade').value = '3';
        document.getElementById('professionRate').value = '300';
        tabLoaders.refs();
    }).catch(function (err) { showMessage(err.message, 'error'); });
});

document.getElementById('toolingForm').addEventListener('submit', function (e) {
    e.preventDefault();
    apiRequest('/api/tooling/create/', 'POST', {
        designation: document.getElementById('toolingDesignation').value,
        name: document.getElementById('toolingName').value,
        tooling_type: document.getElementById('toolingType').value
    }).then(function () {
        showMessage('Инструмент создан', 'success');
        e.target.reset();
        tabLoaders.refs();
    }).catch(function (err) { showMessage(err.message, 'error'); });
});

// ---------- сохранение и удаление в таблицах ----------

// Общий обработчик для двух деревьев: классы операций и ГРЦ
function bindTreeTable(tableId, prefix, apiPath, idKey, title) {
    document.getElementById(tableId).addEventListener('click', function (e) {
        var id = e.target.getAttribute('data-id');
        if (e.target.classList.contains(prefix + '-delete')) {
            deleteReference(apiPath + id + '/delete/', null, title);
            return;
        }
        if (!e.target.classList.contains(prefix + '-save')) return;
        var row = e.target.closest('tr');
        var body = {
            name: row.querySelector('.' + prefix + '-name').value,
            parent_id: row.querySelector('.' + prefix + '-parent').value
        };
        body[idKey] = id;
        apiRequest(apiPath + 'update/', 'PUT', body).then(function () {
            showMessage('Сохранено', 'success');
            tabLoaders.refs();
        }).catch(function (err) { showMessage(err.message, 'error'); });
    });
}

bindTreeTable('operationClassesTable', 'opclass', '/api/operation-classes/', 'operation_class_id', 'класс операций');
bindTreeTable('workCentersTable', 'workcenter', '/api/work-center-groups/', 'work_center_group_id', 'группу рабочих центров');

document.getElementById('professionsTable').addEventListener('click', function (e) {
    var id = e.target.getAttribute('data-id');
    if (e.target.classList.contains('profession-delete')) {
        deleteReference('/api/professions/' + id + '/delete/', null, 'профессию');
        return;
    }
    if (!e.target.classList.contains('profession-save')) return;
    var row = e.target.closest('tr');
    apiRequest('/api/professions/update/', 'PUT', {
        profession_id: id,
        name: row.querySelector('.profession-name').value,
        grade: row.querySelector('.profession-grade').value,
        hourly_rate: row.querySelector('.profession-rate').value
    }).then(function () {
        showMessage('Профессия сохранена', 'success');
        tabLoaders.refs();
    }).catch(function (err) { showMessage(err.message, 'error'); });
});

document.getElementById('toolingTable').addEventListener('click', function (e) {
    var id = e.target.getAttribute('data-id');
    if (e.target.classList.contains('tooling-delete')) {
        deleteReference('/api/tooling/' + id + '/delete/', null, 'инструмент');
        return;
    }
    if (!e.target.classList.contains('tooling-save')) return;
    var row = e.target.closest('tr');
    apiRequest('/api/tooling/update/', 'PUT', {
        tooling_id: id,
        designation: row.querySelector('.tooling-designation').value,
        name: row.querySelector('.tooling-name').value,
        tooling_type: row.querySelector('.tooling-type').value
    }).then(function () {
        showMessage('Инструмент сохранён', 'success');
        tabLoaders.refs();
    }).catch(function (err) { showMessage(err.message, 'error'); });
});