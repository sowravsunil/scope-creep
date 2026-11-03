#!/usr/bin/env node
// Measures how well Jev sorts customer requests, against labels a person wrote.
//
// Usage (run from the Rocketlane folder):
//   node eval/run-eval.js --dry-run            check the labelled set, print one request body, no API calls
//   node eval/run-eval.js                      call Jev for every request, save raw answers, print the report
//   node eval/run-eval.js --from <file>        re-score saved answers (free: no API calls)
//   node eval/run-eval.js --limit 5            only the first 5 requests (cheap smoke test)
//   node eval/run-eval.js --sow-live           read the SOW from the Rocketlane project's "SOW scope" task, exactly as
//                                              the app does (parity check; needs RL_API_KEY and seed.json)
//   node eval/run-eval.js --set holdout        run eval/holdout/requests.json against eval/holdout/sow.html (the SOW
//                                              text a PM would paste into the task, read by the app's own parser)
const fs = require("fs");
const path = require("path");
const fixture = require("../core/sow");
const { parseSow } = require("../core/parse-sow");
const { MODEL, KINDS, SIZE_KEYS, buildRequest, callJev, interpret } = require("../core/decide");

const ROOT = path.join(__dirname, "..");
const RESULTS_DIR = path.join(__dirname, "results");
const KIND_KEYS = Object.keys(KINDS);
let sow = fixture; // replaced by --sow-live or --set
let SOW_KEYS = [...Object.keys(sow.inScope), "none"];

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

const loadEnv = () => {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
};

// Catches labelling mistakes before any money is spent.
const checkLabels = (items) => {
  const problems = [];
  const seen = new Set();
  for (const r of items) {
    if (seen.has(r.id)) problems.push(`${r.id}: duplicate id`);
    seen.add(r.id);
    if (!KIND_KEYS.includes(r.kind)) problems.push(`${r.id}: unknown kind '${r.kind}'`);
    if (!SOW_KEYS.includes(r.sowItem)) problems.push(`${r.id}: unknown sowItem '${r.sowItem}'`);
    if (r.kind === "change_request" && r.size != null && !SIZE_KEYS.includes(r.size)) problems.push(`${r.id}: unknown size '${r.size}'`);
    if (r.clarity === "ambiguous" && !r.note) problems.push(`${r.id}: ambiguous items need a note explaining the label`);
  }
  return problems;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retries rate limits and server errors with backoff; anything else fails the item.
const withRetry = async (fn, attempts = 5) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const transient = err.status === 429 || err.status >= 500 || err.name === "TimeoutError";
      if (!transient || attempt + 1 >= attempts) throw err;
      await sleep(err.retryAfterMs || Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 1000);
    }
  }
};

const runAll = async (items, apiKey, concurrency) => {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      const r = items[i];
      try {
        const res = await withRetry(() => callJev(apiKey, buildRequest(sow, r)));
        out[i] = { ...r, answers: res.answers, model: res.model, usage: res.usage };
        process.stdout.write(".");
      } catch (err) {
        out[i] = { ...r, error: err.message };
        process.stdout.write("x");
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  process.stdout.write("\n");
  return out;
};

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : "n/a");
const pad = (s, n) => String(s).padEnd(n);

