# Docker Setup Guide

This project has separate Docker Compose configurations for development and production.

## 📁 Files

- **`docker-compose.yml`** - Production config (default, used on VPS)
- **`docker-compose.dev.yml`** - Development config (hot reload, volume mounts)
- **`Makefile`** - Helper commands for easy development

## 🏠 Local Development

### Quick Start (Using Makefile)

```bash
# Start development environment
make dev-up

# View logs
make dev-logs

# Create a migration
make migrate-create MSG="add_notes_column"

# Run migrations
make migrate

# Stop everything
make dev-down
```

### Manual Commands (Without Makefile)

```bash
# Start dev environment
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Access backend shell
docker-compose -f docker-compose.dev.yml exec backend bash

# Run migrations
docker-compose -f docker-compose.dev.yml exec backend alembic upgrade head

# Stop
docker-compose -f docker-compose.dev.yml down
```

## 🚀 Production (VPS)

### Deployment via CI/CD (Automatic)

Push to main → GitHub Actions uses default `docker-compose.yml` automatically

### Manual Deployment on VPS

```bash
# SSH to VPS
ssh user@your-vps
cd /srv/apps/budget-dashboard

# Use default production config
docker compose down
docker compose up -d --build

# Run migrations
docker compose exec backend ./run_migrations.sh
```

## 🔍 Key Differences

| Feature | Development (`dev.yml`) | Production (default `.yml`) |
|---------|------------------------|-------------------------|
| **Volume Mounts** | ✅ Code, migrations | ❌ Only data directory |
| **Hot Reload** | ✅ Backend + Frontend | ❌ Disabled |
| **Database Port** | ✅ Exposed (5432) | ❌ Internal only |
| **Restart Policy** | `unless-stopped` | `always` |
| **Use Case** | Local coding | VPS deployment |

## 💡 Why Separate Configs?

### Development Needs:
- 📝 Edit code → See changes instantly (hot reload)
- 🗄️ Create migrations → Files appear locally
- 🔍 Access database directly (localhost:5432)
- 🐛 Easy debugging with live code updates

### Production Needs:
- 🔒 Code baked into image (security)
- ⚡ No volume overhead (performance)
- 🛡️ Minimal attack surface
- 🔄 Clean restarts with `always` policy

## 🎯 Common Workflows

### Creating a Migration (Development)

```bash
# Start dev environment
make dev-up

# Edit your models
vim backend/app/models.py

# Create migration (file appears locally!)
make migrate-create MSG="add_user_avatar"

# Check the file
cat backend/alembic/versions/*_add_user_avatar.py

# Test it
make migrate

# Commit
git add backend/alembic/versions/*_add_user_avatar.py
git commit -m "Add migration: add user avatar"
git push

# CI/CD applies it to production automatically!
```

### Testing Production Build Locally

```bash
# Build and run with production config (default)
docker-compose up --build
# or: make prod-up

# This mimics VPS environment
# No volume mounts, code is baked in
```

### Switching Between Configs

```bash
# Stop dev
make dev-down

# Start prod (to test production build)
make prod-up

# Back to dev
make dev-up
```

## 🛠️ Makefile Commands Reference

| Command | Description |
|---------|-------------|
| `make help` | Show all available commands |
| `make dev-up` | Start development (with hot reload) |
| `make dev-down` | Stop development |
| `make dev-build` | Rebuild dev containers |
| `make dev-logs` | Follow dev logs |
| `make dev-shell` | Open backend shell |
| `make migrate` | Run pending migrations |
| `make migrate-create MSG='...'` | Create new migration |
| `make migrate-history` | View migration history |
| `make migrate-rollback` | Undo last migration |
| `make clean` | Remove all containers and volumes |

## 🚨 Important Notes

1. **Always use dev config locally** - Never use prod config for development
2. **VPS uses prod config** - Handled automatically by CI/CD
3. **Migration files appear locally** - Thanks to volume mounts in dev config
4. **Test before pushing** - Run migrations locally first
5. **Don't commit override files** - `.gitignore` excludes them

## 🎓 Best Practices

✅ **Local Development:** `make dev-up` or `docker-compose -f docker-compose.dev.yml up`
✅ **Creating Migrations:** `make migrate-create MSG="description"`
✅ **Production:** Let CI/CD handle it (uses prod config automatically)
❌ **Don't:** Mix configs or forget which one you're using
❌ **Don't:** Run prod config locally unless testing production build

