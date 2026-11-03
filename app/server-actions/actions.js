// Server actions the widgets call. Each returns { ok, ... } and never throws, so errors show up in the UI.
const { rocketlane } = require("./rocketlane");
const { projectSetup, classifyTask, checkHash, settings } = require("./classify");
const approvals = require("./approvals");
const store = require("./store");
const { requireOwner } = require("./access");

// Production passes { action, context, payload }; the local dev server passes { payload, context }.
const unpack = (args) => ({ payload: (args && args.payload) || {}, user: (args && args.context && args.context.user) || null });

const safely = (fn) => async (r, args) => {
  try {
    return { ok: true, ...(await fn(r, unpack(args))) };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
};

const rlFor = (r) => rocketlane((r.installationParams || {}).rlApiKey);

const withStatus = (record, task) => {
  if (!record) return record;
  const kind = approvals.effectiveKind(record);
  const delivered = approvals.isDelivered(record, task);
  const signoff = record.approval && record.approval.signoff ? approvals.signoffStatus(record.approval) : null;
  return { ...record, effectiveKind: kind, delivered, signoff, status: kind === "change_request" ? approvals.stateLabel(record.approval, delivered) : null };
};

// A decided change (CO or no charge) has moved to "Approved changes" but is still the same request.
const isAgreed = (record) => !!(record && record.approval && approvals.AGREED.includes(record.approval.state) && record.approval.co);

// With the customer or agreed: the type is settled, so edits don't trigger a re-check (an edit sends it back instead).
const isLocked = (record) => !!(record && record.approval && ["awaiting_customer", ...approvals.AGREED].includes(record.approval.state));

// The request text (or the SOW) changed since it was checked, so the stored result is out of date.
const isStale = (record, task, setup) => !!record && !isLocked(record) && record.hash !== checkHash(task, setup);

// Every request in a project: open ones in the requests phase, agreed ones in the approved phase.
const projectRequests = async (r, rl, setup, projectId) => {
  const out = [];
  for (const t of await rl.tasks(projectId, setup.phaseId)) out.push({ task: t, record: await store.get(r, `req:${t.taskId}`) });
  if (setup.approvedPhaseId !== setup.phaseId) {
    for (const t of await rl.tasks(projectId, setup.approvedPhaseId)) {
      const record = await store.get(r, `req:${t.taskId}`);
      if (isAgreed(record)) out.push({ task: t, record });
    }
  }
  return out;
};

// The customer's words for the task tab: the Request details field if set, else the description.
const askedText = (task, setup) => {
  const f = setup.fields["Request details"];
  const details = f && (task.fields || []).find((x) => x.fieldId === f.fieldId);
  const text = String((details && details.fieldValue) || task.taskDescription || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 400 ? text.slice(0, 397) + "..." : text;
};

// A task is a request if it sits in the requests phase, or it's an agreed change that moved on.
const loadRequest = async (r, rl, taskId, ownerUser) => {
  const task = await rl.task(taskId);
  if (ownerUser !== undefined) await requireOwner(rl, task.project.projectId, ownerUser);
  const setup = await projectSetup(r, rl, task.project.projectId);
  const record = await store.get(r, `req:${taskId}`);
  const inRequests = task.phase && task.phase.phaseId === setup.phaseId;
  return { task, setup, record, inRequests, isRequest: inRequests || isAgreed(record) };
};

module.exports = {
  // Project tab: the list of requests, stored results, approval status, and recorded PM overrides.
  inbox: safely(async (r, { payload, user }) => {
    const rl = rlFor(r);
    await requireOwner(rl, payload.projectId, user);
    const setup = await projectSetup(r, rl, payload.projectId);
    const requests = [];
    for (const { task, record } of await projectRequests(r, rl, setup, payload.projectId)) {
      await approvals.sendBackIfEdited(r, rl, setup, task, record);
      requests.push({ taskId: task.taskId, taskName: task.taskName, stale: isStale(record, task, setup), record: withStatus(record, task) });
    }
    const checked = requests.filter((q) => q.record);
    const overridden = checked.filter((q) => q.record.override && q.record.override.kind !== q.record.kind).length;
    // What the team charges for vs gives away: the ledger teams keep only in their heads.
    const tally = (state) => {
      const hits = checked.filter((q) => q.record.approval && q.record.approval.state === state);
      return { count: hits.length, hours: hits.reduce((s, q) => s + (Number(q.record.approval.hours) || 0), 0) };
    };
    return {
      sowTaskName: setup.sowTaskName,
      phase: setup.requestsPhase,
      minConfidence: setup.minConfidence,
      sizeRule: approvals.sizeRule(r),
      agreement: { checked: checked.length, agreed: checked.length - overridden },
      // Against the project's budgeted hours, so "given at no charge" reads as a share (one respondent: 5-10%).
      ledger: { billed: tally("approved"), absorbed: tally("absorbed"), budgetHours: Number((await rl.project(payload.projectId)).budgetedHours) || 0 },
      requests,
    };
  }),

  // Audit report: one row per request (what the model said, what was decided, by whom, against which line) and one
  // row per retained event. Respondents said they'd trust a tool like this only with "clear audit reports".
  auditExport: safely(async (r, { payload, user }) => {
    const rl = rlFor(r);
    await requireOwner(rl, payload.projectId, user);
    const setup = await projectSetup(r, rl, payload.projectId);
    const csv = (rows) =>
      rows.map((row) => row.map((v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(",")).join("\n");
    const decisions = [[
      "task_id", "request", "task_now", "model_type", "model_confidence", "pm_type", "status", "number", "hours",
      "line_hours", "matched_line", "pm_by", "pm_at", "signoff_rule", "customer_approved_by", "customer_at", "retired_numbers", "checked_at", "model",
    ]];
    const events = [["task_id", "request", "at", "event", "detail", "by"]];
    for (const { task, record } of await projectRequests(r, rl, setup, payload.projectId)) {
      if (!record) continue;
      const a = record.approval || {};
      const name = (a.original && a.original.name) || record.taskName || task.taskName;
      const approvedBy = Object.values(a.decisions || {}).filter((d) => d.decision === "approved").map((d) => d.email || d.userId).join("; ");
      decisions.push([
        task.taskId, name, task.taskName, record.kind, Math.round(record.confidence * 100) / 100, record.override ? record.override.kind : "",
        withStatus(record, task).status || record.label, a.co ? a.co.label : "", a.hours || "",
        a.rule ? a.rule.line : "", a.rule ? (a.rule.followed ? "yes" : "no") : "",
        a.pm ? a.pm.email || a.pm.userId : "", a.pm ? a.pm.at : "", a.signoff ? a.signoff.label : "",
        approvedBy, a.customer ? a.customer.at : "", (a.retired || []).join("; "), record.checkedAt, record.model,
      ]);
      for (const h of (await store.get(r, `log:${task.taskId}`)) || []) events.push([task.taskId, name, h.at, h.event, h.result || "", h.by || ""]);
    }
    return { decisionsCsv: csv(decisions), eventsCsv: csv(events), rows: decisions.length - 1, events: events.length - 1 };
  }),

  // Checks one request (or returns the stored result if nothing changed). Agreed changes aren't re-checked.
  classify: safely(async (r, { payload, user }) => {
    const rl = rlFor(r);
    const { task, setup, record, inRequests } = await loadRequest(r, rl, payload.taskId, user);
    if (!inRequests || isLocked(record)) return { notARequest: !inRequests && !isAgreed(record), record: withStatus(record, task) };
    const named = await store.withName(r, rl, user);
    return { record: withStatus(await classifyTask(r, rl, setup, task, { force: !!payload.force, user: named }), task) };
  }),

  // Task tab: this request's result, approval state, history, and what the current user is allowed to do.
  detail: safely(async (r, { payload, user }) => {
    const rl = rlFor(r);
    const { task, setup, record, isRequest } = await loadRequest(r, rl, payload.taskId, user);
    const phaseName = (task.phase && task.phase.phaseName) || "";
    if (!isRequest) return { isRequest, phaseName };
    const who = await approvals.roles(rl, task.project.projectId, user);
    await approvals.sendBackIfEdited(r, rl, setup, task, record);
    return {
      isRequest,
      phaseName,
      stale: isStale(record, task, setup),
      sizeRule: approvals.sizeRule(r),
      asked: askedText(task, setup),
      role: { isOwner: who.isOwner, isCustomer: who.isCustomer, userId: user && user.userId },
      record: withStatus(record, task),
      history: (await store.get(r, `log:${payload.taskId}`)) || [],
    };
  }),

  // Every human step: { taskId, step: override | pm | customer | withdraw, ... }. Roles are checked on the server.
  decide: safely(async (r, { payload, user }) => {
    if (!user || !user.userId) throw new Error("Couldn't tell who you are, so nothing was changed.");
    const step = { override: approvals.override, pm: approvals.pmDecide, customer: approvals.customerDecide, withdraw: approvals.withdraw }[payload.step];
    if (!step) throw new Error(`Unknown step "${payload.step}".`);
    const rl = rlFor(r);
    // Read the record inside the lock, so a second click sees the first click's result, not a stale copy.
    return store.withLock(r, payload.taskId, async () => {
      const { task, setup, record, isRequest } = await loadRequest(r, rl, payload.taskId);
      if (!isRequest) throw new Error("This task isn't a customer request.");
      if (!record) throw new Error("Check this request against the SOW first.");
      const who = await approvals.roles(rl, task.project.projectId, user);
      await step(r, rl, setup, task, record, payload, await store.withName(r, rl, user), who);
      await store.set(r, `req:${task.taskId}`, record);
      // Customer actions must not return the internal model record or PM-only history.
      return who.isOwner ? { record: withStatus(record, await rl.task(task.taskId)) } : { updated: true };
    });
  }),

  // Customer portal: change requests waiting for this customer's sign-off, plus decided ones, across their projects.
  portal: safely(async (r, { payload, user }) => {
    if (!user || !user.userId) throw new Error("Couldn't tell who you are.");
    const rl = rlFor(r);
    const projectIds = payload.projectId ? [payload.projectId] : (await rl.projects()).map((p) => p.projectId);
    const items = [];
    for (const projectId of projectIds) {
      const who = await approvals.roles(rl, projectId, user);
      if (!who.isCustomer) continue;
      let setup;
      try {
        setup = await projectSetup(r, rl, projectId);
      } catch (e) {
        continue; // not set up for change requests
      }
      for (const { task: t, record } of await projectRequests(r, rl, setup, projectId)) {
        await approvals.sendBackIfEdited(r, rl, setup, t, record);
        const a = record && record.approval;
        if (!a) continue;
        // The customer sees everything that's been decided or is waiting on them, including a PM's "no" and why,
        // and requests sent back to the PM because they were edited after approval.
        const sentBack = a.state === "awaiting_pm" && a.editedAfterApproval;
        if (!["awaiting_customer", "approved", "absorbed", "customer_declined", "pm_rejected"].includes(a.state) && !sentBack) continue;
        const original = (a.original && a.original.description) || t.taskDescription || "";
        const s = approvals.signoffStatus(a);
        // Only people whose answer counts get the buttons; everyone else sees who it's waiting on.
        const canDecide =
          a.state === "awaiting_customer" && !s.decisions[user.userId] && (!s.approvers || s.approvers.some((p) => p.userId === user.userId));
        items.push({
          canDecide,
          rule: s.label,
          waitingOn: a.state === "awaiting_customer" ? s.pending : [],
          approvedBy: Object.values(s.decisions).filter((d) => d.decision === "approved").map((d) => d.name || d.email || d.userId),
          taskId: t.taskId,
          projectName: who.projectName,
          taskName: t.taskName,
          request: String(original).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
          hours: a.hours,
          note: a.note,
          state: a.state,
          status: sentBack
            ? "Back with your PM: edited after approval"
            : a.state === "absorbed" && !approvals.isDelivered(record, t)
              ? "Doing this at no charge"
              : approvals.stateLabel(a, approvals.isDelivered(record, t)),
          pmAt: a.pm && a.pm.at,
        });
      }
    }
    return { user: user.emailId || user.userId, items };
  }),

  // Checks the parts the build depends on, inside Rocketlane, without touching real data.
  selfTest: safely(async (r, { payload, user }) => {
    await requireOwner(rlFor(r), payload.projectId, user);
    const out = { user: user ? user.emailId : "unknown" };
    const p = r.installationParams || {};
    out.settings = { rlApiKey: !!p.rlApiKey, openrouterKey: !!p.openrouterKey, ...settings(r) };
    const prefix = `co-selftest:${Date.now()}`;
    try {
      const a = await store.claimNumber(r, prefix);
      const b = await store.claimNumber(r, prefix);
      out.coNumbers = a === 1 && b === 2 ? "ok: claimed 1 then 2" : `unexpected: ${a}, ${b}`;
    } catch (e) {
      out.coNumbers = "failed: " + e.message;
    }
    try {
      await r.kv.setAppValue({ key: `${prefix}:1`, value: { token: "intruder" }, ttlInSeconds: 60, setIf: "not_exist" });
      const still = await store.get(r, `${prefix}:1`);
      out.setIfNotExist = still && still.token !== "intruder" ? "ok: existing key not overwritten" : "NOT ENFORCED: key was overwritten";
    } catch (e) {
      out.setIfNotExist = "ok: rejected (" + e.message + ")";
    }
    return out;
  }),
};
