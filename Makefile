.PHONY: help dev-up dev-down dev-build dev-logs dev-shell migrate migrate-create migrate-stamp migrate-history migrate-rollback clean prod-up prod-down

# Default command
help:
	@echo "🚀 Budget Dashboard - Development Commands"
	@echo ""
	@echo "Development:"
	@echo "  make dev-up          - Start with persistent database (default)"
	@echo "  make dev-build       - Rebuild and start with persistent database"
	@echo "  make dev-down        - Stop development environment"
	@echo "  make dev-logs        - View all development logs"
	@echo "  make dev-shell       - Open shell in backend container"
	@echo ""
	@echo "Database Migrations:"
	@echo "  make migrate         - Run pending migrations"
	@echo "  make migrate-create  - Create new migration (use MSG='description')"
	@echo "  make migrate-stamp   - Mark DB as up-to-date (prevents data loss)"
	@echo "  make migrate-history - Show migration history"
	@echo "  make migrate-rollback - Rollback last migration"
	@echo ""
	@echo "Production (VPS/Testing):"
	@echo "  make prod-up         - Start with production config"
	@echo "  make prod-down       - Stop production config"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean           - Remove containers and images"
	@echo ""
	@echo "Examples:"
	@echo "  make dev-up"
	@echo "  make migrate-create MSG='add_notes_column'"
	@echo "  make migrate-stamp"
	@echo "  make dev-logs"

# Development
dev-up:
	docker-compose -f docker-compose.dev.yml up -d
	@echo "✓ Development environment started with persistent database!"
	@echo "  Backend:  http://localhost:8000"
	@echo "  Frontend: http://localhost:3000"
	@echo "  Database: localhost:5432"

dev-down:
	docker-compose -f docker-compose.dev.yml down

dev-build:
	docker-compose -f docker-compose.dev.yml up -d --build
	@echo "✓ Development environment rebuilt and started with persistent database!"
	@echo "  Backend:  http://localhost:8000"
	@echo "  Frontend: http://localhost:3000"
	@echo "  Database: localhost:5432"

dev-logs:
	docker-compose -f docker-compose.dev.yml logs -f

dev-shell:
	docker-compose -f docker-compose.dev.yml exec backend bash

# Database Migrations
migrate:
	docker-compose -f docker-compose.dev.yml exec backend uv run alembic upgrade head

migrate-create:
ifndef MSG
	@echo "Error: Please provide a message: make migrate-create MSG='description'"
	@exit 1
endif
	docker-compose -f docker-compose.dev.yml exec backend uv run alembic revision --autogenerate -m "$(MSG)"
	@echo "✓ Migration created! Check: backend/alembic/versions/"

migrate-stamp:
	docker-compose -f docker-compose.dev.yml exec backend uv run alembic stamp head
	@echo "✓ Database marked as up-to-date (prevents recreating existing tables)"

migrate-history:
	docker-compose -f docker-compose.dev.yml exec backend uv run alembic history

migrate-rollback:
	docker-compose -f docker-compose.dev.yml exec backend uv run alembic downgrade -1

# Production (for testing prod build locally, VPS uses default via CI/CD)
prod-up:
	docker-compose up -d

prod-down:
	docker-compose down

# Utilities
clean:
	docker-compose -f docker-compose.dev.yml down -v
	docker system prune -af

