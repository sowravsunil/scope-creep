# PRD: Change request decisions in Rocketlane

**Sowrav Sunil · 3 November 2026 · Prototype v1.5, with local review updates**

An independent product exploration built as two Rocketlane custom apps. The prototype runs on a trial account with
fictional project data. It has not been used on live customer projects. This document explains the problem,
product choices, what I built, and what I would validate before taking it further.

## Problem

Halfway through a project, the customer asks for more: "while you're in there, can you quickly also...". Someone
has to decide whether it's covered by the SOW, whether to charge for it, and who needs to agree. That decision
can stay in a PM's head, a call, or an email thread. The team struggles to account for the extra work it absorbs,
and the customer may not remember agreeing to a charge.

I asked five people who deliver implementation work: two implementation partners in conversation in October,
and three more in writing, including an independent consultant. Their answers shaped the prototype:

- **Small asks are often absorbed.** Where people named a threshold, it ranged from 30 minutes to two hours of
  simple work. Whether it needs development or affects the timeline also matters. One partner absorbs most asks
  because its money comes from licences.
- **Requests start informally.** Calls and DMs come first; email or a formal change request follows.
- **Customers approve commercials.** One partner said: "We proceed only after receiving the customer's
  confirmation and approval of the commercials."
- **Extra effort is hard to account for.** One said: "We do not currently maintain a separate tracker for
  additional requests or distinguish between free and chargeable activities." Another estimated that 5–10% of
  project hours go unpaid. That is one person's estimate, not a market benchmark.
- **Charge or free is not the whole picture.** One partner uses prepaid maintenance credits, then quotes the
  remainder or moves it to a later phase. That partner also needs approval from two people on each side.

The evidence is useful but narrow: four of the five are implementation partners. It does not yet establish that
in-house SaaS services teams have the same needs. One partner said their existing process was sufficient for
their company size.

## Who this is for

The initial target is a delivery PM running several fixed-fee or SOW-based implementation projects. They need to
make a quick, defensible call on extra work. The customer approver needs to know what they are agreeing to, and
the delivery head needs a record of the extra work the team has committed to absorb.

My hypothesis is that the value grows with concurrent project volume. Small teams with a working manual process
are a weaker starting segment. I have not validated a project-count threshold.

## Where it fits

Rocketlane already has task approvals, and multi-budget supports change orders. Its published material describes
Nitro Signals identifying scope-related conversations. This proposal focuses on the decision between a request
being raised and extra work being authorised: check it against the project's SOW, size it, record the PM's call,
and collect customer approval where needed.

I could not test Nitro or multi-budget on my trial. The prototype therefore uses pasted messages and ends at an
approved task. It does not establish that Rocketlane lacks every part of this workflow. In the product, I would
first look to extend native approvals and budgets. The custom apps let me test the proposed experience within
the access I had. Platform findings and trade-offs are in [DECISIONS.md](DECISIONS.md).

## Goals and boundaries

The product should make three things possible:

1. Every out-of-scope request gets a recorded decision: charge, no charge, or decline.
2. The team can see the estimated hours it has agreed to absorb, by project.
3. The customer and PM can trace an approval to the same request and hours, including later changes.

The model helps classify and size the request. It never authorises work or sets the price; the PM decides.
A false change-request flag is especially costly because it can lead to asking a customer to pay for work their
SOW already covers.

The prototype does not detect requests in calls, calculate prices, update budgets, invoice customers, or amend
contracts. It supports one English SOW per project. Its ledger measures approved estimates, not actual effort,
revenue, or margin.

## Proposed experience

The PM pastes a customer message into **Log a request**. The app drafts one task per ask, quoting the customer's
words, and the PM reviews the drafts before logging them.

When the PM opens **Change requests**, the app checks each request against the project's SOW. It shows a type,
the relevant SOW item, a rough size, and confidence. Below 0.6, it marks the request **Needs review**. In-scope
work and blockers stay in normal project delivery; confirmed extra work needs a business decision.

