# Deployment

## Local development

```bash
cp .env.example .env
# Set JWT_SECRET_KEY (and ENCRYPTION_KEY if you store API keys on users).

docker compose -f docker-compose.dev.yml up --build
docker compose -f docker-compose.dev.yml exec backend uv run alembic upgrade head
```

Open the frontend at http://localhost:3000 (Vite dev server). API docs: http://localhost:8000/docs. The MCP server listens on `127.0.0.1:${MCP_PORT:-8004}` (`/mcp`). Postgres is published on the host at `${POSTGRES_PORT:-5432}` for inspection.

## Standalone

Run BudgetHQ without the VPS control panel or shared `postgres-net`:

```bash
cp .env.example .env
docker compose -f docker-compose.standalone.yml up --build -d
docker compose -f docker-compose.standalone.yml run --rm --no-deps backend bash /app/run_migrations.sh
```

Open http://localhost:3000. The backend listens on `127.0.0.1:${BACKEND_PORT:-8000}` for `/docs`. The MCP server listens on `127.0.0.1:${MCP_PORT:-8004}`. Postgres runs in Compose only (no host port).

**Updates:** `docker compose -f docker-compose.standalone.yml up --build -d`

**Logs:** `docker compose -f docker-compose.standalone.yml logs -f`

**Database dump:** `docker compose -f docker-compose.standalone.yml exec postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup.sql`

**Restore:** pipe SQL into `docker compose -f docker-compose.standalone.yml exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"`

Put your own reverse proxy and firewall in front before exposing the frontend port on a public host.

## This VPS

The [vps-control-panel](https://github.com/andrewallkin/vps-control-panel) deploys this repository’s `docker-compose.yml` in **image mode**:

- CI builds and pushes `backend`, `frontend`, and `mcp` images to Docker Hub. The MCP image is the same backend Dockerfile, tagged separately, and the Compose service starts it with `python -m app.mcp.server`.
- The panel writes production `.env` (including `POSTGRES_*` aimed at the shared Postgres instance and Docker image tags `DOCKER_IMAGE_BACKEND`, `DOCKER_IMAGE_FRONTEND`, and `DOCKER_IMAGE_MCP`).
- The stack joins the external Docker network `postgres-net` (no Postgres service in this file). Backend and MCP both use that network.
- Host ports bind to `127.0.0.1`, including MCP on `MCP_PORT` (default 8004). The panel’s nginx and Cloudflare terminate TLS and route the public `/mcp` path to that service.
- Migrations run with `docker compose run --rm --no-deps backend bash /app/run_migrations.sh`.
- Health checks use `GET /api/health`.

No hostnames, allocated ports, or credentials for this environment belong in the application repository.