# 3cource_methods-main Frontend

This project uses Django templates and vanilla JavaScript for the UI.

## Quick start

1. Install dependencies from `requirements.txt`.
2. Run the Django server.
3. Open the home page in your browser.

Example commands (PowerShell):

```powershell
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

## Auth pages

- `http://localhost:8000/login/` for sign-in.
- `http://localhost:8000/register/` for sign-up.
- `http://localhost:8000/` requires authentication and shows the main UI.

## Frontend smoke test

A tiny local check validates that the main template and assets contain required IDs.

```powershell
python scripts\frontend_smoke_test.py
```

## Notes

- The UI is implemented in `templates\home.html`.
- Styles are in `core\static\css\home.css`.
- Behavior is in `core\static\js\home.js`.
