FROM python:3.11-slim

# Install Postgres client tools for pg_dump and timezone data
RUN apt-get update && \
    apt-get install -y postgresql-client gzip tzdata && \
    rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install dependencies
RUN uv export --no-dev --frozen > requirements.txt && \
    uv pip install --system -r requirements.txt

# Copy backup scripts
COPY backup ./backup

# Run the backup scheduler
WORKDIR /app/backup
CMD ["python", "backup_script.py"]