const report = (run) => {
  const ok = run.items.filter((r) => r.answers);
  const failed = run.items.filter((r) => r.error);
  const scored = ok.map((r) => ({ ...r, d: interpret(r.answers, { minConfidence: 0, maxReview: 1.01 }) }));

  console.log(`\nModel: ${run.model}   Run: ${run.at}   Answered: ${ok.length}/${run.items.length}`);
  for (const f of failed) console.log(`  FAILED ${f.id}: ${f.error}`);

  // 1. Request type, before any threshold.
  const right = scored.filter((r) => r.d.kind === r.kind);
  const clear = scored.filter((r) => r.clarity === "clear");
  const amb = scored.filter((r) => r.clarity === "ambiguous");
  console.log(`\n1. Request type (no threshold)`);
  console.log(`   Correct: ${right.length}/${scored.length} (${pct(right.length, scored.length)})` +
    `   clear: ${pct(clear.filter((r) => r.d.kind === r.kind).length, clear.length)}` +
    `   ambiguous: ${pct(amb.filter((r) => r.d.kind === r.kind).length, amb.length)}`);
  console.log(`\n   Rows = my label, columns = Jev's answer`);
  console.log(`   ${pad("", 16)}${KIND_KEYS.map((k) => pad(k, 16)).join("")}`);
  for (const label of KIND_KEYS) {
    const row = KIND_KEYS.map((p) => pad(scored.filter((r) => r.kind === label && r.d.kind === p).length, 16));
    console.log(`   ${pad(label, 16)}${row.join("")}`);
  }

  // 2. The two mistakes that cost money.
  const isCR = (r) => r.kind === "change_request";
  const saidCR = (r) => r.d.kind === "change_request";
  const tp = scored.filter((r) => isCR(r) && saidCR(r)).length;
  const fp = scored.filter((r) => !isCR(r) && saidCR(r));
  const fn = scored.filter((r) => isCR(r) && !saidCR(r));
  console.log(`\n2. Change requests`);
  console.log(`   Caught (recall):     ${tp}/${tp + fn.length} (${pct(tp, tp + fn.length)})   a miss = unbilled work`);
  console.log(`   Right when flagged (precision): ${tp}/${tp + fp.length} (${pct(tp, tp + fp.length)})   a false flag = billing a customer for work they paid for`);
  for (const r of fn) console.log(`   MISSED ${r.id} (Jev: ${r.d.kind}, conf ${r.d.kindConfidence.toFixed(2)}): ${r.text.slice(0, 80)}`);
  for (const r of fp) console.log(`   FALSE FLAG ${r.id} (label: ${r.kind}, conf ${r.d.kindConfidence.toFixed(2)}): ${r.text.slice(0, 80)}`);

  // 3. SOW pointer and size.
  const sowRight = scored.filter((r) => r.d.sowItem === r.sowItem).length;
  const sized = scored.filter((r) => isCR(r) && r.size);
  const exact = sized.filter((r) => r.d.size === r.size).length;
  const near = sized.filter((r) => Math.abs(SIZE_KEYS.indexOf(r.d.size) - SIZE_KEYS.indexOf(r.size)) <= 1).length;
  console.log(`\n3. SOW item: ${sowRight}/${scored.length} (${pct(sowRight, scored.length)})` +
    `   Size on change requests: exact ${pct(exact, sized.length)}, within one bucket ${pct(near, sized.length)}`);

  // 4. The gate: how much can run without a person, and how often that's wrong.
  console.log(`\n4. Gate: act only if type confidence >= C and review probability < R`);
  console.log(`   ${pad("C", 6)}${pad("R", 6)}${pad("auto", 12)}${pad("auto correct", 16)}${pad("auto false CR", 14)}`);
  for (const c of [0, 0.5, 0.6, 0.7, 0.8, 0.9]) {
    for (const rv of [1.01, 0.7, 0.5, 0.3]) {
      const auto = ok.map((r) => ({ r, d: interpret(r.answers, { minConfidence: c, maxReview: rv }) }))
        .filter((x) => x.d.action === "auto");
      const good = auto.filter((x) => x.d.kind === x.r.kind).length;
      const falseCR = auto.filter((x) => x.d.kind === "change_request" && x.r.kind !== "change_request").length;
      console.log(`   ${pad(c, 6)}${pad(rv > 1 ? "-" : rv, 6)}${pad(pct(auto.length, ok.length), 12)}` +
        `${pad(`${good}/${auto.length} ${pct(good, auto.length)}`, 16)}${pad(falseCR, 14)}`);
    }
  }

  const cost = ok.reduce((s, r) => s + ((r.usage && r.usage.cost) || 0), 0);
  console.log(`\nCost: $${cost.toFixed(6)} for ${ok.length} requests ($${((cost / (ok.length || 1)) * 1000).toFixed(4)} per 1,000)\n`);
};

// The SOW the app would see: the project's "SOW scope" task, read with the app's own parser. Item keys are mapped to
// the fixture's names in order, so the existing labels still apply.
const liveSow = async () => {
  const { rocketlane } = require("../app/server-actions/rocketlane");
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, "seed.json"), "utf8"));
  const rl = rocketlane(process.env.RL_API_KEY);
  const tasks = await rl.tasks(seed.projectId);
  const sowTask = tasks.find((t) => (t.taskName || "").toLowerCase().startsWith("sow scope"));
  if (!sowTask) throw new Error("No 'SOW scope' task in the seeded project.");
  const project = (sowTask.project && sowTask.project.projectName) || fixture.project;
  return parseSow(sowTask.taskDescription, { project, keys: Object.keys(fixture.inScope) });
};

const main = async () => {
  if (option("--from")) return report(JSON.parse(fs.readFileSync(option("--from"), "utf8")));
  loadEnv();

  const setDir = option("--set") ? path.join(__dirname, option("--set")) : __dirname;
  let sowSource = "core/sow.js";
  if (flag("--sow-live")) {
    sow = await liveSow();
    sowSource = "live Rocketlane SOW task, app parser";
  } else if (option("--set")) {
    const meta = JSON.parse(fs.readFileSync(path.join(setDir, "project.json"), "utf8"));
    sow = parseSow(fs.readFileSync(path.join(setDir, "sow.html"), "utf8"), { project: meta.project });
    sowSource = `${option("--set")}/sow.html, app parser`;
  }
  SOW_KEYS = [...Object.keys(sow.inScope), "none"];

  let items = JSON.parse(fs.readFileSync(path.join(setDir, "requests.json"), "utf8"));
  const problems = checkLabels(items);
  if (problems.length) {
    console.error("Fix the labels first:\n  " + problems.join("\n  "));
    process.exit(1);
  }
  const counts = KIND_KEYS.map((k) => `${k} ${items.filter((r) => r.kind === k).length}`).join(", ");
  console.log(`${items.length} labelled requests: ${counts}. Ambiguous: ${items.filter((r) => r.clarity === "ambiguous").length}`);

  if (flag("--dry-run")) {
    console.log(`\nModel: ${MODEL}. Example request body for ${items[0].id}:\n`);
    console.log(JSON.stringify(buildRequest(sow, items[0]), null, 2));
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY is empty. Add it to .env (see .env.example).");
    process.exit(1);
  }
  if (option("--limit")) items = items.slice(0, Number(option("--limit")));

  const tag = flag("--sow-live") ? "-sowlive" : option("--set") ? `-${option("--set")}` : "";
  const run = { model: MODEL, at: new Date().toISOString(), sowSource, items: await runAll(items, apiKey, 4) };
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const file = path.join(RESULTS_DIR, `run-${run.at.replace(/[:.]/g, "-")}${tag}.json`);
  fs.writeFileSync(file, JSON.stringify(run, null, 2));
  console.log(`Saved raw answers to ${path.relative(ROOT, file)}`);
  report(run);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
