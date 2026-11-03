const { start, call, get, esc, pct, when, badge, showError } = window.CR;
const main = document.getElementById("main");
// Fallback for results stored before v1.4 (newer ones carry sizeHours from core/decide.js).
const SIZE_HOURS = { under_4: 2, "4_16": 10, "16_40": 28, over_40: 40 };
const TYPES = { in_scope: "In scope", change_request: "Change request", blocker: "Blocker", noise: "Noise" };

// The PM's real decision is comparing two lines: what they asked for, and what the SOW says. So those lead the card;
// the per-type breakdown sits behind "details". (The review signal and model version are in the audit export.)
const resultCard = (r, asked) => {
  const probs = Object.entries(r.probabilities || {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${esc(TYPES[k] || k)} ${pct(v)}`)
    .join(" · ");
  const o = r.override;
  const verdict = o
    ? `${badge(r.label)} <span class="muted">set by the PM (the check said ${esc(TYPES[r.kind])})${o.reason ? `: ${esc(o.reason)}` : ""}</span>`
    : r.needsReview
      ? `${badge("Needs review")} <span class="muted">not sure: looks like ${esc(r.kindLabel)} (${pct(r.confidence)}), so you decide</span>`
      : `${badge(r.label)} <span class="muted">${pct(r.confidence)} sure</span>`;
  const sow =
    r.kind === "noise" ? "" : r.sowItem === "none" || !r.sowItemText ? "Nothing in the SOW covers this" : r.sowItemText;
  return `
    <div class="card">
      <div class="row"><span class="k">Check</span><span>${verdict}</span></div>
      ${asked ? `<div class="row"><span class="k">They asked</span><span>"${esc(asked)}"</span></div>` : ""}
      ${sow ? `<div class="row"><span class="k">${r.kind === "blocker" ? "Area" : "SOW says"}</span><span>${esc(sow)}</span></div>` : ""}
      ${r.effectiveKind === "change_request" || r.needsReview ? `<div class="row"><span class="k">Rough size</span><span>${esc(r.sizeLabel)} <span class="muted">(a range, not a quote)</span></span></div>` : ""}
      <div class="row"><span class="k">Checked</span><span class="muted">${when(r.checkedAt)}
        <details style="display:inline;margin:0 0 0 8px"><summary>details</summary>${probs}</details></span></div>
    </div>`;
};

const overrideForm = (r) => `
  <details class="card"><summary>Wrong type? Change it</summary>
    <div class="row"><span class="k">Type</span><select id="ov-kind">${Object.entries(TYPES)
      .map(([k, v]) => `<option value="${k}" ${k === r.effectiveKind ? "selected" : ""}>${v}</option>`).join("")}</select></div>
    <div class="row"><span class="k">Why</span><input id="ov-reason" placeholder="e.g. recording is part of the agreed sessions" style="flex:1"></div>
    <button data-step="override">Save type</button>
    <div id="ov-error"></div>
  </details>`;

const who = (p) => (p ? `${esc(p.name || p.email || p.userId)}, ${when(p.at)}` : "");

const approvalPanel = (d) => {
  const r = d.record;
  const a = r.approval || { state: "awaiting_pm" };
  const owner = d.role.isOwner;
  const lines = [];
  const pmSaid = { approved: `Approved ${esc(a.hours)}h`, absorbed: `No charge, ${esc(a.hours)}h`, rejected: "Rejected" };
  const ruleNote = a.rule ? ` · ${a.rule.followed ? "matches" : "against"} the ${esc(a.rule.line)}h line` : "";
  if (a.pm) lines.push(`<div class="row"><span class="k">PM</span><span>${pmSaid[a.pm.decision] || esc(a.pm.decision)}${ruleNote}${a.note ? ` · ${esc(a.note)}` : ""} <span class="muted">(${who(a.pm)})</span></span></div>`);
  const s = r.signoff;
  if (s && a.state === "awaiting_customer") {
    const people = s.people.length
      ? s.people.map((p) => `${esc(p.name)}: ${p.decision === "approved" ? "approved" : p.decision === "declined" ? "declined" : "waiting"}`).join(" · ")
      : "any customer on the project";
    lines.push(`<div class="row"><span class="k">Sign-off rule</span><span>${esc(s.label)}<div class="muted">${people}</div></span></div>`);
  }
  if (a.customer) lines.push(`<div class="row"><span class="k">Customer</span><span>${a.customer.decision === "approved" ? "Signed off" : "Declined"}${a.customer.note ? ` · ${esc(a.customer.note)}` : ""} <span class="muted">(${who(a.customer)})</span></span></div>`);
  if (a.co)
    lines.push(`<div class="row"><span class="k">${a.state === "absorbed" ? "No-charge work" : "Change order"}</span><span><b>${esc(a.co.label)}</b> · ${
      r.delivered ? "delivered (this task is completed)" : `open work in "Approved changes", ${esc(a.hours)}h`}</span></div>`);
  if (a.withdrawn) lines.push(`<div class="row"><span class="k">Withdrawn</span><span>${esc(a.withdrawn.note)} <span class="muted">(${who(a.withdrawn)})</span>${a.retired && a.retired.length ? ` · retired: ${esc(a.retired.join(", "))}` : ""}</span></div>`);

  let actions = "";
  if (owner && ["awaiting_pm", "pm_rejected", "customer_declined", "withdrawn"].includes(a.state)) {
    const hours = a.hours || (a.previous && a.previous.hours) || r.sizeHours || SIZE_HOURS[r.size] || "";
    // The team's line between free and charged, shown as a default. The PM still decides; the history notes which way.
    const line = d.sizeRule;
    const suggest = (h) => (line ? (Number(h) < line ? "absorb" : "approve") : null);
    actions = `
      <div class="row"><span class="k">Hours</span><input id="hours" type="number" min="0.5" step="0.5" value="${esc(hours)}" style="width:90px"> <span class="muted">model's rough size: ${esc(r.sizeLabel)}</span></div>
      ${line ? `<div class="row"><span class="k">Your line</span><span class="muted" id="rule-hint"></span></div>` : ""}
      <div class="row"><span class="k">Note</span><input id="note" placeholder="What the customer sees, or why you rejected" style="flex:1"></div>
      <button data-step="pm" data-decision="approve">Approve and send to customer</button>
      <button data-step="pm" data-decision="absorb">Do it at no charge</button>
      <button data-step="pm" data-decision="reject" class="link">Reject</button>`;
    setTimeout(() => {
      const input = document.getElementById("hours");
      const hint = document.getElementById("rule-hint");
      const paint = () => {
        const pick = suggest(input.value);
        main.querySelectorAll("button[data-decision]").forEach((b) => b.classList.toggle("primary", b.dataset.decision === pick));
        if (hint) hint.textContent = `Under ${line}h: no charge. ${line}h or more: change order. Suggested: ${pick === "absorb" ? "no charge" : "change order"}.`;
      };
      if (input && line) {
        input.addEventListener("input", paint);
        paint();
      }
    });
  } else if (
    d.role.isCustomer && a.state === "awaiting_customer" && s && !s.decisions[d.role.userId] &&
    (!s.people.length || s.people.some((p) => p.userId === d.role.userId))
  ) {
    actions = `
      <div class="row"><span class="k">Note</span><input id="note" placeholder="Optional" style="flex:1"></div>
      <button data-step="customer" data-decision="approve">Approve ${esc(a.hours)}h</button>
      <button data-step="customer" data-decision="decline">Decline</button>`;
  } else if ((owner || (a.state !== "absorbed" && a.customer && a.customer.userId === d.role.userId)) && ["awaiting_customer", "approved", "absorbed"].includes(a.state) && !r.delivered) {
    actions = `
      <div class="row"><span class="k">Reason</span><input id="note" placeholder="Why this is being withdrawn" style="flex:1"></div>
      <button data-step="withdraw">Withdraw${a.co ? ` ${esc(a.co.label)}` : " approval"}</button>`;
  } else if (!owner && a.state === "awaiting_pm") {
    actions = `<p class="muted">Waiting for the project owner to approve or reject.</p>`;
  }
  return `
    <h2 style="margin-top:16px">Approval ${badge(r.status || "Awaiting PM")}</h2>
    <div class="card">${lines.join("") || `<p class="muted">Charge for it, do it free, or say no.</p>`}
      ${actions ? `<div style="margin-top:10px">${actions}</div>` : ""}
      <div id="action-error"></div>
    </div>`;
};

const history = (h) =>
  h.length
    ? `<h2 style="margin-top:16px">History</h2><div class="history">${h.slice().reverse()
        .map((x) => `<div>${when(x.at)} · ${esc(x.event)}${x.result ? ` · ${esc(x.result)}` : ""} · ${esc(x.by || "")}</div>`).join("")}</div>`
    : "";

const run = async () => {
  const client = await start();
  const task = await get(client, "task");
  const taskId = task && (task.taskId || (task.task && task.task.taskId));
  if (!taskId) throw new Error("Couldn't tell which task this is.");

  const load = async () => {
    const d = await call(client, "detail", { taskId });
    if (!d.isRequest) {
      main.innerHTML = `<p class="muted">This task is in "${esc(d.phaseName)}", not in the customer requests phase, so there's nothing to check.</p>`;
      return;
    }
    if (!d.record || d.stale) {
      main.innerHTML = `<p class="muted">${d.stale ? "The request changed since it was checked. Checking again..." : "Checking against the SOW..."}</p>`;
      await call(client, "classify", { taskId });
      return load();
    }
    const r = d.record;
    // Once it's with the customer or agreed, the type is settled: no re-check or type change until it's withdrawn.
    const locked = r.approval && ["awaiting_customer", "approved", "absorbed"].includes(r.approval.state);
    main.innerHTML =
      resultCard(r, d.asked) +
      (d.role.isOwner && !locked ? `<button id="check" class="link">Check again</button>` + overrideForm(r) : "") +
      // Change requests, and anything in Needs review: there the PM's decision is the review.
      (r.effectiveKind === "change_request" || (r.needsReview && !r.override) ? approvalPanel(d) : "") +
      history(d.history);

    const check = document.getElementById("check");
    if (check)
      check.addEventListener("click", async () => {
        check.disabled = true;
        check.textContent = "Checking...";
        await call(client, "classify", { taskId, force: true }).catch((e) => alert(e.message));
        await load();
      });

    main.querySelectorAll("button[data-step]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const value = (id) => (document.getElementById(id) || {}).value;
        const payload = { taskId, step: btn.dataset.step, decision: btn.dataset.decision, hours: value("hours"), note: value("note") };
        if (btn.dataset.step === "override") Object.assign(payload, { kind: value("ov-kind"), reason: value("ov-reason") });
        main.querySelectorAll("button").forEach((b) => (b.disabled = true));
        try {
          await call(client, "decide", payload);
          await load();
        } catch (e) {
          main.querySelectorAll("button").forEach((b) => (b.disabled = false));
          const box = document.getElementById(btn.dataset.step === "override" ? "ov-error" : "action-error") || main;
          box.innerHTML = `<div class="error" style="margin-top:8px">${esc(e.message)}</div>`;
        }
      }),
    );
  };
  await load();
};

run().catch((e) => showError(main, e));
