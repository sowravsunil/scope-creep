# How it's built and why

The decisions behind the two apps, what I found out about Rocketlane's custom app platform along the way, what the
apps handle at the edges, and what they don't do. The README has the overview; `eval/RESULTS.md` has the numbers.

## The shape

```
 Call, chat or email
        |  PM pastes it into "Log a request"            (intake app)
        v
 Writing model drafts one request per ask, quoting the customer's words
        |  PM edits, logs
        v
 Task in the project's "Customer requests" phase
        |  someone opens the Change requests tab or the request    (main app)
        v
 Jev checks it against the project's "SOW scope" task:
 type, SOW line, size, confidence  -> fields on the task, "Needs review" below 0.6
        |
 PM decides: change order / no charge / reject       (size line suggests which)
        |
 change order: customer signs off in the portal (champion, everyone, or first)
        |
 The request becomes CO-00N or NC-00N in "Approved changes", with the agreed hours
```

Everything runs inside Rocketlane's app platform: server actions for the logic, the app's key-value store for records
and history, widgets for the project tab, the task tab and the customer portal. No servers of my own.

## Decisions

| Decision | Instead of | Why |
|---|---|---|
| **A decision model (Jev) for the check** | A chat model or an agent | Every answer is one of a fixed set of options with a probability, so it can be tested, thresholded and audited. Near billing, that matters more than prose. |
| **Ask which SOW line and a size range** | A written reason and exact hours | A pointer to the SOW line is quicker for a PM to check than a paragraph. Exact hours would be false precision; the PM sets the real number. |
| **Threshold from the eval (0.6)** | A round guess | At 0.5 a false "change request" got through when its confidence moved between runs. A false change request means asking a customer to pay for work they already paid for, so it's the mistake to avoid. |
| **Each project's SOW comes from that project** (its "SOW scope" task) | One SOW in code | Any project with a written scope works. The eval's fixed SOW was checked against the live task through the app's parser (same result). |
| **The PM decides before the customer sees anything** | Customer first | The PM checks it's worth doing and sized right before hours go to the customer. |
| **Three decisions: change order, no charge, reject** | Bill every change | Every team I spoke to does small asks free. The job is a consistent, recorded decision, not more billing. No-charge work is logged with its hours, so the team knows what it gives away. |
| **A size line that suggests, not decides** ("no charge under 2 hours") | An automatic rule | Teams put the line at 30 minutes to 2 hours, but also judge by kind of work. So the line highlights a button; the history records whether the PM followed it. |
| **Sign-off rule is a setting**: customer champion (default), everyone, or first to respond | First to respond for everyone | Change-control clauses name an authorised person, sometimes several. The champion is Rocketlane's own project role. The rule and the approvers are fixed when the PM approves. |
| **One task**: the request itself becomes CO-00N or NC-00N | A separate delivery task | A closed request next to 28 hours of unstarted work read as done. One task has one status, and the customer's words stay on the work. |
| **Withdraw until work starts; numbers never reused** | Free edits | A reversed decision leaves a clean history. Once the task is In progress, withdrawing has to be a deliberate step back. |
| **Every PM correction is logged and becomes an eval case** | Corrections fix one task | No training needed, but the test set grows from real disagreements. The agreement rate shows drift (new kinds of request, a vague SOW). |
| **Intake as a second app, with a writing model** | Reading chats automatically; one model for everything | Requests start in conversation, not as tasks. Writing (pulling asks out of a messy chat) and deciding are different jobs. The writer must quote the customer; any quote not found in the message is dropped in code. Its confidence can't be thresholded, Jev's can. A separate app also keeps intake changes from touching the main app. |
| **Checked when opened, decisions on the click** | A background sweep or webhooks | The platform doesn't allow either (below). A Rocketlane automation can notify the PM that a request arrived; the app does the thinking when it's opened. |
| **Classification fields are private** | Visible to everyone | A customer seeing "Noise" or a confidence score on their own request would be a bad look. The portal shows the request, hours and note only. |
| **Fake company and data only** | Real examples | The repo and demo are public. |

## What I found out about the platform

Custom apps were the right home for this, but the docs were thin, so I tested with small probe apps before building.
Findings, as of `@rocketlane/rli` 1.7.0-beta.29 on a trial account (Oct-Nov 2026):

