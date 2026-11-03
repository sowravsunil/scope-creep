# What I chose, what changed, and what remains

The [PRD](PRD.md) explains the product proposal. This document records the choices behind the prototype and their
limits. Original platform observations came from a Rocketlane trial in October–November 2026 with
`@rocketlane/rli` 1.7.0-beta.29. They are observations from that environment, not permanent platform guarantees.

## The workflow stays with the project

The PM pastes a message into the intake app. A writing model drafts separate asks, and the PM logs them as tasks.
The main app reads the project's SOW, classifies each request, and presents it for a PM decision. A chargeable
request then goes to the customer. Approved work remains on the same task.

Both apps run on Rocketlane's custom-app platform: widgets, server actions, API calls, and key-value storage.
There is no separately hosted application server. Model calls go through OpenRouter. The demo uses fictional
messages and SOW content; real project data would require a separate review of the team's data-handling terms.

## Decisions that shaped the prototype

| Choice | Reason and trade-off |
|---|---|
| Separate extraction from classification | Drafting asks from conversation is a writing task; judging each ask against scope is a classification task. Different checks fit each. Two apps also let intake change independently of approval. |
| Use typed classification with a confidence threshold | Jev returns fixed answers and scores that can be evaluated. I chose 0.6 using the development set because a false change-request flag crossed 0.5 between runs. Confidence is not calibrated, and the PM still decides. |
| Show a SOW reference and a size range | The PM can inspect the relevant scope statement. A range avoids presenting the estimate as a quote. The model can select the wrong SOW item, and the PM sets actual planned hours. |
| Read each project's SOW task | Scope is project-specific. The parser expects an in-scope list and an out-of-scope paragraph; it does not interpret arbitrary contracts. |
| Offer charge, no charge, and decline | Practitioners described deliberately absorbing small asks. The value is making the decision visible, not maximising charges. Credits and deferral remain outside the prototype. |
| Suggest a size guideline rather than enforce it | Reported thresholds ranged from 30 minutes to two hours. Complexity and timeline also matter, so a size rule cannot replace judgment. |
| Keep the request as the delivery task | An earlier version closed the request and created another task. “Completed” next to 28 hours of unstarted work was misleading. The request now becomes CO-00N or NC-00N. |
| Use custom approval for the experiment | I could not find a usable API path for native task approvals in the trial work. This let me test the flow; a product implementation should first investigate extending native approvals. |
| Check when opened | Scheduled runs did not receive the required credentials in my tests, and I found no inbound custom-app webhook. The prototype avoids depending on either. |

## Approval behaviour

Only the project owner can make the PM decision. The customer's role is resolved from Rocketlane's server-side
user context. Internal request views, classification, intake, exports and diagnostics now explicitly require the
project owner. Customers use the portal, and their decision response does not return the internal model record.
These access checks were added during the repository review and have offline regression coverage; the revised
build still needs a trial smoke test.

The prototype offers three sign-off policies:

- **Champion:** the project's customer champion. If none is set, the current implementation falls back to first
  response. A live product should require an explicit choice rather than silently broaden authority.
- **Everyone:** the customer list is captured at PM approval. Every named person must approve; one decline ends
  the round. Current project membership is also checked when someone responds.
- **First response:** the first valid approval or decline from a current customer decides. This policy does not
  freeze a named list, so membership changes can affect eligibility.

Request text is fingerprinted when the PM approves. If it changes before customer sign-off, the request goes
back to the PM. The fingerprint does not cover the SOW, price or all task fields. That fuller approval version is
a requirement for live use, not a capability of the prototype.

A short-lived per-request lock guards decision clicks. Number reservations use conditional writes because KV
increment returned 403 in the trial. Neither is a transaction across storage and the task API. A task move can
succeed before a later rename fails; recovery still needs hardening. Lock expiry during a long operation is
another remaining concurrency risk.

The PM or an approving customer can withdraw an eligible approval. Withdrawal is blocked while the task is In
progress or Completed, but resetting it to To do allows withdrawal. There is no immutable “work started” flag.
Numbers are not deliberately reused while reservation records remain; their one-year TTL prevents a permanent
uniqueness guarantee.

## What I checked on the trial

The original prototype checks covered changed request text before sign-off, repeated approval clicks, customer
visibility of PM rejection reasons, type rechecks after edits, withdrawal while In progress, and missing setup.
The intake app also flags previously logged quotes. Its matching tolerates case, punctuation at the edges,
quotation marks and whitespace; it is not semantic deduplication or exactly-once task creation.

The model evaluation includes a parity check using the SOW as parsed from the live task. It does not measure the
entire workflow or validate permission behaviour. Saved results and their limitations are in
[eval/RESULTS.md](eval/RESULTS.md).

## Platform observations

- Task tabs, project tabs, a customer-portal widget, API calls, key-value storage, and server-provided actor identity
  worked on the trial.
- Scheduled jobs fired after correcting the time unit, but received no API key, empty settings, and storage errors.
  That is why there is no background checker.
- Uploading an update created a new installation during testing, and the portal widget needed to be added again.
  Storage continuity across reinstalls must not be assumed.
- Multi-budget was unavailable, so I did not validate creating a budget line from an approved request.
- Nitro was unavailable. Claims about Signals came from product material, not a trial test. Whether it can feed
  this workflow needs confirmation with the product team.

## Limits that matter

**Commercials:** no price calculation, accepted commercial terms, budget update, invoice, or contract amendment.
Portal sign-off confirms scope and hours only.

**Measurement:** ledger hours are approved estimates. The percentage uses current project budgeted hours, not a
frozen original budget. The app counts stored classifications with differing PM overrides; absence of an override
is not proof of agreement. The PRD's proposed pilot metrics require additional collection.

**Records:** history retains the last 50 events per request, and stored records have a one-year TTL. Exports contain
current decisions and retained events, not an immutable or complete audit archive. Deleted tasks may no longer
appear in the project export. Type corrections retain up to 500 examples and need review before becoming labels.

**Edits and recovery:** direct task edits can diverge from the approval record. The app does not clear an at-risk
flag after a blocker is resolved. Intake can partially create a batch before an API failure, so inspect the project
before retrying. Duplicate hints do not prevent concurrent creation.

**Access:** internal views are limited to the owner in this prototype. Customer access to native task fields and
private notes still needs verification in the target account. API credentials must remain in install settings;
the local `.env` and generated platform state do not belong in the repository.

The next step is to validate the target segment and close the commercial-approval and record-integrity gaps before
using the workflow on real customer projects. More automation would not settle those questions.
