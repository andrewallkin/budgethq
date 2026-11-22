# Banking Error Handling

Recovery follows evidence of the prior action. Never call `create_investec_transfer` or `create_investec_payment` again to find out whether the first call worked.

Surface a returned error code and message. An error does not by itself prove that no movement was created. Do not include secrets.

| Situation | What to do |
| --- | --- |
| Tool error before a movement exists | Report the error. Do not assume a movement ID. Start a new attempt only if the user still wants it and the parameters are settled. |
| Timeout after create | Outcome is ambiguous. If you have a movement ID, call `get_investec_movement`. If you do not, use Investec read tools to see whether a movement was created. Do not blind-retry. A justified replay of the same logical movement reuses the original idempotency key. |
| Pending Telegram | Do not create a second movement. The approval window is 15 minutes. Recheck with `get_investec_movement` when you can keep running. If you cannot, say so. |
| Approved but not sent | Keep checking. Do not queue a duplicate because processing is slow. If Investec still needs bank-side authorisation, say that. |
| Expired | The 15-minute window closed. Do not resubmit. A new movement needs fresh user intent, a new create call, a new idempotency key, and a new Telegram approval. |
| Rejected | Stop. Do not resubmit. A new movement needs a fresh request and confirmed parameters. |
| `needs_authorisation` | Report that Investec accepted the movement and still needs bank-side authorisation. Do not bypass it or create a duplicate. |
| Failed | Report the failure and any returned error detail. Do not auto-retry, even if it looks transient. |
| Same idempotency key returns an existing movement | That is the original movement, not a new one. Verify it and report that status. |
| Possible duplicate | Stop before creating another movement. Compare amount, source, destination or beneficiary, references, type, status, and time. Similarity is not proof. Ask if it stays unclear. Do not cancel or reverse an existing movement. |
| Insufficient balance | Stop. Do not change the amount or source. Report the balance and wait for a revised instruction. |
| Beneficiary not matched | Stop. Look up beneficiaries again. Never pick one from a similar name or account number. |
| Source account not found | Stop. Re-list Investec accounts. Never guess an account ID. |
| Transfer destination is not an owned Investec account | Do not silently switch to a payment. Use `banking-payments` only when the user wants to pay an existing beneficiary. |
| Telegram not connected | Stop writes. The user must connect Telegram in BudgetHQ settings. |
| Investec credentials missing | Stop writes until credentials are configured. |
| Verification tool failed | Say verification is incomplete, name the tool, and include its error. Do not use BudgetHQ ledger tools as a substitute, and do not claim success or failure. |
| Multi-step workflow, one stage unclear | Report each stage separately. A successful earlier stage does not make a later stage successful. Do not auto-reverse a successful funding transfer because a later payment failed. |

## Retry

Retry only when the prior outcome is known and the user explicitly wants a new attempt, or when you are replaying the same logical movement with the original idempotency key. Do not retry while a movement is pending, processing, or awaiting bank authorisation. Do not use a BudgetHQ sync delay as evidence that the movement failed.
