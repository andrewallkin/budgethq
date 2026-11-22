"""MCP content resources for Investec banking workflows."""

from __future__ import annotations

from pathlib import Path

from fastmcp import FastMCP

RESOURCE_DIR = Path(__file__).resolve().parent / "resources" / "banking"

BANKING_RESOURCES: tuple[tuple[str, str, str, str], ...] = (
    (
        "budgethq://workflow-registry",
        "workflow-registry.yaml",
        "BudgetHQ workflow registry",
        "Entry point: which banking workflows exist and which resources to read before acting.",
    ),
    (
        "budgethq://banking/core-rules",
        "core-rules.yaml",
        "Investec banking core rules",
        "Universal invariants for every Investec money movement via MCP.",
    ),
    (
        "budgethq://banking/accounts-and-identifiers",
        "accounts-and-identifiers.yaml",
        "Accounts and identifier reference",
        "Investec vs BudgetHQ identifiers and which MCP tools accept which IDs.",
    ),
    (
        "budgethq://banking/transfers",
        "transfers.yaml",
        "Transfer workflow",
        "Account-to-account transfer procedure (own accounts only).",
    ),
    (
        "budgethq://banking/payments",
        "payments.yaml",
        "Payment workflow",
        "Pay an existing Investec beneficiary from a source account.",
    ),
    (
        "budgethq://banking/verification",
        "verification.yaml",
        "Verification workflow",
        "Authoritative status checks for transfers and payments.",
    ),
    (
        "budgethq://banking/recurring-costs",
        "recurring-costs.yaml",
        "Recurring cost orchestration",
        "End-to-end fund-account then pay-beneficiary with separate approvals.",
    ),
    (
        "budgethq://banking/monthly-period-setup",
        "monthly-period-setup.yaml",
        "Monthly period setup",
        "Establish a new monthly financial period: salary, consolidation, transfers, and month-end funding prep.",
    ),
    (
        "budgethq://banking/month-end-funding-transfer",
        "month-end-funding-transfer.yaml",
        "Month-end funding transfer",
        "Reconcile next month's debit orders and transfer Normal Savings to Daily on the last day of the month.",
    ),
    (
        "budgethq://banking/error-handling",
        "error-handling.yaml",
        "Banking error handling",
        "Failures, ambiguity, duplicates, and recovery rules.",
    ),
)

ALL_BANKING_URIS = frozenset(uri for uri, *_ in BANKING_RESOURCES)


def resource_uri_from_document(data: dict) -> str | None:
    """Return the declared budgethq:// URI from a loaded workflow YAML document."""
    resource = data.get("resource")
    if isinstance(resource, str):
        return resource
    if isinstance(resource, dict):
        uri = resource.get("uri")
        return uri if isinstance(uri, str) else None
    return None


def resource_version_from_document(data: dict) -> str | None:
    """Return version from either a flat or nested resource block."""
    version = data.get("version")
    if isinstance(version, str):
        return version
    resource = data.get("resource")
    if isinstance(resource, dict):
        nested = resource.get("version")
        if isinstance(nested, str):
            return nested
    return None


def _read_resource_file(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def register_banking_resources(mcp: FastMCP) -> None:
    """Expose static YAML workflow resources at stable budgethq:// URIs."""
    for uri, filename, title, description in BANKING_RESOURCES:
        file_path = RESOURCE_DIR / filename
        if not file_path.is_file():
            raise FileNotFoundError(f"Missing banking MCP resource file: {file_path}")

        def _bind(resource_uri: str, path: Path, resource_title: str, resource_description: str) -> None:
            @mcp.resource(
                resource_uri,
                mime_type="application/yaml",
                title=resource_title,
                description=resource_description,
            )
            def _resource_body() -> str:
                return _read_resource_file(path)

        _bind(uri, file_path, title, description)