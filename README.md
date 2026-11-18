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
4. Чтобы залогиниться нужно создать superuser:
```
python manage.py createsuperuser
```