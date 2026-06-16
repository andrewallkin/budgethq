"""PDF report generation for bank transaction exports."""

from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from typing import List, Optional

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .transaction_budget_summary import BudgetComparisonSummary
from .transaction_categories import category_label
from .utils import get_sast_now


@dataclass
class ExportTransactionRow:
    transaction_date: datetime
    description: str
    amount: float
    transaction_type: str
    category: Optional[str]
    account_name: Optional[str] = None


def _format_currency(amount: float) -> str:
    formatted = f"{abs(amount):,.2f}".replace(",", " ")
    return f"R {formatted}"


def _format_signed_amount(amount: float, transaction_type: str) -> str:
    prefix = "+" if transaction_type == "CREDIT" else "-"
    return f"{prefix}{_format_currency(amount)}"


def _format_date(value: datetime) -> str:
    return value.strftime("%d %b %Y")


def _table_style_base() -> list:
    return [
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E5E7EB")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]


def _build_budget_comparison_section(
    budget_summary: BudgetComparisonSummary,
    section_style: ParagraphStyle,
) -> list:
    section_title = ParagraphStyle(
        "BudgetSectionTitle",
        parent=section_style,
        fontSize=11,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#111827"),
        spaceAfter=6,
    )

    headers = ["Category", "Budgeted", "Actual", "Remaining"]
    table_data = [headers]
    for row in budget_summary.rows:
        remaining_prefix = "+" if row.remaining >= 0 else ""
        table_data.append(
            [
                row.label,
                _format_currency(row.budgeted),
                _format_currency(row.actual),
                f"{remaining_prefix}{_format_currency(row.remaining)}",
            ]
        )

    remaining_prefix = "+" if budget_summary.remaining >= 0 else ""
    table_data.append(
        [
            "Total",
            _format_currency(budget_summary.total_budgeted),
            _format_currency(budget_summary.total_spent),
            f"{remaining_prefix}{_format_currency(budget_summary.remaining)}",
        ]
    )

    remaining_total_color = (
        colors.HexColor("#16A34A")
        if budget_summary.remaining >= 0
        else colors.HexColor("#DC2626")
    )
    budget_table = Table(table_data, colWidths=[52 * mm, 32 * mm, 32 * mm, 34 * mm], repeatRows=1)
    budget_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("FONTSIZE", (0, 1), (-1, -1), 8),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (0, -1), "LEFT"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#F9FAFB")]),
                ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F3F4F6")),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("TEXTCOLOR", (3, 1), (3, -2), colors.HexColor("#374151")),
                ("TEXTCOLOR", (3, -1), (3, -1), remaining_total_color),
                *_table_style_base(),
            ]
        )
    )

    elements = [
        Paragraph("Budget vs Actual", section_title),
        budget_table,
    ]
    if budget_summary.unlinked_offset_total > 0:
        elements.append(
            Paragraph(
                f"Includes {_format_currency(budget_summary.unlinked_offset_total)} from unlinked refunds/reimbursements in total budgeted.",
                section_style,
            )
        )
    if budget_summary.linked_offset_total > 0:
        elements.append(
            Paragraph(
                f"{_format_currency(budget_summary.linked_offset_total)} of spend offset by linked refunds/reimbursements.",
                section_style,
            )
        )
    if budget_summary.reimbursements_total > 0:
        elements.append(
            Paragraph(
                f"Includes {_format_currency(budget_summary.reimbursements_total)} reimbursements (not earnings).",
                section_style,
            )
        )
    elements.append(Spacer(1, 8 * mm))
    return elements


