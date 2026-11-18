import os

from django.contrib.staticfiles.management.commands.runserver import Command as StaticRunserver

from core.bootstrap import bootstrap


class Command(StaticRunserver):
    help = 'Запускает dev-сервер, предварительно подготовив БД (база, schema.sql, миграции).'

    def handle(self, *args, **options):
        # С автоперезагрузкой handle() вызывается дважды — готовим БД только в родительском процессе
        if os.environ.get('RUN_MAIN') != 'true':
            bootstrap()
        super().handle(*args, **options)