The PM chooses charge, no charge, or decline. A team setting, such as "no charge under two hours", suggests an
option without enforcing it. The PM sets the hours. A chargeable request goes to the customer for sign-off;
no-charge work is approved internally; a declined request carries a reason the customer can see.

Once agreed, the request itself becomes the work: CO-001 or NC-001, with its hours, in **Approved changes**.
Keeping one task avoids marking a request complete while its delivery work has not started. The project ledger
and export retain the decision history.

## Prototype requirements and status

The core flow was built and tested on the trial with throwaway requests. Local review updates clarify ledger
labels and restrict internal views to the project owner; these have not yet been smoke-tested on the trial.
Detailed implementation notes and limits are in [DECISIONS.md](DECISIONS.md).

| Requirement | Implemented behaviour |
|---|---|
| Capture the customer's ask | One draft per ask, with a source quote. Drafts with quotes absent from the source are dropped. A thank-you produces no request. Already logged asks are flagged; the original message is kept in a team-only note. |
| Check the project's scope | Read the project's “SOW scope” task. Return in scope, change request, blocker, or noise; a SOW reference; a size range; and confidence. Below 0.6, show “Needs review”. Mark blockers at risk. |
| Keep the PM responsible | Only the project owner can decide. Charge and no charge require hours; decline requires a reason. Record the decision and whether it followed the team's size guideline. |
| Collect customer sign-off | Support champion, everyone, or first-response rules. Capture named approvers for champion and everyone policies; first response uses current customer membership. Champion falls back to first response if no champion is set. Only eligible customer approvers see the controls. |
| Handle changes and repeated actions | Changed request text before customer sign-off returns the request to the PM. Concurrent clicks are guarded. Approved tasks can be withdrawn while not in progress, and numbers are not deliberately reused while reservation records remain. |
| Turn the decision into work | Rename the same task CO-00N or NC-00N, set the agreed hours, and move it to “Approved changes”. Keep the customer's words on the task. |
| Make decisions visible | Show change-order and no-charge hours against budgeted hours. Export current decisions and retained events with actor and timestamp (up to 50 events per request). Keep model scores out of the customer-facing app. |

### What the prototype does not yet prove

**Hours are not commercial approval.** The portal currently approves scope and hours. It does not capture an
agreed price or change the contract value. Before live use, I would require an amount, currency, and evidence of
accepted commercial terms, either in the product or through the team's existing approval process. Rate-card
calculation can follow; evidence of commercial approval cannot.

**Approval needs to cover the whole version.** The current edit check covers request text. Live use would need
to bind scope, hours, commercial terms, SOW version, and named approvers. Changing any of these before work starts
should invalidate the relevant approval and return the request to the PM. Changes after work starts need a
separate recorded amendment. Moving a task back to “To do” should not erase the fact that work began.

**Some approval rules need further verification.** The code implements: under “everyone”, all must approve and
one rejection ends the round; under “first response”, the first eligible approval or rejection decides. Replacing
an approver should start a fresh round; that still needs implementation. Silence leaves the request pending. These cases need explicit testing before
live use, alongside stale responses and recovery from partial failures.

**The ledger is a record of commitments.** The revised labels are “Agreed change-order hours” and
“Approved no-charge hours”; withdrawn decisions are excluded from these totals. Pending requests remain in the
request list. The current percentage uses current budgeted hours, with no percentage for missing or zero budgets. For a pilot,
I would freeze the original budget as the baseline so later budget changes do not hide earlier commitments.

Direct edits to task fields can drift from the app's record. The app also checks requests when opened, not in the
background, and does not send its own notifications. Those limits need reconciliation checks and a reliable
follow-up process before a live trial.

## What I tested

The development set contains 48 synthetic retail requests, including 11 deliberately ambiguous examples. Labels
were drafted with AI help and reviewed by me. The original two runs and a check using the live SOW each classified
46 of 48 correctly and identified all 17 labelled change requests.

