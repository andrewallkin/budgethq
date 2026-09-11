"""Extract structured data from Sygnia Investments Summary HTML."""

from __future__ import annotations

import html as html_lib
import re

from bs4 import BeautifulSoup, Tag

# --- format_numbers (ported from sygnia-e2e/format_numbers.py) ---

NUMBER_TOKEN_RE = re.compile(
    r"""
    (?<![A-Za-z0-9_])
    (?P<prefix>R)?
    \s*
    (?P<sign>-?)
    \s*
    (?P<int>\d{1,3}(?:[\s\u00a0]\d{3})+|\d+)
    (?:[,.](?P<frac>\d+))?
    (?P<pct>\s*%)?
    (?![A-Za-z0-9_])
    """,
    re.VERBOSE,
)


def standardize_numbers(text: str) -> str:
    """Normalize numeric text: no thousand spaces, comma decimals."""
    if not text:
        return text

    def repl(match: re.Match[str]) -> str:
        prefix = match.group("prefix") or ""
        sign = match.group("sign") or ""
        int_part = re.sub(r"[\s\u00a0]", "", match.group("int"))
        frac = match.group("frac")
        pct = "%" if match.group("pct") else ""
        if frac is not None:
            return f"{prefix}{sign}{int_part},{frac}{pct}"
        return f"{prefix}{sign}{int_part}{pct}"

    return NUMBER_TOKEN_RE.sub(repl, text)


# --- clean_html (minimal port from sygnia-e2e/scrub_html.py) ---

NBSP_RE = re.compile(r"&nbsp;|&#160;|&#xA0;|\u00a0", re.IGNORECASE)

CURRENCY_CLEAN_RE = re.compile(
    r"(?<![A-Za-z])R\s*(-?)\s*"
    r"(\d{1,3}(?:\s\d{3})+|\d+)"
    r"(?:[,.](\d{1,2}))?"
)

PLAIN_NUMBER_CLEAN_RE = re.compile(
    r"(?<![A-Za-z0-9_R])(-?)(\d{1,3}(?:\s\d{3})+|\d+)(?:[,.](\d+))?(?![A-Za-z0-9_])"
)


def _normalize_currency_match(match: re.Match[str]) -> str:
    sign = match.group(1) or ""
    int_part = match.group(2).replace(" ", "").replace("\u00a0", "")
    decimals = match.group(3)
    if decimals is None:
        decimals = "00"
    elif len(decimals) == 1:
        decimals = decimals + "0"
    return f"R{sign}{int_part},{decimals}"


def _normalize_plain_number_match(match: re.Match[str]) -> str:
    sign = match.group(1) or ""
    int_part = match.group(2).replace(" ", "").replace("\u00a0", "")
    decimals = match.group(3)
    if decimals is None:
        return f"{sign}{int_part}"
    return f"{sign}{int_part},{decimals}"


def clean_html(text: str) -> tuple[str, int]:
    """Normalize nbsp + numbers. Returns (cleaned, number_replacements)."""
    out = NBSP_RE.sub(" ", text)
    out, n_currency = CURRENCY_CLEAN_RE.subn(_normalize_currency_match, out)
    out, n_plain = PLAIN_NUMBER_CLEAN_RE.subn(_normalize_plain_number_match, out)
    out, n_pct = re.subn(r"(\d(?:,\d+)?)\s+%", r"\1%", out)
    return out, n_currency + n_plain + n_pct


# --- HTML extraction (ported from sygnia-e2e/extract_summary.py) ---


def _text(el: Tag | None) -> str:
    if el is None:
        return ""
    raw = " ".join(html_lib.unescape(el.get_text(" ", strip=True)).split())
    return standardize_numbers(raw)


def _bind_text(root: Tag, bind: str) -> str:
    el = root.find(attrs={"data-bind": lambda v: isinstance(v, str) and bind in v})
    return _text(el)


def extract_investment_summary(soup: BeautifulSoup) -> dict:
    rows: list[dict[str, str]] = []

    container = soup.find(
        attrs={
            "data-template": "account-summary-includingunitsandprice-template",
            "data-bind": lambda v: isinstance(v, str) and "accountData" in v,
        }
    )
    if container:
        for block in container.find_all("div", recursive=False):
            desktop = block.select_one(".hidden-sm-down .grid-row")
            if not desktop:
                continue
            rows.append(
                {
                    "investment_code": _bind_text(desktop, "InvestmentCode"),
                    "investment_name": _bind_text(desktop, "InvestmentName"),
                    "units": _bind_text(desktop, "Units"),
                    "unit_price": _bind_text(desktop, "UnitPrice"),
                    "market_value": _bind_text(desktop, "MarketValue"),
                    "percentage": _bind_text(desktop, "Percentage"),
                }
            )

    total_value = ""
    total_pct = ""
    for row in soup.select(".hidden-sm-down.grid-row.important-text"):
        total_el = row.find(
            attrs={"data-bind": lambda v: isinstance(v, str) and "specificAccountTotal" in v}
        )
        if not total_el:
            continue
        total_value = _text(total_el)
        strongs = row.find_all("strong")
        if len(strongs) >= 2:
            total_pct = _text(strongs[1])
        break

    return {"rows": rows, "total_market_value": total_value, "total_percentage": total_pct}


def _bold_lines(label_el: Tag) -> list[str]:
    lines = [_text(b) for b in label_el.find_all("b")]
    return [line for line in lines if line]


def _format_benefit_amount(text: str) -> str:
    text = standardize_numbers(text)
    return re.sub(r"(R-?\d+),00\b", r"\1", text)


