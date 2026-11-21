"""Подготовка БД при запуске: создать базу, накатить schema.sql, применить миграции Django.

Готовую схему не перезаписывает; несовместимую локальную схему нужно пересоздать.
"""
import psycopg2
from psycopg2 import sql
from django.conf import settings
from django.core.management import call_command
from django.db import connection, transaction
from django.db.migrations.recorder import MigrationRecorder

SCHEMA_FILE = settings.BASE_DIR / 'schema.sql'
# Схема v5 уже содержала функции v6, а патч v6 не менял отметку версии.
COMPATIBLE_SCHEMA_VERSIONS = {5, 6, 7}


def _log(msg):
    print(f'[bootstrap] {msg}', flush=True)


def ensure_database():
    db = settings.DATABASES['default']
    name = db['NAME']
    if not name:
        raise RuntimeError('DATABASE_NAME не задан в .env')

    conn = psycopg2.connect(
        dbname='postgres', user=db['USER'], password=db['PASSWORD'],
        host=db['HOST'] or None, port=db['PORT'] or None,
    )
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT 1 FROM pg_database WHERE datname = %s', [name])
            if cur.fetchone():
                return
            _log(f'База «{name}» не найдена — создаю')
            cur.execute(sql.SQL('CREATE DATABASE {} ENCODING \'UTF8\'').format(sql.Identifier(name)))
    finally:
        conn.close()


def _schema_version(cur):
    cur.execute('SELECT to_regclass(%s)', ['public.schema_version'])
    if cur.fetchone()[0] is None:
        return 0
    cur.execute('SELECT COALESCE(MAX(version), 0) FROM public.schema_version')
    return cur.fetchone()[0]


def ensure_schema():
    with transaction.atomic(), connection.cursor() as cur:
        cur.execute("SELECT to_regclass('public.bom_item')")
        if cur.fetchone()[0] is not None:
            version = _schema_version(cur)
            if version not in COMPATIBLE_SCHEMA_VERSIONS:
                raise RuntimeError(
                    f'Схема версии {version} несовместима с {SCHEMA_FILE.name}. '
                    'Для локальной БД см. инструкцию по пересозданию схемы в README.md.'
                )
            if version < 7:
                schema = SCHEMA_FILE.read_text(encoding='utf-8')
                functions = schema.split('-- ROUTE_MATERIAL_FUNCTIONS_BEGIN', 1)[1].split('-- ROUTE_MATERIAL_FUNCTIONS_END', 1)[0]
                cur.execute(functions)
                cur.execute('UPDATE schema_version SET version = 7')
            return

        _log(f'Схема не найдена — загружаю {SCHEMA_FILE.name}')
        cur.execute(SCHEMA_FILE.read_text(encoding='utf-8'))
    _log('Схема загружена')


def ensure_migrations():
    # Таблицы core создаёт schema.sql, поэтому миграции core только помечаем применёнными
    recorder = MigrationRecorder(connection)
    core_applied = recorder.has_table() and recorder.migration_qs.filter(app='core').exists()
    if not core_applied:
        _log('Помечаю миграции core как применённые (--fake)')
        call_command('migrate', 'core', fake=True, verbosity=0)
    call_command('migrate', verbosity=0)


def bootstrap():
    ensure_database()
    ensure_schema()
    ensure_migrations()
