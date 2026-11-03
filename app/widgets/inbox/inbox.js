const { start, call, get, esc, pct, when, badge, showError } = window.CR;
const $ = (id) => document.getElementById(id);

// Opening a request from the inbox: Rocketlane has no documented deep link for apps, so the row just names it.
// The SOW line only means something for scope questions. For a blocker it's just the area; noise has none.
const sowCell = (r) => (r.kind === "noise" ? "" : r.kind === "blocker" ? `Area: ${esc(r.sowItemText)}` : esc(r.sowItemText));

const row = (req) => {
  const r = req.record;
  const result = r
    ? `<td>${badge(r.label)}${r.needsReview ? `<div class="sow">Looks like: ${esc(r.kindLabel)}</div>` : ""}</td>
       <td class="num"><span class="bar"><span style="width:${Math.round(r.confidence * 100)}%"></span></span>${pct(r.confidence)}</td>
       <td class="sow">${sowCell(r)}</td>
       <td class="num">${r.effectiveKind === "change_request" ? esc(r.sizeLabel) : ""}</td>
       <td>${r.status ? badge(r.status) : ""}</td>`
    : `<td colspan="5" class="muted">${req.error ? `<span class="error">${esc(req.error)}</span>` : "Checking against the SOW..."}</td>`;
  return `<tr id="t-${req.taskId}"><td>${esc(req.taskName)}<div class="sow">${r ? `Checked ${when(r.checkedAt)}` : ""}</div></td>${result}</tr>`;
};

const render = (state) => {
  const counts = {};
  for (const req of state.requests) if (req.record) counts[req.record.label] = (counts[req.record.label] || 0) + 1;
  $("summary").innerHTML = Object.entries(counts).map(([label, n]) => badge(`${label}`).replace("</span>", ` ${n}</span>`)).join("");
  $("list").innerHTML = state.requests.length
    ? `<table><thead><tr><th>Request</th><th>Type</th><th>Confidence</th><th>SOW item</th><th>Size</th><th>Approval</th></tr></thead>
       <tbody>${state.requests.map(row).join("")}</tbody></table>`
    : `<p class="muted">No requests in "${esc(state.phase)}" yet.</p>`;
};

const main = async () => {
  const client = await start();
  const project = await get(client, "project");
  const projectId = project && (project.projectId || (project.project && project.project.projectId));
  if (!projectId) throw new Error("Couldn't tell which project this is.");

  const state = await call(client, "inbox", { projectId });
  const ag = state.agreement;
  $("sub").textContent =
    `Requests in "${state.phase}", checked against "${state.sowTaskName}". Below ${Math.round(state.minConfidence * 100)}% confidence, the PM decides.` +
    (ag.checked ? ` PM agreed with the check on ${ag.agreed} of ${ag.checked}.` : "");
  // What's charged for vs given away on this project.
  const { billed, absorbed, budgetHours } = state.ledger;
  if (billed.count || absorbed.count || state.sizeRule) {
    const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
    const share = (h) => (budgetHours ? ` (${((100 * h) / budgetHours).toFixed(1)}% of the ${budgetHours}h budget)` : "");
    $("ledger").textContent =
      `Charged: ${billed.hours}h in ${plural(billed.count, "change order")}${share(billed.hours)} · ` +
      `Given at no charge: ${absorbed.hours}h in ${plural(absorbed.count, "request")}${share(absorbed.hours)}` +
      (state.sizeRule ? ` · Line: under ${state.sizeRule}h is no charge by default` : "");
  }
  render(state);

  // Check new requests a few at a time and update each row as it finishes.
  // New requests, and ones edited since they were checked.
  const todo = state.requests.filter((r) => !r.record || r.stale);
  const worker = async () => {
    while (todo.length) {
      const req = todo.shift();
      try {
        const res = await call(client, "classify", { taskId: req.taskId });
        req.record = res.record;
      } catch (e) {
        req.error = e.message;
      }
      render(state);
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  // Audit report. Downloads may be blocked inside Rocketlane's frame, so the CSV is also shown to copy.
  const exportCsv = async (which, filename) => {
    $("audit-status").textContent = "Preparing...";
    try {
      const res = await call(client, "auditExport", { projectId });
      const text = which === "decisions" ? res.decisionsCsv : res.eventsCsv;
      try {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (e) {}
      $("audit-copy").hidden = false;
      $("audit-copy").value = text;
      $("audit-status").textContent = `${which === "decisions" ? res.rows : res.events} rows. If the download didn't start, copy from the box.`;
    } catch (e) {
      $("audit-status").textContent = "Couldn't build the report: " + e.message;
    }
  };
  $("audit-decisions").addEventListener("click", () => exportCsv("decisions", "change-request-decisions.csv"));
  $("audit-events").addEventListener("click", () => exportCsv("events", "change-request-history.csv"));
};

main().catch((e) => showError($("list"), e));
