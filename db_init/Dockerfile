FROM python:3.11-slim

# Install Postgres client tools for database initialization
RUN apt-get update && \
    apt-get install -y postgresql-client gzip tzdata && \
    rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Create virtual environment and install dependencies with uv
RUN uv venv && \
    uv export --no-dev --frozen > requirements.txt && \
    uv pip install --python .venv/bin/python -r requirements.txt && \
    rm requirements.txt

# Copy db_init directory
COPY db_init ./db_init

# Copy backup/logging_config.py for consistent logging
COPY backup/logging_config.py ./backup/logging_config.py

# Make init script executable
RUN chmod +x /app/db_init/init_db_from_backup.py

# Run the initialization script using uv
WORKDIR /app/db_init
CMD ["uv", "run", "init_db_from_backup.py"]

