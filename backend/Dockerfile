FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN pip install --no-cache-dir uv

# Copy dependency files from root
COPY pyproject.toml uv.lock ./

# Sync backend dependencies into /app/.venv
RUN uv sync --frozen --no-dev --extra backend

ENV PATH="/app/.venv/bin:$PATH"

# Copy application code from backend directory
COPY backend/app ./app

# External API documentation (served at GET /api/external/investments/docs
# and GET /api/external/budget-transactions/docs)
COPY docs/external-investments-api.md ./docs/external-investments-api.md
COPY docs/external-budget-transactions-api.md ./docs/external-budget-transactions-api.md

# Install Chromium for Playwright automation
RUN playwright install --with-deps chromium

# Copy Alembic migration files from backend directory
COPY backend/alembic.ini .
COPY backend/alembic ./alembic

# Migration script run by the control panel: bash /app/run_migrations.sh
COPY backend/run_migrations.sh /app/run_migrations.sh
RUN chmod +x /app/run_migrations.sh

# Expose port
EXPOSE 8000

# Run the application using uv
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
