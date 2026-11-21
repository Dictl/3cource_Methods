1. Добавить и активировать .venv
2. Установить зависимости из requirements.txt
3. Создать файл .env в корне проекта
Вот шаблон для .env:
```
DATABASE_NAME="имя базы данных"
DATABASE_USER=postgres
DATABASE_PASSWORD="пароль"
DATABASE_HOST=localhost
DATABASE_PORT=5432
SECRET_KEY = os.getenv('сгенерированный секретный ключ')
```
Как сгенерировать ключ(для Linux): 
```
python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```
4. Запустить сервер:
```
python manage.py runserver
```
При первом запуске сервер поднимет базу и загрузит единый `schema.sql` с начальными данными, затем применит миграции Django. Обычный перезапуск сохраняет данные.

5. Чтобы зайти с правами администратора, после подготовки базы выполнить:
```
python manage.py createsuperuser
```

Для чистого сброса **только локальной базы** остановите сервер и выполните в `psql`, подключённом к базе из `DATABASE_NAME`:
```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```
Это удалит все данные схемы `public`, включая пользователей Django. Следующий `python manage.py runserver` восстановит схему и начальные данные.