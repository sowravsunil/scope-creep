# Change request checker for Rocketlane

A Rocketlane custom app for the moment every services team knows: a customer writes "while you're in there, can you
quickly also...". It checks the request against the project's signed SOW, lets the PM decide (charge for it, do it at
no charge, or reject it), gets the customer's sign-off when it's charged, and turns the decision into the work itself:
a numbered change order (CO-001) or no-charge work (NC-001), with a full trail of who agreed to what.

It runs entirely on Rocketlane's own app platform. No servers.

## How it works

0. **Logged from the conversation.** Requests start in calls, chats and emails, not as tasks. In the "Log a request"
   tab (a second app, `intake/`), the PM pastes the message; a writing model (Claude Haiku) drafts one request per
   ask, each quoting the customer's exact words. Any ask whose quote isn't in the message is dropped, checked in code.
   The PM edits and logs them into "Customer requests".
1. **Checked against the SOW.** When someone opens the project's "Change requests" tab (or a request), each new
   request is sent to [Jev](https://openrouter.ai/docs/guides/community/jev.md), a decision model that answers fixed
   questions with probabilities instead of text: is this in scope, a change request, a blocker, or noise? Which SOW
   line does it touch? Roughly how big is it? The SOW comes from the project's own "SOW scope" task, so any project
   with a written scope works.
2. **The PM decides.** Below 60% confidence the result shows as "Needs review". The PM can change the type, and
   chooses one of three: approve as a change order, do it at no charge, or reject with a reason. An optional line
   ("no charge under 2 hours") suggests which one; the PM still decides and the history records whether they
   followed it.
3. **The customer signs off** in the customer portal, for change orders only. Who counts is a setting: the project's
   customer champion (default), every customer on the project, or the first to respond.
4. **The request becomes the work.** Renamed CO-00N or NC-00N, moved to "Approved changes" with the agreed hours.
   Completing that task means delivered. Until work starts, either decision can be withdrawn and the number is
   retired, never reused.

The inbox shows hours charged vs hours given at no charge, and how often the PM agreed with the check.

## Why it's built this way

- **A decision model, not an agent.** Every answer is one of a fixed set of options with a confidence, so it can be
  tested, thresholded and audited. An agent choosing its own actions is harder to trust near billing.
- **Two models, two jobs.** Writing (pulling asks out of a messy chat) uses a general model, held to quoting the
  customer's words. Deciding uses Jev, on those words. A writer's confidence can't be thresholded; Jev's can.
- **The PM always decides.** The model sorts and sizes; it never puts a price in front of a customer.
- **Built on what Rocketlane already has.** Nitro Signals can spot scope talk in calls and emails; this handles the
  step after, inside the project. Approvals check who clicked on the server (Rocketlane passes the user), and the
  customer champion is Rocketlane's own role.
- **No webhooks or cron.** Custom apps can't receive webhooks, and scheduled jobs run without credentials (tested;
  see `DECISIONS.md`). So new requests are checked when someone opens them, and every decision runs on the click.

## Does the check work?

On 48 labelled requests for a fake retail project (`eval/`): 46 of 48 types right in every run, all 17 change requests
caught, one false "change request". At the 0.6 confidence bar it handled 44 of 48 on its own with no mistakes and
sent 4 to the PM. The same result held with the SOW read from the live Rocketlane task. A held-out set in a different
industry is in `eval/holdout/`. Details and limits: `eval/RESULTS.md`.

These are requests I wrote and labelled myself, so treat the numbers as "it works on this kind of request", not as
accuracy on real customer traffic.

## Run it

You need a Rocketlane account with custom apps, an API key, and an [OpenRouter](https://openrouter.ai) key.

```bash
npm install
cp .env.example .env              # add RL_API_KEY and OPENROUTER_API_KEY
python3 rl.py setup-fields        # creates the task fields the app uses
python3 seed.py --customer you@example.com   # optional fake demo project
cd app && npx rli build           # builds app/app.zip
cd ../intake && npx rli build     # builds intake/app.zip (the "Log a request" tab)
```

Upload both zips under Settings > Custom apps, enter both keys in each, then add the "Change requests to sign off" widget
to a page in your customer portal template. Run the eval with `npm run eval` (about $0.003 for all 48).

## Layout

| Path | What |
|---|---|
| `app/` | The Change requests app: project inbox, task tab, customer portal widget, server actions |
| `intake/` | The Request intake app: "Log a request" tab that turns a conversation into requests |
| `core/` | The Jev questions, SOW parsing and request drafting, shared by the apps and the eval |
| `eval/` | Labelled requests, the eval script, saved runs and the write-up |
| `rl.py`, `seed.py` | Trial setup and fake demo data |
| `DECISIONS.md` | Decisions, what the platform tests found, edge cases, field evidence, limits |
| `PRD.md` | The one-page product doc: problem, who it's for, metrics, next steps |

## Known limits

Hours, not price. One request is one change order. Edits to the app's fields made directly in Rocketlane aren't seen
by the app. No notifications from the app itself (a Rocketlane automation can send them). Sign-off is a recorded
click, not a signature. The full list is in `DECISIONS.md`.
