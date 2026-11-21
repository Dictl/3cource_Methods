# Пропущенное поведение: репозиторий, задание №6 и отчёт

- title: Не реализован расчёт норм материалов для одной операции
  description: PDF, с. 21, требует `MR_Q(pIdTO,pQ)`. `route_operation_material` хранит норму и её базу, но в блоке расчётных функций нет аналога `MR_Q`; URL `route-operations/<id>/materials-norm/` из таблицы 8 DOCX не зарегистрирован, есть только запись/изменение/удаление исходных норм.
  severity: Error
  type: Bug
  location: {file_path: core/urls_api.py, start_line_one_based: 127, end_line_one_based: 133}

- title: Сводный расход берётся из BOM, а не из норм операций
  description: PDF, с. 3 и 21, требует сводных норм материалов по техпроцессу (`SUM_MR`); пользовательский блок материалов вызывает обычный `/api/bom/<id>/calc/`, а `sum_mr` в схеме и `/technology/<id>/materials/` из DOCX отсутствуют. Изменение материалов операции не меняет показанные сводные нормы (запись `RouteOperationMaterial` в `core/service.py:2109–2121` и чтение BOM в `schema.sql:1036–1076`).
  severity: Error
  type: Bug
  location: {file_path: core/static/js/route.js, start_line_one_based: 478, end_line_one_based: 487}

- title: Материальная часть себестоимости не учитывает нормы маршрута
  description: `calc_cost` складывает труд из `calc_labor` и материалы из `calc_bom`, а не `sum_mr`, как заявлено в DOCX и требуется для калькуляции по техпроцессу. Материальная стоимость не реагирует на изменение нормы операции при неизменном BOM.
  severity: Error
  type: Bug
  location: {file_path: schema.sql, start_line_one_based: 2079, end_line_one_based: 2089}

- title: Оператор видит выбранную версию, а расчёты используют последнюю
  description: `find_route_deep` — рабочий аналог `FIND_TM(pIdEl)` для последней версии с обходом BOM, но не принимает `quantity` и `route_no` из заявленного контракта DOCX (`core/api_views.py:2045–2052`). Выбранная версия меняет карточку (`core/static/js/route.js:274–276`), тогда как анализ, труд и себестоимость по-прежнему опираются на маршрут с максимальным `route_no`; в UI анализ помечен как анализ последней версии (`templates/home.html:155–157`), так что это не отсутствие базового `FIND_TM`.
  severity: WeakWarning
  type: Documentation
  location: {file_path: schema.sql, start_line_one_based: 1989, end_line_one_based: 2025}

- title: Операции полуфабриката, заданного только как ресурс операции, не входят в обход
  description: `find_route_deep` наполняет список изделиями только из `find_bom`, без `route_operation_material`; SQL и API позволяют независимо задать полуфабрикат как ресурс операции. Например, для посевных `ПК-01.003` и `ПК-01.001` расходуется `ПФ-01.001` (`schema.sql:1924–1929`), но в начальном BOM такие связи не заданы (`schema.sql:1150–1176`); его труд в анализ и калькуляцию не попадёт.
  severity: Warning
  type: Bug
  location: {file_path: schema.sql, start_line_one_based: 2009, end_line_one_based: 2025}

- title: Поиск изготавливаемых компонентов без маршрута есть только в отчёте
  description: В исходниках нет `find_no_route` и `/technology/<id>/no-route/`, перечисленных в §4.1 и таблицах 4 и 8 DOCX; `find_route_deep` внутренними `JOIN` просто отбрасывает позиции без операций (`schema.sql:2049–2052`). Такой поиск — отдельная проверка полноты данных: показать компоненты на любой глубине BOM, для которых предполагается собственное изготовление, но не завели маршрут; покупные ресурсы не считаются пропуском. Явное требование PDF — искать имеющиеся строки маршрута, а не отдельно выводить отсутствующие маршруты.
  severity: WeakWarning
  type: Documentation
  location: {file_path: core/urls_api.py, start_line_one_based: 127, end_line_one_based: 133}

- title: В схеме нет заявленных состояний и связи с операцией-источником
  description: В `route_operation` нет `result_state`, а в `route_operation_material` нет `source_operation_id`, заявленных в §§2–3 DOCX. Позиция № задаёт порядок, но ресурсы ссылаются только на готовое изделие, не на результат конкретной предыдущей операции (вариант 2 модели PDF, с. 11–13); `core/service.py:2078–2086` даже запрещает использовать изделие данного маршрута как каталоговый ресурс собственной операции.
  severity: Warning
  type: Design
  location: {file_path: schema.sql, start_line_one_based: 1702, end_line_one_based: 1735}

- title: Отчёт описывает раздельные нормы времени, но код хранит только штучную
  description: В таблице `route_operation` только `time_norm` на единицу изделия; `find_route_deep` и `calc_labor` используют линейный пересчёт без постоянного слагаемого (`schema.sql:2042–2048,2062–2075`). `Тпз` упоминается в моделях PDF (с. 8, 9, 11–12, 14), но не выделен как обязательное отдельное поле в перечне ключевых требований (с. 3) и описании `TR_TO` (с. 21), поэтому отдельно надо отличать отсутствие заявленной в DOCX реализации от базового требования на расчёт трудоёмкости.
  severity: WeakWarning
  type: Documentation
  location: {file_path: schema.sql, start_line_one_based: 1702, end_line_one_based: 1715}

- title: Патчи схемы до версии 8 не поставляются и не применяются
  description: DOCX §§3–4 заявляет `schema_patch_v2`…`schema_patch_v8` и инкрементальное обновление. Файлов патчей нет, `bootstrap` принимает имеющуюся v5/v6 без изменений, несовместимую схему отклоняет, а чистая установка маркируется v6 (`schema.sql:2091–2096`).
  severity: Warning
  type: Documentation
  location: {file_path: core/bootstrap.py, start_line_one_based: 43, end_line_one_based: 65}

- title: Заявленные автоматические проверки отсутствуют в исходниках
  description: DOCX §4 заявляет Django-тесты расчётных функций, а §5 и приложение А — Postman/Newman. `core/tests.py` содержит только шаблон, `postman/route_api_tests.json` отсутствует, в самом отчёте вместо листинга и результатов стоят текстовые заглушки.
  severity: Warning
  type: Documentation
  location: {file_path: core/tests.py, start_line_one_based: 1, end_line_one_based: 3}

- title: Формы изменения маршрута отображаются клиентам
  description: В §5 DOCX сказано «Элементы изменения данных доступны только администратору», но разметка вкладки содержит кнопки сохранения/создания/удаления и форму операции без проверки роли. Это расхождение интерфейса, не обход прав: `core/middleware.py:13–29,32–48` требует вход и запрещает изменяющие API-запросы без `is_staff`.
  severity: WeakWarning
  type: Documentation
  location: {file_path: templates/home.html, start_line_one_based: 129, end_line_one_based: 152}
