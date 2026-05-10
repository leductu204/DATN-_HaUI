@echo off
setlocal

cd /d "%~dp0"

if not exist .venv\Scripts\python.exe (
    echo [run_dev] ERROR: .venv not found. First-time setup:
    echo     python -m venv .venv
    echo     .venv\Scripts\pip install -r requirements.txt
    exit /b 1
)

echo [run_dev] applying alembic migrations...
.venv\Scripts\python.exe -m alembic upgrade head
if errorlevel 1 (
    echo [run_dev] ERROR: alembic upgrade failed
    exit /b 1
)

echo.
echo [run_dev] starting uvicorn on http://127.0.0.1:8000
echo [run_dev] docs: http://127.0.0.1:8000/docs
echo [run_dev] press Ctrl+C to stop
echo.
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