- **Works:** key-value storage, outbound HTTPS, the Rocketlane API with the installed key, task and project tab
  widgets, a customer portal widget, and server actions that receive the clicking user from Rocketlane (so roles can
  be checked on the server, not trusted from the browser).
- **KV increment returns 403.** Change order numbers are claimed with a write-if-absent key per number, then read
  back to confirm.
- **No inbound webhooks to a custom app.** There's no URL to point a Rocketlane webhook at, and no server-side task
  events.
- **Scheduled jobs run, but without credentials.** The scheduler reads `scheduledAt` in milliseconds (the docs say
  seconds). With that fixed, jobs fire on time, but a scheduled run gets no API key, empty install settings and a 401
  from storage. I only told "never ran" apart from "ran and crashed" with an outside heartbeat. So: no cron.
- **Every upload re-runs install** with a new installation, and the customer portal widget has to be re-added to the
  portal page afterwards.
- **The customer champion can only be set when the project is created** through the API.
- **Multi-line budgets** weren't enabled on the trial, so a change order can't become a budget line here.
- **Nitro Signals** are account-level, not linked to a project, with no webhook or structured output, so a person
  bridges a signal to a project today. That's what the intake tab is for.

## Edge cases handled

All tested against the trial on throwaway requests.

- **Edited after the PM approved:** the PM approves a fingerprint of the request text. If it changes before sign-off,
  it goes back to the PM, and the customer sees "back with your PM".
- **Double clicks and two people at once:** one change at a time per request (a short-lived lock key). The second
  click is told someone else is updating it.
- **Rejections reach the customer**, with the reason.
- **Edited requests are re-checked** when opened, unless they're already with the customer or agreed.
- **Small asks from "Needs review":** the PM's charge or no-charge decision counts as the review and is logged as a
  correction, instead of forcing a type change first.
- **The same chat logged twice:** asks already logged in the project are flagged, matched on the customer's words.
- **Missing setup** (no requests phase, no SOW task, no keys): a message the PM can act on, not a blank tab.

## What I asked people

Five people who deliver implementation work: two implementation partners in conversation, two more in writing, and
an independent consultant. Same six questions; anonymised here.

- **Everyone has a line between "do it free" and "charge for it", and it lives in someone's head.** Where people
  named it, it was 30 minutes to 2 hours of simple work that needs no development.
- **Requests start informally**, on calls or in DMs, and get formalised by email later.
- **Customers approve the commercials**, not just the effort.
- **Free work is mostly invisible.** One estimated 5-10% of project hours goes free.
- **Outcomes are richer than charge or free:** one partner draws extra work from prepaid maintenance credits, and
  quotes it or moves it to a later phase when credits don't cover it.
- **Approval often needs two people per side:** the customer's owner and sponsor, and the vendor's PM and delivery
  head.
- **Small teams with a working manual process are a weak fit**, said directly by one partner. The value grows with
  the number of projects running at once.

What changed because of it: the no-charge decision, the size line, the "under 1 hour" size range, the ledger of hours
charged vs given away, the audit export, and the intake step. Credits, a later phase and internal approval chains are
in the PRD's next steps, not built.

## Limits

1. **Hours, not price.** Rate cards aren't applied.
2. **No budget line.** Multi-budget wasn't available, so an agreed change doesn't touch the budget.
3. **Not real time.** New requests are checked when someone opens them.
4. **Logging is a paste.** Nothing reads calls or chats on its own.
5. **One request, one change order.** A request with three asks has to be split first.
6. **The app's record is the source of truth.** Editing its task fields directly in Rocketlane isn't picked up, and
   skews the agreement rate.
7. **Only the project owner acts as PM.** Sign-off is a recorded click, not a contract amendment.
8. **No notifications from the app itself.** A Rocketlane automation can send them.
9. **"At risk" isn't cleared** when a blocker is resolved or re-checked.
10. **The eval is small and mine.** 48 requests I wrote and labelled; a held-out set in another industry is waiting
    for blind labels.
11. **Jev is a hosted, closed model.** It sits behind one function, so it can be swapped.
12. **One SOW per project, English only.**
