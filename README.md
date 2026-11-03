# Scope creep: making the change request decision explicit

A customer asks for one more thing halfway through implementation. Is it in the SOW? Should the team charge,
absorb it, or say no? And what did the customer actually approve?

I built two Rocketlane custom apps to explore that decision. The PM logs a request from a conversation, checks it
against the project's scope, and records a decision. Customer sign-off turns the request into tracked work.

**Independent PM portfolio project by Sowrav Sunil.** Built and tested on a Rocketlane trial with fictional project
data. No live customer rollout or business-impact results. The prototype records scope and hours, not an agreed
price, invoice, or contract amendment.

## Start here

- [Product brief](PRD.md): the problem, evidence from five delivery practitioners, priorities, and validation plan.
- [Decisions and trade-offs](DECISIONS.md): what I chose, what changed while building, and where the prototype stops.
- [Evaluation](eval/RESULTS.md): labelled examples, saved model outputs, mistakes, and threshold selection.

## What the prototype does

1. **Capture the ask.** The PM pastes a message. A writing model drafts one request per ask with a source quote.
   Quotes are checked against the message, and previously logged asks are flagged for the PM to review.
2. **Check the scope.** When the PM opens the request list, Jev classifies requests against that project's SOW:
   in scope, change request, blocker, or noise. It supplies a SOW reference, rough size, and confidence score.
3. **Make the decision.** The PM chooses charge, no charge, or decline, and sets the hours. A configurable size
   guideline suggests an option. The PM decides on every request, including high-confidence results.
4. **Get sign-off.** A chargeable request goes to the customer portal. The customer sees the request, hours, PM
   note, and approval rule. Commercial approval remains separate.
5. **Track the work.** The same task becomes CO-001 or NC-001 in “Approved changes”. The ledger shows agreed
   change-order hours and approved no-charge hours. Current decisions and retained history can be exported.

## Why I built it this way

Five people who deliver implementation work described informal requests and unwritten rules for absorbing small
asks. One partner uses prepaid credits; another said their existing process was sufficient. That pushed me toward
recording a deliberate decision, rather than treating every extra request as something to bill.

The strongest constraint from those conversations was that customers approve **commercials**, not just effort.
The prototype does not complete that step. Capturing the accepted amount and binding approval to the full request
version would come before live use.

I used a writing model for extracting asks and a typed decision model for classification. The two jobs need
different checks: source-quote validation for the first, labelled evaluations for the second. Neither model
approves work. I kept the workflow inside Rocketlane so the request, decision, and delivery task stay together.

Rocketlane already has native approvals and describes scope detection through Nitro Signals. I could not test
Nitro or multi-budget on the trial. This is an exploration of how the steps could connect, not a claim that
Rocketlane has no approval workflow.

## What the evaluation shows

On the latest saved run, the model classified **46 of 48 synthetic requests correctly** and identified all 17
labelled change requests. At the 0.6 confidence threshold, 45 requests met the threshold with no type errors
among those 45; three were flagged for closer review. The PM still makes every business decision.

I reviewed the labels, which were drafted with AI help, and selected the threshold on the same development set.
These are not production-accuracy results. A separate 15-request logistics set is awaiting blind labels.
[The evaluation write-up](eval/RESULTS.md) includes the two mistakes, earlier runs, and sizing limitations.

You can inspect the saved results without keys, installation, or API calls. With Node.js installed:

```bash
npm run eval:saved
npm test
```

## Try it locally

[Setup instructions](docs/SETUP.md) cover installing dependencies, preparing a trial project, building both apps,
and running evaluations. Setup and live evaluations require your own accounts and keys; the offline commands
above do not.

| Path | Contents |
|---|---|
| [app/](app/) | SOW checks, PM decisions, customer sign-off, ledger, and retained history |
| [intake/](intake/) | Message-to-request drafting and logging |
| [core/](core/) | Shared model calls, classification questions, and SOW parser |
| [eval/](eval/) | Development labels, raw runs, evaluation script, and unlabelled holdout |
| [tests/](tests/) | Offline regression checks for access boundaries and evaluation behaviour |
| [rl.py](rl.py), [seed.py](seed.py) | Trial setup and fictional Northwind project |

## Current limits

The prototype works in estimated hours. It does not calculate prices, change budgets, send its own notifications,
or ingest conversations automatically. The SOW parser expects a specific list format. Direct task edits can drift
from the app's record. History retains the last 50 events per request, and storage has a one-year TTL; this is not
a permanent audit archive. Platform permissions and the revised app builds still need a trial smoke test before
a new demo recording. [DECISIONS.md](DECISIONS.md) distinguishes tested behaviour from remaining gaps.
