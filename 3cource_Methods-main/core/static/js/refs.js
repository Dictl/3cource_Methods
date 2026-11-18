// Вкладка «Справочники»: единицы измерения, параметры, перечисления

var VALUE_TYPES = { str: 'Строка', int: 'Целое', real: 'Дробное', enum: 'Перечисление' };

function enumValueText(v) {
    if (v.value_str) return v.value_str;
    if (v.value_int !== null) return String(v.value_int);
    if (v.value_real !== null) return String(v.value_real);
    return '';
}

tabLoaders.refs = function () {
    Promise.all([
        apiRequest('/api/units/'),
        apiRequest('/api/unit-dimensions/'),
        apiRequest('/api/tree/'),
        apiRequest('/api/parameters/'),
        apiRequest('/api/enums/')
    ])
        .then(function (results) {
            var units = results[0];
            var dimensions = results[1];
            var nodes = results[2];
            var params = results[3];
            var enums = results[4];

            var classOptions = '<option value="">Класс</option>';
            nodes.forEach(function (n) {
                classOptions += '<option value="' + n.id + '">' + new Array(n.level + 1).join('   ') + escapeHtml(n.name) + '</option>';
            });
            document.getElementById('parameterClassSelect').innerHTML = classOptions;
            document.getElementById('enumClassSelect').innerHTML = classOptions;
            document.getElementById('parameterUnitSelect').innerHTML =
                units.map(function (u) { return '<option value="' + u.id + '">' + escapeHtml(u.symbol) + '</option>'; }).join('');
            document.getElementById('unitDimensionSelect').innerHTML =
                '<option value="">Размерность</option>' + dimensions.map(function (d) {
                    return '<option value="' + d.id + '">' + escapeHtml(d.name) + '</option>';
                }).join('');
            document.getElementById('enumDefinitionSelect').innerHTML = enums.map(function (e) {
                return '<option value="' + e.enum_definition.id + '">' + escapeHtml(e.enum_definition.description) + '</option>';
            }).join('');

            // словари id -> объект, чтобы показывать названия вместо id
            var nodeNames = {};
            nodes.forEach(function (n) { nodeNames[n.id] = n.name; });
            var unitSymbols = {};
            units.forEach(function (u) { unitSymbols[u.id] = u.symbol; });

            document.getElementById('unitsTable').innerHTML = renderTable([
                { title: 'Размерность', render: function (u) { return escapeHtml(u.dimension_name); } },
                { title: 'Название', render: function (u) {
                    return '<span class="unit-edit" data-id="' + u.id + '">'
                        + '<input class="unit-name" value="' + escapeHtml(u.name) + '"></span>';
                } },
                { title: 'Обозначение', render: function (u) {
                    return '<input class="unit-symbol" data-id="' + u.id + '" value="' + escapeHtml(u.symbol) + '">';
                } },
                // в API 0 приходит как null, поэтому подставляем значения по умолчанию
                { title: 'Коэффициент', num: true, render: function (u) {
                    return '<input class="unit-factor" data-id="' + u.id + '" type="number" step="any" value="' + (u.to_base_factor || 0) + '">';
                } },
                { title: 'Смещение', num: true, render: function (u) {
                    return '<input class="unit-offset" data-id="' + u.id + '" type="number" step="any" value="' + (u.to_base_offset || 0) + '">';
                } },
                { title: 'Действия', className: 'action-cell', render: function (u) {
                    return '<button type="button" class="unit-save" data-id="' + u.id + '">Сохранить</button>'
                        + '<button type="button" class="unit-delete danger" data-id="' + u.id + '">Удалить</button>';
                } }
            ], units, 'Единиц нет', 'refs-table');

            document.getElementById('paramsTable').innerHTML = renderTable([
                { title: 'Параметр', render: function (p) {
                    return '<span class="parameter-edit" data-id="' + p.id + '">'
                        + '<input class="parameter-name" value="' + escapeHtml(p.name) + '"></span>';
                } },
                { title: 'Категория', render: function (p) { return escapeHtml(nodeNames[p.classifier_node_id] || p.classifier_node_id); } },
                { title: 'Тип', render: function (p) {
                    return '<select class="parameter-type">'
                        + ['str', 'int', 'real', 'enum'].map(function (type) {
                            return '<option value="' + type + '"' + (p.value_type === type ? ' selected' : '') + '>'
                                + escapeHtml(VALUE_TYPES[type]) + '</option>';
                        }).join('')
                        + '</select>';
                } },
                { title: 'Ед. изм.', render: function (p) {
                    return '<select class="parameter-unit">'
                        + units.map(function (u) {
                            return '<option value="' + u.id + '"' + (String(p.unit_id) === String(u.id) ? ' selected' : '') + '>'
                                + escapeHtml(u.symbol) + '</option>';
                        }).join('')
                        + '</select>';
                } },
                { title: 'Действия', className: 'action-cell', render: function () {
                    return '<button type="button" class="parameter-save">Сохранить</button>'
                        + '<button type="button" class="parameter-delete danger">Удалить</button>';
                } }
            ], params, 'Параметров нет', 'refs-table');

            document.getElementById('enumsTable').innerHTML = renderTable([
                { title: 'Перечисление', render: function (e) {
                    return '<input class="enum-definition-name" data-id="' + e.enum_definition.id
                        + '" value="' + escapeHtml(e.enum_definition.description || '') + '">';
                } },
                { title: 'Категория', render: function (e) { return escapeHtml(nodeNames[e.enum_definition.classifier_node_id] || ''); } },
                {
                    title: 'Значения',
                    render: function (e) {
                        if (!e.values.length) {
                            return '<span class="muted">пусто</span>';
                        }
                        return e.values.map(function (v) {
                            var valueIndex = e.values.indexOf(v);
                            var isFirst = valueIndex === 0;
                            var isLast = valueIndex === e.values.length - 1;
                            return '<span class="enum-value-edit" data-id="' + v.id + '" data-enum-id="' + e.enum_definition.id + '">'
                                + '<input value="' + escapeHtml(enumValueText(v)) + '">'
                                + '<button type="button" class="enum-save">Сохранить</button>'
                                + '<button type="button" class="enum-value-delete danger">Удалить</button>'
                                + '<button type="button" class="enum-up"' + (isFirst ? ' disabled' : '') + '>↑</button>'
                                + '<button type="button" class="enum-down"' + (isLast ? ' disabled' : '') + '>↓</button></span>';
                        }).join('<br>');
                    }
                },
                { title: 'Действия', className: 'action-cell', render: function (e) {
                    return '<button type="button" class="enum-definition-save" data-id="' + e.enum_definition.id + '">Сохранить</button>'
                        + '<button type="button" class="enum-definition-delete danger" data-id="' + e.enum_definition.id + '">Удалить</button>';
                } }
            ], enums, 'Перечислений нет', 'refs-table');
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
};

// Запускаем после того, как все скрипты загружены
openTabFromHash();

document.getElementById('parameterDefinitionForm').addEventListener('submit', function (e) {
    e.preventDefault();
    apiRequest('/api/parameters/create/', 'POST', {
        classifier_node_id: document.getElementById('parameterClassSelect').value,
        name: document.getElementById('parameterName').value,
        value_type: document.getElementById('parameterType').value,
        unit_id: document.getElementById('parameterUnitSelect').value
    }).then(function () {
        showMessage('Параметр создан', 'success');
        tabLoaders.refs();
    }).catch(function (err) { showMessage(err.message, 'error'); });
});

document.getElementById('unitDefinitionForm').addEventListener('submit', function (e) {
    e.preventDefault();
    apiRequest('/api/units/create/', 'POST', {
        dimension_id: document.getElementById('unitDimensionSelect').value,
        name: document.getElementById('unitName').value,
        symbol: document.getElementById('unitSymbol').value,
        to_base_factor: document.getElementById('unitFactor').value,
        to_base_offset: document.getElementById('unitOffset').value
    }).then(function () {
        showMessage('Единица измерения создана', 'success');
        e.target.reset();
        document.getElementById('unitFactor').value = '1';
        document.getElementById('unitOffset').value = '0';
        tabLoaders.refs();
    }).catch(function (err) { showMessage(err.message, 'error'); });
});

document.getElementById('enumDefinitionForm').addEventListener('submit', function (e) {
    e.preventDefault();
    apiRequest('/api/enums/create/', 'POST', {
        classifier_node_id: document.getElementById('enumClassSelect').value,
        description: document.getElementById('enumDescription').value
    }).then(function () {
        showMessage('Перечисление создано', 'success');
        tabLoaders.refs();
    }).catch(function (err) { showMessage(err.message, 'error'); });
});

document.getElementById('enumValueForm').addEventListener('submit', function (e) {
    e.preventDefault();
    apiRequest('/api/enum-values/add/', 'POST', {
        enum_definition_id: document.getElementById('enumDefinitionSelect').value,
        value_str: document.getElementById('enumValue').value
    }).then(function () {
        showMessage('Значение добавлено', 'success');
        tabLoaders.refs();
    }).catch(function (err) { showMessage(err.message, 'error'); });
});

document.getElementById('enumsTable').addEventListener('click', function (e) {
    if (e.target.classList.contains('enum-definition-delete') || e.target.classList.contains('enum-delete')) {
        deleteReference('/api/enum-definitions/delete/', {
            enum_definition_id: e.target.getAttribute('data-id')
        }, 'перечисление');
        return;
    }
    if (e.target.classList.contains('enum-definition-save')) {
        var definitionId = e.target.getAttribute('data-id');
        var definitionInput = document.querySelector('.enum-definition-name[data-id="' + definitionId + '"]');
        apiRequest('/api/enums/update/', 'PUT', {
            enum_definition_id: definitionId,
            description: definitionInput.value
        }).then(function () {
            showMessage('Перечисление сохранено', 'success');
            tabLoaders.refs();
        }).catch(function (err) { showMessage(err.message, 'error'); });
        return;
    }
    var row = e.target.closest('.enum-value-edit');
    if (!row) return;
    var values = Array.prototype.slice.call(document.querySelectorAll('.enum-value-edit[data-enum-id="' + row.getAttribute('data-enum-id') + '"]'));
    var index = values.indexOf(row);
    var target = e.target.classList.contains('enum-up') ? values[index - 1] :
        e.target.classList.contains('enum-down') ? values[index + 1] : null;
    if (target) {
        apiRequest('/api/enum-values/reorder/', 'PUT', {
            enum_value_id: row.getAttribute('data-id'),
            target_position_id: target.getAttribute('data-id')
        }).then(function () { tabLoaders.refs(); });
        return;
    }
    if (e.target.classList.contains('enum-save')) {
        apiRequest('/api/enum-values/update/', 'PUT', {
            enum_value_id: row.getAttribute('data-id'),
            value_str: row.querySelector('input').value
        }).then(function () {
            showMessage('Значение перечисления сохранено', 'success');
            tabLoaders.refs();
        }).catch(function (err) { showMessage(err.message, 'error'); });
        return;
    }
    if (e.target.classList.contains('enum-value-delete')) {
        deleteReference('/api/enum-values/delete/', {
            enum_value_id: row.getAttribute('data-id')
        }, 'значение перечисления');
    }
});

document.getElementById('paramsTable').addEventListener('click', function (e) {
    var row = e.target.closest('.parameter-edit') || e.target.closest('tr').querySelector('.parameter-edit');
    if (e.target.classList.contains('parameter-delete')) {
        deleteReference('/api/parameters/' + row.getAttribute('data-id') + '/delete/', null, 'параметр');
        return;
    }
    if (!e.target.classList.contains('parameter-save')) return;
    if (!row) return;
    apiRequest('/api/parameters/update/', 'PUT', {
        parameter_definition_id: row.getAttribute('data-id'),
        name: row.querySelector('.parameter-name').value,
        value_type: row.querySelector('.parameter-type').value,
        unit_id: row.querySelector('.parameter-unit').value
    }).then(function () {
        showMessage('Параметр сохранён', 'success');
        tabLoaders.refs();
    }).catch(function (err) { showMessage(err.message, 'error'); });
});

function deleteReference(url, body, title) {
    if (!confirm('Удалить ' + title + '?')) return;
    apiRequest(url, 'DELETE', body === null ? undefined : body)
        .then(function () {
            showMessage('Удалено', 'delete');
            tabLoaders.refs();
        })
        .catch(function (err) { showMessage(err.message, 'error'); });
}

document.getElementById('unitsTable').addEventListener('click', function (e) {
    var id = e.target.getAttribute('data-id');
    if (e.target.classList.contains('unit-delete')) {
        deleteReference('/api/units/' + id + '/delete/', null, 'единицу измерения');
        return;
    }
    if (!e.target.classList.contains('unit-save')) return;
    var cell = e.target.closest('tr');
    apiRequest('/api/units/update/', 'PUT', {
        unit_id: id,
        name: cell.querySelector('.unit-name').value,
        symbol: cell.querySelector('.unit-symbol').value,
        to_base_factor: cell.querySelector('.unit-factor').value,
        to_base_offset: cell.querySelector('.unit-offset').value
    }).then(function () {
        showMessage('Единица измерения сохранена', 'success');
        tabLoaders.refs();
    }).catch(function (err) { showMessage(err.message, 'error'); });
});