At a 0.6 threshold, 44 requests met the confidence threshold with no type errors among them; four were flagged
for closer review. The 3 November run, after introducing five size ranges, had the same 46 of 48 type accuracy,
with 45 above the threshold and no type errors among those 45. The PM still decides on every request.

I chose 0.6 using this same development set: a false change-request result crossed 0.5 between runs. These results
show the approach works on these examples, not that it is 96% accurate on customer traffic. Confidence has not
been calibrated as a probability of correctness. Sizing is only a rough aid: the latest run matched the labelled
size range 59% of the time. Full results are in [eval/RESULTS.md](eval/RESULTS.md).

The next test is the 15-request logistics holdout. Labels must be fixed without viewing model output, with the
model, prompts and threshold frozen before the run. I would report error counts, especially confident false
change requests, and how many requests need review. Any confident false change request needs investigation
before a customer trial. If I tune on this set, it becomes a regression set; a fresh set is needed for independent
validation. Fifteen examples alone cannot establish readiness for production.

## How I would measure value

I would propose a four-week trial across three suitable projects, with three recent projects from the same team
as a baseline. This is a validation plan, not a committed rollout. Project stage, size and complexity would need
to be recorded; using the same team does not remove those differences.

| Measure | How I would use it |
|---|---|
| Decision coverage | Share of confirmed out-of-scope requests with a recorded charge, no-charge, or decline decision. Review project conversations independently each week, then reconcile them with the app so missed requests count in the denominator. An initial hypothesis is 90% coverage. |
| Time to PM decision | Median working time from logging to decision, with an initial hypothesis of two working days or less. Also report requests still pending and the delay between the original ask and logging. |
| No-charge visibility | Approved no-charge estimated hours for each project, as a share of original budgeted hours. Actual unpaid effort would need time-tracking data. |
| Classification errors | Compare model types with explicit PM scope judgements, then review disagreements. Track confident false change requests separately. A no-charge business decision is not automatically a model correction. |
| Approval integrity | Check that approved work matches the approved version and commercial evidence, with no unauthorised or duplicate approvals. |

The coverage and turnaround targets are starting hypotheses. I would agree them with the participating team
before testing, and report counts alongside percentages. Low request volume or inaccessible conversations would
limit the conclusion. A customer being asked to approve work already covered by the SOW would require the affected
flow to pause and the cause to be addressed.

The next investment depends on whether PMs consistently use the flow, missing decisions become visible, and
approvals remain trustworthy. Invoice disputes and margin impact need a longer observation period. A four-week
trial should not claim to prove either.

## What I would validate next

**Does the need carry over to Rocketlane's services customers?** I would speak with three to five in-house
onboarding or professional services teams and walk through recent real requests, including ones they absorbed.
That would test the segment assumption and whether the added decision step earns its place in their workflow.

**Where should the approval live?** My starting preference is to extend native approvals and connect the result
to a change-order budget. I would review the existing workflow with Rocketlane's product team before proposing
a separate approval system. My trial access was not enough to settle this.

**What constitutes approval for the customer?** I would inspect the team's actual change-control process: who
can approve, whether email is sufficient, and when a signature is required. The prototype's portal click should
not be presented as a substitute for those terms.

## Priorities after validation

1. **Commercial terms and approval integrity.** Capture accepted price and evidence, bind approvals to a complete
   version, and reconcile direct task edits. These come before live commercial use.
2. **Rate cards and budget connection.** Reduce manual entry and link approved work to its financial record.
   Multi-budget access is needed to test that path.
3. **Credits, deferral and internal approval limits.** Research surfaced these needs, but their priority depends
   on the target team's process and frequency of use.
4. **Signals integration and background checks.** Reduce manual intake once project linkage and platform access
   are available. The prototype does not depend on that integration.
