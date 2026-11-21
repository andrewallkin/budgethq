"""Read-only Investec Private Bank proxy for external API clients."""

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse

from .. import auth, models
from ..investec_service import InvestecService
from ..utils import decrypt_api_key

router = APIRouter(prefix="/external/investec", tags=["external-investec"])


def _investec_for_user(user: models.User) -> InvestecService:
    if not all([user.investec_client_id, user.investec_client_secret, user.investec_api_key]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Investec credentials not configured",
        )
    return InvestecService(
        decrypt_api_key(user.investec_client_id),
        decrypt_api_key(user.investec_client_secret),
        decrypt_api_key(user.investec_api_key),
    )


def _query_params(request: Request) -> dict[str, str]:
    return dict(request.query_params)


def _proxy_json(service: InvestecService, investec_path: str, params: dict[str, str]) -> JSONResponse:
    status_code, body = service.request_json("GET", investec_path, params=params)
    return JSONResponse(status_code=status_code, content=body)


def _resolve_profile_id(service: InvestecService) -> tuple[Optional[int], Any]:
    status_code, body = service.request_json("GET", "/za/pb/v1/profiles", params={})
    if status_code != 200:
        return status_code, body
    profiles = body.get("data", {}).get("profiles", []) if isinstance(body, dict) else []
    if not profiles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Investec profiles available",
        )
    default = next((p for p in profiles if p.get("defaultProfile")), None)
    chosen = default or profiles[0]
    profile_id = chosen.get("profileId")
    if not profile_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Investec profile id missing",
        )
    return None, profile_id


@router.get("/accounts")
async def list_accounts(
    request: Request,
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
):
    service = _investec_for_user(current_user)
    return _proxy_json(service, "/za/pb/v1/accounts", _query_params(request))


@router.get("/accounts/{account_id}/balance")
async def get_account_balance(
    account_id: str,
    request: Request,
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
):
    service = _investec_for_user(current_user)
    return _proxy_json(
        service, f"/za/pb/v1/accounts/{account_id}/balance", _query_params(request)
    )


@router.get("/accounts/{account_id}/transactions")
async def list_account_transactions(
    account_id: str,
    request: Request,
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
):
    service = _investec_for_user(current_user)
    return _proxy_json(
        service, f"/za/pb/v1/accounts/{account_id}/transactions", _query_params(request)
    )


@router.get("/accounts/{account_id}/pending-transactions")
async def list_pending_transactions(
    account_id: str,
    request: Request,
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
):
    service = _investec_for_user(current_user)
    return _proxy_json(
        service,
        f"/za/pb/v1/accounts/{account_id}/pending-transactions",
        _query_params(request),
    )


@router.get("/profiles")
async def list_profiles(
    request: Request,
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
):
    service = _investec_for_user(current_user)
    return _proxy_json(service, "/za/pb/v1/profiles", _query_params(request))


@router.get("/profiles/{profile_id}/accounts")
async def list_profile_accounts(
    profile_id: str,
    request: Request,
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
):
    service = _investec_for_user(current_user)
    return _proxy_json(
        service, f"/za/pb/v1/profiles/{profile_id}/accounts", _query_params(request)
    )


@router.get("/profiles/{profile_id}/accounts/{account_id}/authorisation-setup")
async def get_authorisation_setup(
    profile_id: str,
    account_id: str,
    request: Request,
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
):
    service = _investec_for_user(current_user)
    return _proxy_json(
        service,
        f"/za/pb/v1/profiles/{profile_id}/accounts/{account_id}/authorisationsetupdetails",
        _query_params(request),
    )


@router.get("/profiles/{profile_id}/accounts/{account_id}/beneficiaries")
async def list_profile_beneficiaries(
    profile_id: str,
    account_id: str,
    request: Request,
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
):
    service = _investec_for_user(current_user)
    return _proxy_json(
        service,
        f"/za/pb/v1/profiles/{profile_id}/accounts/{account_id}/beneficiaries",
        _query_params(request),
    )


@router.get("/beneficiaries")
async def list_beneficiaries(
    request: Request,
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
):
    service = _investec_for_user(current_user)
    return _proxy_json(service, "/za/pb/v1/accounts/beneficiaries", _query_params(request))


@router.get("/beneficiary-categories")
async def list_beneficiary_categories(
    request: Request,
    profile_id: Optional[str] = Query(default=None, alias="profileId"),
    current_user: models.User = Depends(auth.get_user_from_external_api_key),
):
    service = _investec_for_user(current_user)
    params = _query_params(request)
    if not profile_id and "profileId" not in params:
        error_status, profile_or_body = _resolve_profile_id(service)
        if error_status is not None:
            return JSONResponse(status_code=error_status, content=profile_or_body)
        params["profileId"] = profile_or_body
    return _proxy_json(service, "/za/pb/v1/accounts/beneficiarycategories", params)