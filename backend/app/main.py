from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from . import database
from .scheduler import start_scheduler, stop_scheduler, sync_all_prices
from .logging_config import configure_logging

# Import all routers
from .routers.auth import router as auth_router
from .routers.budget import router as budget_router
from .routers.emergency import router as emergency_router
from .routers.retirement import router as retirement_router
from .routers.portfolio import router as portfolio_router
from .routers.tfsa import router as tfsa_router
from .routers.etf import router as etf_router
from .routers.etf_transactions import router as etf_transactions_router
from .routers.sheets import router as sheets_router
from .routers.bonds import router as bonds_router
from .routers.bond_transactions import router as bond_transactions_router
from .routers.analytics import router as analytics_router
from .routers.admin import router as admin_router
from .routers.calculations import router as calculations_router
from .routers.payslip import router as payslip_router
from .routers.salary import router as salary_router
from .routers.investec import router as investec_router
from .routers.manual_accounts import router as manual_accounts_router

# Configure logging on startup
configure_logging()

# Initialize DB
# Note: Database tables are now managed by Alembic migrations
# Run: docker-compose exec backend alembic upgrade head
# models.Base.metadata.create_all(bind=database.engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle - start/stop background tasks."""
    # Startup: Start the price sync scheduler
    start_scheduler()
    # Run initial sync on startup
    await sync_all_prices()
    yield
    # Shutdown: Stop the scheduler
    stop_scheduler()


app = FastAPI(lifespan=lifespan)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routers
app.include_router(auth_router, prefix="/api")
app.include_router(budget_router, prefix="/api")
app.include_router(emergency_router, prefix="/api")
app.include_router(retirement_router, prefix="/api")
app.include_router(portfolio_router, prefix="/api")
app.include_router(tfsa_router, prefix="/api")
app.include_router(etf_router, prefix="/api")
app.include_router(etf_transactions_router, prefix="/api")
app.include_router(sheets_router, prefix="/api")
app.include_router(bonds_router, prefix="/api")
app.include_router(bond_transactions_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(calculations_router, prefix="/api")
app.include_router(payslip_router, prefix="/api/payslip", tags=["payslip"])
app.include_router(salary_router, prefix="/api")
app.include_router(investec_router)
app.include_router(manual_accounts_router, prefix="/api")

