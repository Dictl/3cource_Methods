"""Подготовка БД при запуске: создать базу, накатить schema.sql, применить миграции Django.

Всё идемпотентно — на уже готовой базе ничего не делает.
"""
import psycopg2
from psycopg2 import sql
from django.conf import settings
from django.core.management import call_command
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder

SCHEMA_FILE = settings.BASE_DIR / 'schema.sql'
# Инкрементальные изменения схемы: патч применяется, если версия в базе ниже SCHEMA_VERSION
SCHEMA_PATCHES = {
    2: settings.BASE_DIR / 'schema_patch_v2.sql',
}
SCHEMA_VERSION = max(SCHEMA_PATCHES)
# Таблица из самой свежей части схемы: если её нет — схема не загружена или устарела
SCHEMA_MARKER_TABLE = 'bom_item'


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
    cur.execute('SELECT COALESCE(MAX(version), 0) FROM schema_version')
    return cur.fetchone()[0]


def ensure_schema():
    with connection.cursor() as cur:
        cur.execute('SELECT to_regclass(%s)', [f'public.{SCHEMA_MARKER_TABLE}'])
        if cur.fetchone()[0] is None:
            _log(f'Схема не найдена — загружаю {SCHEMA_FILE.name}')
            cur.execute(SCHEMA_FILE.read_text(encoding='utf-8'))
            _log('Схема загружена')
            return

        version = _schema_version(cur)
        if version >= SCHEMA_VERSION:
            return

        for target in sorted(SCHEMA_PATCHES):
            if version < target:
                patch_file = SCHEMA_PATCHES[target]
                _log(f'Версия схемы {version} < {target} — применяю {patch_file.name}')
                cur.execute(patch_file.read_text(encoding='utf-8'))
                version = target
        _log(f'Схема обновлена до версии {version}')


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
