// Общие функции для всех вкладок

var messageBox = document.getElementById('messageBox');

// Названия типов изделий (таблица product_type)
var PRODUCT_TYPES = {
    material: 'Материал',
    purchased: 'Покупное изделие',
    part: 'Деталь',
    assembly: 'Сборочная единица',
    kit: 'Комплект',
    complex: 'Комплекс'
};

function productTypeName(code) {
    return PRODUCT_TYPES[code] || code || '—';
}

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Число без лишних нулей: 0.440000 -> 0,44
function formatNumber(value) {
    if (value === null || value === undefined || value === '') return '—';
    var n = Number(value);
    if (isNaN(n)) return escapeHtml(value);
    return n.toLocaleString('ru-RU', { maximumFractionDigits: 4 });
}

function showMessage(text, type) {
    var cls = type === 'error' ? 'error' : 'success';
    messageBox.innerHTML = '<p class="' + cls + '">' + escapeHtml(text) + '</p>';
    window.scrollTo(0, 0);
}

function clearMessage() {
    messageBox.innerHTML = '';
}

function getCookie(name) {
    var cookies = document.cookie ? document.cookie.split(';') : [];
    for (var i = 0; i < cookies.length; i++) {
        var cookie = cookies[i].trim();
        if (cookie.substring(0, name.length + 1) === name + '=') {
            return decodeURIComponent(cookie.substring(name.length + 1));
        }
    }
    return null;
}

// Запрос к API. Сервер отвечает {ok: true, data: ...} или {ok: false, error: "..."}
function apiRequest(url, method, body) {
    var opts = { method: method || 'GET', headers: {} };
    if (opts.method !== 'GET') {
        opts.headers['X-CSRFToken'] = getCookie('csrftoken');
    }
    if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }

    return fetch(url, opts)
        .then(function (res) {
            return res.json().catch(function () {
                throw new Error('Сервер вернул ошибку ' + res.status);
            });
        })
        .then(function (data) {
            if (data.ok) return data.data;
            throw new Error(data.error || 'Ошибка API');
        });
}

// Простая таблица: columns = [{title: 'Название', render: function(row) {...}, num: true}]
function renderTable(columns, rows, emptyText) {
    if (!rows || !rows.length) {
        return '<p class="muted">' + (emptyText || 'Нет данных') + '</p>';
    }

    var html = '<div class="table-wrap"><table><thead><tr>';
    columns.forEach(function (col) {
        html += '<th>' + col.title + '</th>';
    });
    html += '</tr></thead><tbody>';

    rows.forEach(function (row) {
        html += '<tr>';
        columns.forEach(function (col) {
            html += '<td' + (col.num ? ' class="num"' : '') + '>' + col.render(row) + '</td>';
        });
        html += '</tr>';
    });

    html += '</tbody></table></div>';
    return html;
}

// ---------- Вкладки ----------

var tabLoaders = {}; // каждая вкладка может зарегистрировать функцию загрузки

function showTab(name) {
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].hidden = tabs[i].id !== 'tab-' + name;
    }
    var buttons = document.querySelectorAll('.tab-btn');
    for (var j = 0; j < buttons.length; j++) {
        buttons[j].classList.toggle('active', buttons[j].getAttribute('data-tab') === name);
    }
    clearMessage();
    if (tabLoaders[name]) tabLoaders[name]();
}

document.querySelector('.tabs').addEventListener('click', function (e) {
    var btn = e.target.closest('.tab-btn');
    if (!btn) return;
    location.hash = btn.getAttribute('data-tab');
});

// Адрес вида #bom/15 открывает вкладку bom и изделие 15
window.addEventListener('hashchange', openTabFromHash);

function openTabFromHash() {
    var parts = location.hash.replace('#', '').split('/');
    var tab = document.getElementById('tab-' + parts[0]) ? parts[0] : 'catalog';
    showTab(tab);
    if (tab === 'bom' && parts[1]) {
        selectBomProduct(parseInt(parts[1], 10));
    }
}
