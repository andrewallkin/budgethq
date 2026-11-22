# Month-End Funding Reference

Run on the last day of the month, including when a scheduled task starts the workflow. A scheduled task can start the work. It is not Telegram approval.

Read the Monthly Money page for the upcoming month. The transfer amount is the reconciled total of debit orders and scheduled payments meant to clear on the 1st.

- Calculated total = sum of those individual amounts.
- Calculated total must equal the total stated on that page.
- If they differ, or the list is incomplete, stop. Do not edit the Notion total or invent a missing amount.
- Do not include manual recurring costs unless that page's funding plan explicitly includes them.
- Do not rebuild the list from historical bank transactions unless you are investigating a discrepancy.
- Do not reduce the amount because Daily already holds a balance.

Movement: Investec Normal Savings to Investec Daily. Both references are `<MONTH> DEBIT ORDERS TRANSFER`, with `<MONTH>` the uppercase name of the upcoming month.

Execution still goes through `banking-transfers` and `banking-verification`.