def _add_page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.grey)
    canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_transactions_pdf(
    *,
    from_date: str,
    to_date: str,
    account_names: List[str],
    include_transfers: bool,
    transactions: List[ExportTransactionRow],
    budget_summary: Optional[BudgetComparisonSummary] = None,
) -> bytes:
    """Generate a structured PDF report and return raw bytes."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title="Transaction Report",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontSize=18,
        spaceAfter=4,
        textColor=colors.HexColor("#111827"),
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#6B7280"),
        spaceAfter=12,
    )
    meta_style = ParagraphStyle(
        "Meta",
        parent=styles["Normal"],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#374151"),
    )
    cell_style = ParagraphStyle(
        "Cell",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
    )
    amount_credit_style = ParagraphStyle(
        "AmountCredit",
        parent=cell_style,
        alignment=TA_RIGHT,
        textColor=colors.HexColor("#16A34A"),
    )
    amount_debit_style = ParagraphStyle(
        "AmountDebit",
        parent=cell_style,
        alignment=TA_RIGHT,
        textColor=colors.HexColor("#DC2626"),
    )

    generated_at = get_sast_now().strftime("%d %b %Y %H:%M SAST")
    accounts_text = ", ".join(account_names) if account_names else "All selected accounts"
    transfer_text = "included" if include_transfers else "excluded"

    story = [
        Paragraph("Transaction Report", title_style),
        Paragraph("BudgetHQ", subtitle_style),
        Paragraph(
            f"<b>Period:</b> {_format_date(datetime.strptime(from_date, '%Y-%m-%d'))} "
            f"to {_format_date(datetime.strptime(to_date, '%Y-%m-%d'))}<br/>"
            f"<b>Accounts:</b> {accounts_text}<br/>"
            f"<b>Transfers:</b> {transfer_text}<br/>"
            f"<b>Generated:</b> {generated_at}",
            meta_style,
        ),
        Spacer(1, 6 * mm),
    ]

    if budget_summary and budget_summary.rows:
        story.extend(_build_budget_comparison_section(budget_summary, meta_style))

    total_credits = sum(t.amount for t in transactions if t.transaction_type == "CREDIT")
    total_debits = sum(abs(t.amount) for t in transactions if t.transaction_type == "DEBIT")
    net = total_credits - total_debits

    summary_data = [
        ["Transactions", str(len(transactions))],
        ["Total Credits", _format_currency(total_credits)],
        ["Total Debits", _format_currency(total_debits)],
        ["Net Movement", _format_signed_amount(net, "CREDIT" if net >= 0 else "DEBIT")],
    ]
    summary_table = Table(summary_data, colWidths=[45 * mm, 55 * mm])
    summary_title = ParagraphStyle(
        "SummarySectionTitle",
        parent=meta_style,
        fontSize=11,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#111827"),
        spaceAfter=6,
    )
    story.append(Paragraph("Transaction Summary", summary_title))
    summary_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F3F4F6")),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#6B7280")),
                ("TEXTCOLOR", (1, 0), (1, -1), colors.HexColor("#111827")),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                *_table_style_base(),
            ]
        )
    )
    story.append(summary_table)
    story.append(Spacer(1, 8 * mm))

    if transactions:
        txn_title = ParagraphStyle(
            "TxnSectionTitle",
            parent=meta_style,
            fontSize=11,
            fontName="Helvetica-Bold",
            textColor=colors.HexColor("#111827"),
            spaceAfter=6,
        )
        story.append(Paragraph("Transactions", txn_title))

    show_account_column = len(account_names) > 1
    if not transactions:
        story.append(
            Paragraph(
                "No transactions found for the selected criteria.",
                meta_style,
            )
        )
    else:
        headers = ["Date", "Merchant", "Amount", "Category"]
        if show_account_column:
            headers.insert(1, "Account")

        table_data = [headers]
        for txn in transactions:
            amount_style = amount_credit_style if txn.transaction_type == "CREDIT" else amount_debit_style
            row = [
                _format_date(txn.transaction_date),
            ]
            if show_account_column:
                row.append(Paragraph(txn.account_name or "—", cell_style))
            row.extend(
                [
                    Paragraph(txn.description or "—", cell_style),
                    Paragraph(_format_signed_amount(txn.amount, txn.transaction_type), amount_style),
                    category_label(txn.category),
                ]
            )
            table_data.append(row)

        if show_account_column:
            col_widths = [22 * mm, 32 * mm, 58 * mm, 28 * mm, 32 * mm]
        else:
            col_widths = [24 * mm, 78 * mm, 30 * mm, 38 * mm]

        txn_table = Table(table_data, colWidths=col_widths, repeatRows=1)
        txn_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F2937")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 8),
                    ("FONTSIZE", (0, 1), (-1, -1), 8),
                    ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E5E7EB")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        story.append(txn_table)

    doc.build(story, onFirstPage=_add_page_number, onLaterPages=_add_page_number)
    return buffer.getvalue()
