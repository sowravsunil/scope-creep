# Eval results: sorting customer requests with Jev

Run on 2026-10-31 with `typesafe/jev-1.14`, two full runs over the same 48 requests.
Raw answers: `results/run-2026-10-31T07-31-56-778Z.json` and `results/run-2026-10-31T07-32-23-889Z.json`.
Re-score either for free with `node eval/run-eval.js --from <file>`. (These runs used four size ranges; re-scored
against today's five-range labels, their size numbers drop. Type and SOW numbers are unchanged.)

**Labels:** drafted with AI help, reviewed by me on 2026-10-31. I confirmed the two the model disagreed with:
r18 (recording the training) is in scope, r41 (legal hold on SLAs) is a blocker. The other 9 ambiguous labels kept
as drafted. If I change a label later, re-score the saved runs; no new calls needed.

## The set

48 requests for the fake Northwind Retail project, checked against its SOW (8 in-scope items, 4 out of scope).
17 change requests, 15 in scope, 8 blockers, 8 noise. 11 are deliberately ambiguous ("can you quickly also...").

## Results

| | Run 1 | Run 2 |
|---|---|---|
| Request type correct | 46/48 (96%) | 46/48 (96%) |
| Clear requests | 37/37 | 37/37 |
| Ambiguous requests | 9/11 | 9/11 |
| Change requests caught | 17/17 | 17/17 |
| Change request flags that were right | 17/18 | 17/18 |
| SOW item correct | 45/48 | 45/48 |
| Size bucket exact / within one bucket | 59% / 100% | 65% / 100% |
| Cost for 48 requests | $0.0023 | about the same |

The type answer didn't change for any request between runs. Confidence moved by up to 0.06.

The two mistakes, both on requests I'd marked ambiguous:
- r18, "can you record the agent training": I said in scope, Jev said change request (confidence 0.49, then 0.52).
- r41, "hold off on the SLA build, legal hasn't signed off": I said blocker, Jev said in scope (0.43).

## Picking the threshold

The app only acts on its own when Jev's confidence in the request type is at or above a cut-off. Below it, the
request goes to "Needs review" for the PM.

| Cut-off | Handled automatically | Mistakes among those | False change requests |
|---|---|---|---|
| 0.5 | 92% / 96% | 0 / 1 | 0 / 1 |
| **0.6** | **92% / 92%** | **0 / 0** | **0 / 0** |
| 0.7 | 90% / 90% | 0 / 0 | 0 / 0 |
| 0.8 | 85% / 85% | 0 / 0 | 0 / 0 |

I picked **0.6**. At 0.5 the r18 false flag got through in run 2 when its confidence went from 0.49 to 0.52, which
is within the run-to-run wobble. 0.6 leaves room for that wobble and still lets the app handle 44 of 48 requests.
A false change request is the worse mistake here: it means telling a customer to pay for work they already paid
for. So a slightly higher cut-off that sends a few more requests to the PM is the right trade.

The four requests sent to review at 0.6: both mistakes above, plus two correct change requests with lower
confidence (r20, older Zendesk attachments; r26, a fourth agent group).

## What didn't work

- **The "needs review" signal.** It averaged 0.59 on clear requests and 0.71 on ambiguous ones, and the ranges
  overlap a lot. Gating on it would send most clear requests to a person for no gain, so it's shown to the PM
  but not used to decide.
- **Exact size.** The bucket was right only 59-65% of the time, but never off by more than one. The app shows it
  as a rough range and the PM sets the real hours.
- **SOW item on noise and blockers.** The three misses were requests that mention forms ("the forms look good
  now", a sandbox outage blocking the forms review, a CSAT survey "while you're configuring the forms"). Jev
  pointed at the forms item; I'd labelled them "none". Arguably my labels are too strict.

## Parity check: the SOW as the app reads it

The runs above give Jev the SOW from `core/sow.js`. The app reads it from the project's "SOW scope" task with
`core/parse-sow.js`, and the wording differs slightly (no go-live date, brackets instead of colons). Run 3 used the
live task through the app's parser (`run-...-sowlive.json`, `node eval/run-eval.js --sow-live`):

| | Runs 1-2 (fixture SOW) | Run 3 (live SOW, app parser) |
|---|---|---|
| Request type correct | 46/48 | 46/48, same two mistakes |
| Change requests caught | 17/17 | 17/17 |
| Handled automatically at 0.6, mistakes | 44/48, 0 | 44/48, 0 |
| SOW item correct | 45/48 | 43/48 |

So the eval measures what the app runs. One thing to watch: r18's confidence was 0.49 and 0.52 in runs 1-2 and
0.55 in run 3. Still under 0.6, but close. The holdout set (below) is the real test of the threshold.

## Five size ranges (v1.4, Nov 3)

Partners put the free-vs-charged line at 30 minutes to 2 hours, so "under 4 hours" was too coarse. The size question
now has five ranges: under 1h, 1-4h, 4-16h, 16-40h, over 40h. Two of my size labels moved from "under 4" to "1-4"
(r27, a third inbox; r28, one more training session). Re-run with the live SOW (`run-2026-11-03...-sowlive.json`):
type still 46/48 with the same two mistakes, all 17 change requests caught, 45/48 handled at 0.6 with no mistakes,
size 59% exact and 100% within one range, SOW item 44/48. r18 at 0.53, still under the bar.

## Small asks are the grey zone

Checking demo candidates on Nov 3, every tiny ask ("add one more canned response", "an auto-reply on orders@", "a
holiday banner on the form") came back between 0.39 and 0.59 confidence, so the app sends them to the PM as
"Needs review". That matches what partners said: small config tweaks are where a person makes the call, and the
free-vs-charged line does the rest. Not a formal result (a handful of requests, not labelled in the set), but worth
a test set of its own.

## Limits of this eval

- 48 requests, all written for this test, by the same process that wrote the questions. Real customer messages are
  messier, so treat these numbers as "it works on this kind of request", not as production accuracy.
- One project and one SOW. A vaguer SOW would mean lower confidence and more reviews.
- Two runs. The pattern was stable, but more runs would tighten the wobble estimate.
