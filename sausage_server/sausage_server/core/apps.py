from django.apps import AppConfig
from django.db import connection

class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'

    """def ready(self):
        with open('schema.sql', 'r',  encoding='utf-8') as f:
            sql = f.read()
        with connection.cursor() as cursor:
            cursor.execute(sql)"""
