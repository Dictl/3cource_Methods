// Вкладка «Справочники»: единицы измерения, параметры, перечисления (только просмотр)

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
        apiRequest('/api/tree/'),
        apiRequest('/api/parameters/'),
        apiRequest('/api/enums/')
    ])
        .then(function (results) {
            var units = results[0];
            var nodes = results[1];
            var params = results[2];
            var enums = results[3];

            // словари id -> объект, чтобы показывать названия вместо id
            var nodeNames = {};
            nodes.forEach(function (n) { nodeNames[n.id] = n.name; });
            var unitSymbols = {};
            units.forEach(function (u) { unitSymbols[u.id] = u.symbol; });

            document.getElementById('unitsTable').innerHTML = renderTable([
                { title: 'Размерность', render: function (u) { return escapeHtml(u.dimension_name); } },
                { title: 'Название', render: function (u) { return escapeHtml(u.name); } },
                { title: 'Обозначение', render: function (u) { return escapeHtml(u.symbol); } },
                // в API 0 приходит как null, поэтому подставляем значения по умолчанию
                { title: 'Коэффициент', num: true, render: function (u) { return formatNumber(u.to_base_factor === null ? 0 : u.to_base_factor); } },
                { title: 'Смещение', num: true, render: function (u) { return formatNumber(u.to_base_offset === null ? 0 : u.to_base_offset); } }
            ], units, 'Единиц нет');

            document.getElementById('paramsTable').innerHTML = renderTable([
                { title: 'Параметр', render: function (p) { return escapeHtml(p.name); } },
                { title: 'Категория', render: function (p) { return escapeHtml(nodeNames[p.classifier_node_id] || p.classifier_node_id); } },
                { title: 'Тип', render: function (p) { return VALUE_TYPES[p.value_type] || escapeHtml(p.value_type); } },
                { title: 'Ед. изм.', render: function (p) { return escapeHtml(unitSymbols[p.unit_id] || '—'); } }
            ], params, 'Параметров нет');

            document.getElementById('enumsTable').innerHTML = renderTable([
                { title: 'Перечисление', render: function (e) { return escapeHtml(e.enum_definition.description || '—'); } },
                { title: 'Категория', render: function (e) { return escapeHtml(nodeNames[e.enum_definition.classifier_node_id] || ''); } },
                {
                    title: 'Значения',
                    render: function (e) {
                        if (!e.values.length) return '<span class="muted">пусто</span>';
                        return e.values.map(function (v) { return escapeHtml(enumValueText(v)); }).join(', ');
                    }
                }
            ], enums, 'Перечислений нет');
        })
        .catch(function (err) {
            showMessage(err.message, 'error');
        });
};

// Запускаем после того, как все скрипты загружены
openTabFromHash();
