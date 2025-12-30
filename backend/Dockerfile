FROM python:3.11-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy dependency files from root
COPY pyproject.toml uv.lock ./

# Export dependencies to requirements.txt and install them
RUN uv export --extra backend --no-dev --frozen > requirements.txt && \
    uv pip install --system -r requirements.txt

# Copy application code from backend directory
COPY backend/app ./app

# Copy Alembic migration files from backend directory
COPY backend/alembic.ini .
COPY backend/alembic ./alembic
COPY backend/run_migrations.sh .
RUN chmod +x run_migrations.sh

# Expose port
EXPOSE 8000

# Run the application using uv
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
