# Holdout set: label these blind

A second project in a different industry, used only to test the 0.6 threshold that was picked on the Northwind set.
Nothing here is used to tune anything. Label before looking at any model answers (there are none yet).

**Project:** Fernway Logistics, a dispatch and proof-of-delivery rollout. Fixed fee $36,000, 240 hours, go-live Feb 2.

**In scope (SOW items):**

| Key | Item |
|---|---|
| item_1 | Driver app set up for 2 regions (North, South), up to 150 drivers |
| item_2 | 3 job types: pickup, delivery, return |
| item_3 | Nightly route import from the customer's TMS by CSV |
| item_4 | Proof of delivery: photo and signature on every job |
| item_5 | 2 dispatcher dashboards: live jobs and late jobs |
| item_6 | SAP integration: one-way order status sync, SAP to the app |
| item_7 | Migration of 12 months of delivery history |
| item_8 | 3 training sessions: one for dispatchers, two for drivers |

**Out of scope:** customer-facing tracking page, invoicing, warehouse management, additional regions.

## For each request in `requests.json`, decide

- **kind:** `in_scope`, `change_request`, `blocker`, or `noise`
- **sowItem:** the key above it's about, or `none`
- **size** (change requests only, optional): `under_1`, `1_4`, `4_16`, `16_40`, or `over_40`
- **clarity:** `clear` or `ambiguous` (if ambiguous, one line in `note` on why you chose that label)

The quickest way, including from a phone: reply in chat with one line per request, like
`h01 in_scope item_4 clear` or `h10 change_request item_2 4_16 ambiguous: a fourth job type, even if small`,
and transfer them into the file.

Then: `node eval/run-eval.js --set holdout` (about $0.001), with the threshold frozen at 0.6.