def _component_row(section: Tag, label: str) -> dict | None:
    for row in section.select(".grid-row.row"):
        name_labels = [
            lab for lab in row.find_all("label") if _text(lab).lower() == label.lower()
        ]
        if not name_labels:
            continue

        market = ""
        for div in row.find_all("div"):
            bind = div.get("data-bind") or ""
            if any(
                k in bind
                for k in (
                    "RetirementTotal",
                    "SavingsTotal",
                    "VestedBenefitTotal",
                    "NonVestedBenefitTotal",
                )
            ):
                market = _text(div)
                break

        desktop_labels = [
            lab for lab in row.find_all("label") if "hidden-xs-down" in (lab.get("class") or [])
        ]
        availability_lines: list[str] = []
        amount_lines: list[str] = []
        if len(desktop_labels) >= 2:
            availability_lines = _bold_lines(desktop_labels[0])
            amount_lines = [_format_benefit_amount(t) for t in _bold_lines(desktop_labels[1])]
        elif len(desktop_labels) == 1:
            availability_lines = _bold_lines(desktop_labels[0])

        benefit_lines: list[str] = []
        if availability_lines and amount_lines:
            for i, availability in enumerate(availability_lines):
                amount = amount_lines[i] if i < len(amount_lines) else ""
                benefit_lines.append(f"{availability}: {amount}" if amount else availability)
            for amount in amount_lines[len(availability_lines) :]:
                benefit_lines.append(amount)
        else:
            benefit_lines = availability_lines or amount_lines

        return {
            "component": label,
            "market_value": market,
            "benefit_lines": benefit_lines,
        }
    return None


def extract_retirement_components(soup: BeautifulSoup) -> dict:
    root = soup.find(id="RetirementFundComponentsRenderTarget")
    if not root:
        return {"components": [], "account_market_value": ""}

    components = []
    for label in ("Retirement Component", "Savings Component"):
        row = _component_row(root, label)
        if row:
            components.append(row)

    return {
        "components": components,
        "account_market_value": _bind_text(root, "AccountMarketValue"),
    }


def extract_beneficiaries(soup: BeautifulSoup) -> list[dict[str, str]]:
    root = soup.find(id="BeneficiariesRenderTarget")
    if not root:
        return []

    rows: list[dict[str, str]] = []
    for desktop in root.select(".hidden-sm-down .grid-row"):
        name = _bind_text(desktop, "BENEFICIARY_NAME")
        if not name:
            continue
        rows.append(
            {
                "name": name,
                "relationship": _bind_text(desktop, "BENEFICIARY_RELATIONSHIP"),
                "allocation": _bind_text(desktop, "PERCENTAGE_ALLOCATION"),
            }
        )
    return rows


def extract_debit_order(soup: BeautifulSoup) -> dict:
    root = soup.find(id="DebitOrdersRenderTarget")
    details: dict[str, str] = {}
    if root:
        scope = None
        for div in root.find_all("div", class_=True):
            classes = div.get("class") or []
            if "hidden-sm-down" in classes and any(c.startswith("col-") for c in classes):
                scope = div
                break
        if scope is None:
            scope = root

        details = {
            "debit_order_amount": _bind_text(scope, "existingDebitOrderAmount"),
            "escalation_rate": _bind_text(scope, "existingEscalationRate"),
            "escalation_month": _bind_text(scope, "existingEscalationMonth"),
            "day_of_month": _bind_text(scope, "existingDayOfMonth"),
            "effective_date": _bind_text(scope, "existingEffectiveDate"),
            "linked_bank": _bind_text(scope, "linkedBankAccountDisplayName"),
        }

    allocations: list[dict[str, str]] = []
    alloc_root = soup.find(id="DebitOrderAllocationsRenderTarget")
    if alloc_root:
        table = None
        for t in alloc_root.find_all("table"):
            classes = t.get("class") or []
            if "hidden-sm-down" in classes:
                table = t
                break
        if table:
            for tr in table.select("tbody tr.fund-row"):
                code_td = tr.select_one("td.manager-product-code")
                name_td = None
                for td in tr.find_all("td", class_=True):
                    classes = td.get("class") or []
                    if (
                        "inputs" in classes
                        and "manager-product-code" not in classes
                        and "text-right" not in classes
                    ):
                        name_td = td
                        break
                pct = ""
                for td in tr.find_all("td"):
                    bind = td.get("data-bind") or ""
                    if "isPercentageAllocationVisible" in bind:
                        pct = _text(td)
                        break
                allocations.append(
                    {
                        "investment_code": _text(code_td),
                        "investment_name": _text(name_td),
                        "allocation": pct,
                    }
                )

    return {"details": details, "allocations": allocations}


def extract_all(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    return {
        "investment_summary": extract_investment_summary(soup),
        "retirement_fund_components": extract_retirement_components(soup),
        "beneficiaries": extract_beneficiaries(soup),
        "debit_order": extract_debit_order(soup),
    }


def parse_zar_amount(text: str) -> float | None:
    """Parse standardized ZAR text (e.g. R5200,00) to float."""
    if not text:
        return None
    cleaned = text.strip().replace("\u00a0", " ")
    cleaned = re.sub(r"^R\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.replace(" ", "").replace(",", ".")
    cleaned = re.sub(r"[^0-9.\-]", "", cleaned)
    if not cleaned or cleaned in ("-", "."):
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def enrich_summary_with_portfolio_value(summary: dict) -> dict:
    """Add parsed total for value-history persistence."""
    inv = summary.get("investment_summary") or {}
    total_text = inv.get("total_market_value") or ""
    portfolio_value = parse_zar_amount(total_text)
    return {**summary, "portfolio_value": portfolio_value}
