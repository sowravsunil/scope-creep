# PRD: Change request decisions in Rocketlane

**Sowrav Sunil · November 2026 · Prototype: two Rocketlane custom apps, v1.5**

## Problem

Mid-project, customers ask for more: "while you're in there, can you quickly also...". Someone has to decide, on the
spot, whether it's covered by the SOW, whether to charge for it, and who agreed. Today that decision lives in a
PM's head, a call, or a chat thread.

I asked five people who deliver implementation work: two implementation partners in conversation in October, and three more
in writing (two implementation partners and an independent consultant). They agree on four things:

- **Everyone has a line between "do it free" and "charge for it", and nobody writes it down.** For two of them it's
  about 30 minutes to 2 hours of simple work: "simple frontend configurations that do not require technical
  resources". One absorbs most asks because its money comes from licences.
- **Requests start informally**, on project calls or in DMs, and get formalised by email afterwards.
- **The customer approves the commercials**, not just the effort: "We proceed only after receiving the customer's
  confirmation and approval of the commercials."
- **Free work is invisible.** "We do not currently maintain a separate tracker for additional requests or distinguish
  between free and chargeable activities." One estimates 5-10% of project hours goes free.

They'd trust a tool that lives where the work already happens, keeps a clear audit trail, and causes no surprise
charges.

Two more things came up. Outcomes are richer than charge or free: one partner draws extra work from the customer's
prepaid maintenance credits, and quotes it or moves it to a later phase when the credits don't cover it. And
approval often needs two people on each side: the customer's project owner and sponsor, and our PM and delivery
director.

## Who it's for

Delivery and implementation PMs running several fixed-fee or SOW-based projects at once in Rocketlane, and the
customer's approver. Not small teams with a working manual process: one partner said the idea is helpful, "but for
our company size, we are okay with... the process that we currently build". The value grows with the number of
projects whose free work nobody adds up.

## What Rocketlane has today

Nitro Signals can flag scope talk in calls and emails. Tasks have generic approvals. Change orders can live as extra
budgets (multi-budget). What's missing is the step in between: judging a request against this project's signed
scope, sizing it, deciding charge vs no charge vs no, and turning "yes" from both sides into tracked work.

## What I built

Two custom apps, running on Rocketlane's own app platform:

0. **Log.** Requests start in calls, chats and emails. The PM pastes the message into a "Log a request" tab; a
   writing model drafts one request per ask, each quoting the customer's exact words (checked in code), and flags
   asks that are already logged. The PM edits and logs them into the project's "Customer requests" phase.
1. **Check.** Each request in the project's "Customer requests" phase is checked against the project's SOW task by a
   decision model (Jev): in scope, change request, blocker, or noise, plus the SOW line it touches, a rough size,
   and a confidence. Below 60%, the PM decides. Blockers are marked at risk.
2. **Decide.** The PM charges for it (sent to the customer), does it at no charge (logged, no sign-off), or rejects it
   with a reason. A per-team line ("no charge under 2 hours") suggests which; the PM decides and the history notes
   whether it matched.
3. **Sign off.** The customer approves in the portal. Who counts: the project's customer champion, every customer, or
   the first to respond. An edit after the PM's approval sends it back to the PM.
4. **Turn it into work.** The request itself becomes CO-001 or NC-001 in "Approved changes", with the agreed hours.
   Withdrawable until work starts; numbers are never reused.

## How I'll know it works

- **North star:** share of out-of-scope requests that get a deliberate, recorded decision (charged or no charge).
- **Supporting:** hours charged vs given away per project; time from request to decision; PM agreement with the
  check (tracked in the app; a drop means new kinds of request or a vague SOW).
- **Guardrail:** false "change request" flags the PM overrides. Each one risks asking a customer to pay twice.
- **Pilot:** three live projects with the app vs three recent ones without, same team.

## Does the check hold up?

| Set | Result |
|---|---|
| 48 retail requests I labelled (11 deliberately ambiguous) | 46/48 types right in every run, 17/17 change requests caught, 1 false flag |
| At the 0.6 confidence bar | 44/48 handled alone, 0 mistakes, 4 sent to the PM |
| Same 48, SOW read from the live Rocketlane task | Same result |
| 15 logistics requests, labelled blind, threshold frozen | Pending |

The 0.6 bar was picked from the data: at 0.5 a false change request slipped through when its confidence moved from
0.49 to 0.52 between runs. All requests are mine, so these numbers say "it works on this kind of request", not
"it's 96% accurate on real traffic".

## Limits and risks

- **Hours, not price.** The customer approves hours; rate cards aren't applied.
- **No budget line.** Multi-budget isn't enabled on my trial, so an agreed change doesn't touch the budget.
- **Checked when opened, not in real time.** Custom apps can't receive webhooks, and scheduled jobs run without
  credentials (I tested both). A Rocketlane notification brings the PM to the request.
- **One request, one change order.** A message with three asks needs splitting first.
- **The app's record is the source of truth.** Editing its task fields directly in Rocketlane isn't picked up.
- **Only the project owner acts as PM**, and sign-off is a recorded click, not a contract amendment.

## Next

1. Price: hours × the project's rate card, shown to the PM before approving and to the customer at sign-off.
   The partners who charge all said the customer approves commercials, not hours.
2. Two more outcomes: draw from prepaid credits (with the balance visible to both sides), and defer to a later phase.
3. Approval on our side too: a second internal approver (e.g. the delivery director) above a size limit, and named
   pairs on the customer's side (owner and sponsor). The "every named customer" rule already covers the second.
4. The line isn't only hours: partners also ask "does it need development?" and "does it change the timeline or core
   functionality?". A second model question could check that.
5. Budget line per change order when multi-budget is on.
6. Signals as an input: a flagged call becomes a request without the paste (Signals has no webhook or project link today).
7. Notifications, read-only decision fields, and splitting multi-ask requests.

## Open questions for Rocketlane

- Is multi-budget the intended home for change orders, and should the approval live on the budget itself?
- Could custom apps subscribe to task events, or run scheduled jobs with credentials?
- Where does this sit relative to Nitro: a feature of Signals, or its own agent?
