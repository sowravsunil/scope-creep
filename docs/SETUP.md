# Run the prototype

The offline evaluation needs Node.js only. Building the apps also needs npm and the pinned Rocketlane CLI.
Account setup uses Python 3 with its standard library. The local review was run with Node.js 26 and Python 3.12;
other versions have not been verified here.

## Review without an account

From the repository root:

```bash
npm run eval:saved
npm run eval:check
npm test
```

These commands re-score a saved run, validate the development labels, and run offline tests. They do not call
Rocketlane or a model provider. The saved-run report uses the labels and size ranges from that run, so historical
results remain reproducible.

## Build both apps

```bash
npm ci
npm run build
```

This produces `app/app.zip` and `intake/app.zip`. Builds do not install or deploy the apps. The CLI dependency is
pinned in the root package and lockfile. Run commands from the repository root.

## Prepare a trial account

Use an account with custom apps enabled and API access. The demo uses fictional data. Both model calls go through
OpenRouter, so use fictional messages and SOW content when trying the prototype.

```bash
cp .env.example .env
```

Set `RL_API_KEY` and `OPENROUTER_API_KEY` in `.env`. Set `RL_OWNER_ID` to your Rocketlane user ID if you do not want
the seed script to choose the first team member. Keys, generated project IDs, and local installation state are
ignored by Git.

The next commands create fields and a project in your account:

```bash
python3 rl.py setup-fields
python3 seed.py --customer YOUR_SECOND_EMAIL
```

Replace `YOUR_SECOND_EMAIL` with an address you control. Rocketlane sends it an invitation and the seed script
assigns it as customer champion. Accept the invite and use a separate browser session for the customer view.
You can run `python3 seed.py` without an email to inspect the PM flow, but customer sign-off needs a customer user.
Existing fields are skipped by setup; verify their privacy settings if they predate this installation.

For a manually prepared project, add “Customer requests” and “Approved changes” phases and a “SOW scope” task.
The SOW task should contain one HTML bullet list of in-scope items and a paragraph beginning “Out of scope:” with
comma-separated exclusions. The parser is not a general contract reader: it treats all list items as in scope.
See [the logistics example](../eval/holdout/sow.html).

## Install and open

1. Upload each ZIP under **Settings → Custom apps**. Enter both API keys in each app's install settings; `.env`
   is for local scripts and is not bundled into the apps.
2. In the main app, set the no-charge guideline to two hours for the demo. Keep “customer champion” as the sign-off
   rule and ensure the project has a champion. The current implementation falls back to first response if it does not.
3. Add **Change requests to sign off** to the customer portal template. Trial updates required this widget to be
   re-added after upload; check it after each update.
4. As the project owner, open **Log a request** or **Change requests**. Internal views and intake are owner-only;
   customers act through the portal.
5. Verify the PM can log and review a request, then confirm the customer can approve it in the portal. Check
   that customer sessions cannot access internal views or model fields.

The configured model IDs are in `core/decide.js` and `core/extract.js`. The intake model is also configurable in
install settings. Availability depends on your provider account. Changing a model or prompt requires a fresh
evaluation; saved results describe the recorded version only.

## Live evaluation

These commands send synthetic requests to the model provider and incur usage charges:

```bash
npm run eval
node eval/run-eval.js --sow-live
```

The second command also reads the SOW from your seeded Rocketlane project and needs `seed.json` and `RL_API_KEY`.
Historical cost is recorded in each saved run; it is not a current price quote.

The logistics holdout intentionally has no labels yet. Follow [LABELLING.md](../eval/holdout/LABELLING.md) before
running it. Do not use model answers to fill the reference labels.

## Remove the demo project

```bash
python3 seed.py teardown
```

This deletes the project named “Northwind Retail: Support desk rollout” in the configured account. Use it only
for the disposable demo project. It does not remove account-level custom fields or installed apps.
