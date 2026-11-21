1. title: Маршрутные операции используют устаревшую одну норму времени
   description: В коде, ORM и схеме хранится только time_norm, тогда как отчёт заявляет setup_time (Тпз), piece_time (Тшт) и result_state. Создать или редактировать раздельные нормы через API невозможно, а расчёт трудоёмкости не может учитывать однократное подготовительно-заключительное время партии.
   severity: Error
   type: Bug
   location: core/service.py:1955-1980; schema.sql:1702-1715

2. title: Расчёт анализа технологичности не принимает размер партии
   description: find_route_deep вызывается только с product_id; API не читает quantity, а интерфейс не передаёт его в запрос. Поэтому таблица анализа всегда рассчитывает количество и трудоёмкость для одной единицы, даже если пользователь выбрал партию 1000.
   severity: Error
   type: Bug
   location: core/service.py:2130-2133; core/api_views.py:2045-2050; core/static/js/route.js:451-462

3. title: В проекте отсутствует расчёт норм материалов маршрута
   description: В задании требуется сводный расход материальных ресурсов по технологическому маршруту и расход для операции. В schema.sql нет функций sum_mr/mr_q и в service.py нет их вызовов; имеющийся calc_bom считает только конструкторскую спецификацию, а не route_operation_material.
   severity: Error
   type: Bug
   location: schema.sql:2078-2089; core/service.py:1345-1364

4. title: Интерфейс показывает BOM вместо расхода материалов маршрута
   description: Блок, расположенный рядом с расчётами маршрута, запрашивает /api/bom/<id>/calc/, то есть сводный состав изделия. Он не использует материалы операций маршрута и не соответствует требованию расчёта норм по технологическому процессу.
   severity: Error
   type: Bug
   location: core/static/js/route.js:478-487

5. title: Поиск компонентов без маршрута заявлен в отчёте, но не реализован
   description: Отчёт описывает функцию find_no_route и endpoint /technology/<product_id>/no-route/. В репозитории нет функции БД, сервисного метода или URL для этого сценария; реализован только find_route_deep, который молча исключает компоненты без маршрута через JOIN.
   severity: Error
   type: Bug
   location: core/service.py:2130-2133; schema.sql:1988-2059; core/urls_api.py:109-135

6. title: Состояния изделия и входные операции не хранятся
   description: Отчёт утверждает, что result_state и source_operation_id позволяют моделировать полуфабрикаты внутри одного маршрута. В текущих таблице route_operation и route_operation_material этих полей нет, ORM их также не описывает, поэтому заявленная модель изменения состояния не поддерживается.
   severity: Warning
   type: Design
   location: schema.sql:1702-1735; core/models.py:242-286

7. title: Расчёт трудоёмкости не учитывает подготовительное время
   description: calc_labor суммирует часы из find_route_deep и умножает их на размер партии. Поскольку find_route_deep использует только time_norm, стоимость и трудоёмкость партии считаются строго пропорционально количеству, вопреки формуле Tпз + Tшт·Q, приведённой в отчёте.
   severity: Error
   type: Bug
   location: schema.sql:2042-2048; schema.sql:2061-2076

8. title: Заявленные автоматические тесты отсутствуют
   description: Отчёт утверждает, что Django-тесты проверяют расчёты и триггеры, но core/tests.py содержит только три строки и не содержит ни одного тестового класса или метода. Проверить заявленные эталонные результаты командой manage.py test невозможно.
   severity: Warning
   type: Test
   location: core/tests.py:1-3
