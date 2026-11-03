// Two-step approval for change requests: the PM approves first, then the customer signs off. Once both agree, the
// request itself becomes the change order: renamed CO-00N, given the agreed hours, and moved to "Approved changes"
// as open work. Before that, no work exists. Either side can withdraw until it's delivered. Who clicked always
// comes from Rocketlane (the server context), never from the browser, and every step is logged.
const store = require("./store");
const { KIND_LABELS, approvalHash } = require("./classify");

const TODO = 1;
const IN_PROGRESS = 2;
const COMPLETED = 3;
const FIELDS = { im: "IM decision", customer: "Customer sign-off", co: "Change order ID", classification: "Classification" };

// The PM and customer roles for a project, from Rocketlane itself.
const person = (u) => ({ userId: u.userId, email: (u.emailId || "").toLowerCase(), name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.emailId || String(u.userId) });
const roles = async (rl, projectId, user) => {
  const p = await rl.project(projectId);
  const ownerId = p.owner && p.owner.userId;
  const team = p.teamMembers || {};
  const customers = (team.customers || []).map(person);
  const champion = team.customerChampion && team.customerChampion.userId ? person(team.customerChampion) : null;
  const uid = user && user.userId;
  const email = ((user && user.emailId) || "").toLowerCase();
  return {
    projectName: p.projectName,
    ownerId,
    customers,
    champion,
    isOwner: !!uid && uid === ownerId,
    isCustomer: !!uid && customers.some((c) => c.userId === uid || (email && c.email === email)),
  };
};

// Who signs off for the customer, fixed when the PM approves so a change to the team mid-way doesn't move the goalposts.
//   champion: the project's customer champion (Rocketlane's own role); falls back to "first" if none is set
//   all:      every customer user on the project must approve; any one decline stops it
//   first:    any customer user; the first answer decides
const POLICIES = { champion: "Customer champion", all: "Every customer on the project", first: "First customer to respond" };
const signoffFor = (r, who) => {
  const policy = (r.installationParams || {}).signoffPolicy || "champion";
  if (policy === "champion" && who.champion) return { policy, label: `${POLICIES.champion} (${who.champion.name})`, approvers: [who.champion] };
  if (policy === "all") {
    mustBe(who.customers.length, "There are no customer users on this project to sign off.");
    return { policy, label: POLICIES.all, approvers: who.customers };
  }
  return { policy: "first", label: policy === "champion" ? `${POLICIES.first} (no champion set on this project)` : POLICIES.first, approvers: null };
};

// Each required approver's answer so far, and who we're still waiting on.
const signoffStatus = (a) => {
  const s = (a && a.signoff) || { policy: "first", label: POLICIES.first, approvers: null };
  const decisions = (a && a.decisions) || {};
  const people = (s.approvers || []).map((p) => ({ ...p, decision: decisions[p.userId] ? decisions[p.userId].decision : null }));
  return { ...s, people, pending: people.filter((p) => !p.decision).map((p) => p.name), decisions };
};

const effectiveKind = (record) => (record.override ? record.override.kind : record.kind);

// Decided and turned into work: a billable change order (CO-00N) or work done at no charge (NC-00N).
const AGREED = ["approved", "absorbed"];

// The task's own status says whether agreed work has been delivered.
const isDelivered = (record, task) =>
  !!(record && record.approval && AGREED.includes(record.approval.state) && task && task.status && task.status.value === COMPLETED);

// The team's line between "do it free" and "charge for it", in hours. 0 = no line set. A default the PM sees and
// can override, never an automatic decision; whether they followed it is recorded.
const sizeRule = (r) => Number((r.installationParams || {}).absorbUnderHours) || 0;
const ruleCheck = (r, hours, decision) => {
  const line = sizeRule(r);
  if (!line) return null;
  const suggested = hours < line ? "no charge" : "change order";
  return { line, suggested, followed: suggested === (decision === "absorb" ? "no charge" : "change order") };
};

const stateLabel = (a, delivered) =>
  ({
    awaiting_pm: "Awaiting PM",
    pm_rejected: "Rejected by PM",
    awaiting_customer:
      a && a.signoff && a.signoff.approvers && a.signoff.approvers.length > 1
        ? `Awaiting customer (${Object.values(a.decisions || {}).filter((d) => d.decision === "approved").length} of ${a.signoff.approvers.length})`
        : "Awaiting customer",
    customer_declined: "Declined by customer",
    approved: a && a.co ? `${a.co.label} ${delivered ? "delivered" : "agreed"}` : "Agreed",
    absorbed: a && a.co ? `${a.co.label} ${delivered ? "delivered" : "no charge"}` : "No charge",
    withdrawn: "Withdrawn",
  }[(a && a.state) || "awaiting_pm"]);

const actor = (user) => ({ userId: user.userId, name: user.name || null, email: user.emailId || null, at: new Date().toISOString() });

const fieldValue = (setup, name, option) => {
  const f = setup.fields[name];
  if (!f) throw new Error(`Task field "${name}" is missing. Run rl.py setup-fields.`);
  return { fieldId: f.fieldId, fieldValue: option === undefined ? "" : f.options[option] !== undefined ? f.options[option] : option };
};

const mustBe = (cond, message) => {
  if (!cond) throw new Error(message);
};

// PM changes the type (the human-in-the-loop override). Logged, and kept as a new eval case.
const override = async (r, rl, setup, task, record, { kind, reason }, user, who) => {
  mustBe(who.isOwner, "Only the project owner can change the type.");
  mustBe(KIND_LABELS[kind], `Unknown type "${kind}".`);
  mustBe(!record.approval || !["awaiting_customer", ...AGREED].includes(record.approval.state), "Withdraw the decision before changing the type.");
  const from = effectiveKind(record);
  record.override = { kind, reason: reason || "", ...actor(user) };
  record.label = KIND_LABELS[kind];
  await rl.updateTask(task.taskId, { fields: [fieldValue(setup, FIELDS.classification, record.label)] });
  const cases = (await store.get(r, "overrides")) || [];
  cases.push({ taskId: task.taskId, taskName: task.taskName, model: record.kind, modelConfidence: record.confidence, pm: kind, reason: reason || "", at: record.override.at });
  await store.set(r, "overrides", cases.slice(-500));
  await store.log(r, task.taskId, { event: "type changed", result: `${KIND_LABELS[from]} -> ${record.label}${reason ? ` (${reason})` : ""}`, by: user.name || user.emailId });
};

const pmDecide = async (r, rl, setup, task, record, { decision, hours, note }, user, who) => {
  mustBe(who.isOwner, "Only the project owner can approve or reject a change request.");
  if (effectiveKind(record) !== "change_request") {
    // From "Needs review" the PM's decision is the review: treat it as a change request, logged as their call (and
    // kept as an eval case if the model guessed otherwise). A confident result needs an explicit type change first.
    mustBe(record.needsReview && !record.override, "Only change requests go through approval. Change the type first if this is one.");
    await override(r, rl, setup, task, record, { kind: "change_request", reason: "PM decided it from Needs review" }, user, who);
  }
  const a = record.approval || { state: "awaiting_pm" };
  mustBe(["awaiting_pm", "pm_rejected", "customer_declined", "withdrawn"].includes(a.state), `Can't decide now: ${stateLabel(a)}.`);
  const h = Number(hours);
  const vsLine = (rule) => (rule ? ` (${rule.followed ? "matches" : "against"} the ${rule.line}h line)` : "");
  if (decision === "approve") {
    mustBe(h > 0 && h < 2000, "Enter the hours this change will take.");
    const rule = ruleCheck(r, h, decision);
    // The PM approves this exact wording. If the request is edited before the customer signs off, it comes back.
    record.approval = {
      ...a, state: "awaiting_customer", hours: h, note: note || "", pm: { decision: "approved", ...actor(user) }, customer: null,
      textHash: approvalHash(task, setup),
      signoff: signoffFor(r, who),
      decisions: {},
      rule,
    };
    await rl.updateTask(task.taskId, { fields: [fieldValue(setup, FIELDS.im, "Approved"), fieldValue(setup, FIELDS.customer, "Pending")] });
    await store.log(r, task.taskId, { event: "PM approved", result: `${h}h${vsLine(rule)}${note ? `: ${note}` : ""}`, by: user.name || user.emailId });
  } else if (decision === "absorb") {
    // Do it free: no customer sign-off needed, but logged with the hours so the team knows what it gives away.
    mustBe(h > 0 && h < 2000, "Enter the hours, so what's given away is on record.");
    const rule = ruleCheck(r, h, decision);
    record.approval = { ...a, hours: h, note: note || "", pm: { decision: "absorbed", ...actor(user) }, customer: null, decisions: {}, rule };
    await store.log(r, task.taskId, { event: "PM chose no charge", result: `${h}h${vsLine(rule)}${note ? `: ${note}` : ""}`, by: user.name || user.emailId });
    await convert(r, rl, setup, task, record, "nc");
  } else {
    mustBe(note, "Add a reason so the customer knows why.");
    record.approval = { ...a, state: "pm_rejected", note, pm: { decision: "rejected", ...actor(user) } };
    await rl.updateTask(task.taskId, { fields: [fieldValue(setup, FIELDS.im, "Rejected")] });
    await store.log(r, task.taskId, { event: "PM rejected", result: note, by: user.name || user.emailId });
  }
};

// Decided: the request becomes the work itself, open in "Approved changes" with the hours. Either a billable
// change order (CO-00N, after customer sign-off) or no-charge work (NC-00N, PM's call). Separate number series.
const convert = async (r, rl, setup, task, record, kind = "co") => {
  const a = record.approval;
  const n = await store.claimNumber(r, `${kind}:${task.project.projectId}`);
  const label = `${kind.toUpperCase()}-${String(n).padStart(3, "0")}`;
  const original = { name: task.taskName, description: task.taskDescription || "" };
  let summary;
  if (kind === "nc") {
    summary =
      `<p><b>${label}: done at no charge, ${a.hours}h.</b> PM decided ${a.pm.at.slice(0, 10)} (${a.pm.name || a.pm.email || a.pm.userId}).` +
      `${a.note ? ` Note: ${a.note}` : ""}</p>`;
  } else {
    const signedBy = Object.values(a.decisions || {}).filter((d) => d.decision === "approved").map((d) => d.name || d.email || d.userId);
    summary =
      `<p><b>${label} agreed: ${a.hours}h.</b> PM approved ${a.pm.at.slice(0, 10)} (${a.pm.name || a.pm.email || a.pm.userId}); ` +
      `customer signed off ${a.customer.at.slice(0, 10)} (${signedBy.join(", ") || a.customer.name || a.customer.email || a.customer.userId}` +
      `${a.signoff ? `; rule: ${a.signoff.label}` : ""}).${a.note ? ` Note: ${a.note}` : ""}</p>`;
  }

  await rl.moveTask(task.taskId, setup.approvedPhaseId);
  // Saved as soon as the task has moved, so a failure after this point still leaves it findable and withdrawable.
  record.approval = { ...a, state: kind === "nc" ? "absorbed" : "approved", co: { number: n, label, kind, at: new Date().toISOString() }, original };
  await store.set(r, `req:${task.taskId}`, record);
  const fields = [fieldValue(setup, FIELDS.im, "Approved"), fieldValue(setup, FIELDS.co, label)];
  if (kind === "co") fields.push(fieldValue(setup, FIELDS.customer, "Approved"));
  try {
    await rl.updateTask(task.taskId, {
      taskName: `${label}: ${original.name}`,
      taskDescription: original.description + summary,
      effortInMinutes: Math.round(a.hours * 60),
      status: { value: TODO },
      fields,
    });
  } catch (e) {
    await store.log(r, task.taskId, { event: "change incomplete", result: `${label} moved but not renamed: ${e.message}`, by: "app" });
    throw e;
  }
  await store.log(r, task.taskId, {
    event: kind === "nc" ? "no-charge work created" : "change order agreed",
    result: `${label}, ${a.hours}h, moved to "${setup.approvedPhase}"`,
    by: "app",
  });
};

// True if the request was edited after the PM approved it.
const editedSinceApproval = (task, setup, record) => {
  const a = record && record.approval;
  return !!(a && a.state === "awaiting_customer" && a.textHash && approvalHash(task, setup) !== a.textHash);
};

// The PM's hours were for the old wording, so an edit sends it back to the PM rather than letting a sign-off cover
// more than was approved. Runs whenever the request is opened or signed off. Returns true if it sent it back.
const sendBackIfEdited = async (r, rl, setup, task, record) => {
  if (!editedSinceApproval(task, setup, record)) return false;
  const a = record.approval;
  record.approval = { ...a, state: "awaiting_pm", pm: null, customer: null, decisions: {}, editedAfterApproval: new Date().toISOString() };
  await rl.updateTask(task.taskId, { fields: [fieldValue(setup, FIELDS.im, "Pending"), fieldValue(setup, FIELDS.customer, "Pending")] });
  await store.set(r, `req:${task.taskId}`, record);
  await store.log(r, task.taskId, { event: "edited after PM approval", result: "sent back to the PM before sign-off", by: "app" });
  return true;
};

const customerDecide = async (r, rl, setup, task, record, { decision, note }, user, who) => {
  mustBe(who.isCustomer, "Only a customer on this project can sign off.");
  if (await sendBackIfEdited(r, rl, setup, task, record)) {
    throw new Error("This request was edited after your PM approved it, so it has gone back to them to review the hours. Nothing was signed off.");
  }
  const a = record.approval || {};
  mustBe(a.state === "awaiting_customer", `Nothing to sign off: ${stateLabel(a)}.`);
  const status = signoffStatus(a);
  if (status.approvers) {
    mustBe(status.approvers.some((p) => p.userId === user.userId), `Your sign-off isn't needed on this one. It's waiting on ${status.pending.join(", ")}.`);
  }
  mustBe(!status.decisions[user.userId], "You've already answered this one.");
  const mine = { decision: decision === "approve" ? "approved" : "declined", note: note || "", ...actor(user) };
  const decisions = { ...status.decisions, [user.userId]: mine };

  if (decision !== "approve") {
    // Under every policy, one required "no" stops it.
    record.approval = { ...a, decisions, state: "customer_declined", customer: mine };
    await rl.updateTask(task.taskId, { fields: [fieldValue(setup, FIELDS.customer, "Rejected")] });
    await store.log(r, task.taskId, { event: "customer declined", result: note || "", by: user.name || user.emailId });
    return;
  }
  const waitingOn = status.approvers ? status.approvers.filter((p) => !decisions[p.userId]).map((p) => p.name) : [];
  record.approval = { ...a, decisions, customer: mine };
  if (waitingOn.length) {
    await store.log(r, task.taskId, { event: "customer approved", result: `${note ? `${note}. ` : ""}Still waiting on ${waitingOn.join(", ")}`, by: user.name || user.emailId });
    return;
  }
  await store.log(r, task.taskId, { event: "customer approved", result: note || "", by: user.name || user.emailId });
  await convert(r, rl, setup, task, record);
};

// Undo, until the work is delivered. An agreed change goes back to "Customer requests" under its original name;
// its CO number is retired, never reused.
const withdraw = async (r, rl, setup, task, record, { note }, user, who) => {
  const a = record.approval || {};
  const mine = (a.decisions || {})[user.userId];
  const approvingCustomer = (mine && mine.decision === "approved") || (a.customer && a.customer.userId === user.userId);
  mustBe(who.isOwner || (approvingCustomer && a.state !== "absorbed"), "Only the project owner or the customer who approved can withdraw.");
  mustBe(["awaiting_customer", ...AGREED].includes(a.state), `Nothing to withdraw: ${stateLabel(a)}.`);
  mustBe(!isDelivered(record, task), `${a.co && a.co.label} is already delivered, so it can't be withdrawn. Raise a new request instead.`);
  mustBe(
    !(AGREED.includes(a.state) && task.status && task.status.value === IN_PROGRESS),
    `Work on ${a.co && a.co.label} has started. If you really mean to cancel it, set the task back to To do first, then withdraw.`,
  );
  mustBe(note, "Add a reason for withdrawing.");
  const reset = [fieldValue(setup, FIELDS.im, "Pending"), fieldValue(setup, FIELDS.customer, "Pending"), fieldValue(setup, FIELDS.co, undefined)];
  if (AGREED.includes(a.state)) {
    // Skip the move if it's already there (e.g. agreed before v0.3, when the request never moved).
    if (!task.phase || task.phase.phaseId !== setup.phaseId) await rl.moveTask(task.taskId, setup.phaseId);
    const o = a.original || {};
    await rl.updateTask(task.taskId, {
      ...(o.name ? { taskName: o.name, taskDescription: o.description } : {}),
      effortInMinutes: 0, // no longer planned work
      status: { value: TODO },
      fields: reset,
    });
  } else {
    await rl.updateTask(task.taskId, { fields: reset });
  }
  const retired = [...(a.retired || []), ...(a.co ? [a.co.label] : [])];
  record.approval = { state: "withdrawn", retired, withdrawn: { note, ...actor(user) }, previous: { pm: a.pm, customer: a.customer, co: a.co, hours: a.hours } };
  await store.log(r, task.taskId, { event: "withdrawn", result: `${a.co ? `${a.co.label} cancelled, back in "${setup.requestsPhase}". ` : ""}${note}`, by: user.name || user.emailId });
};

module.exports = {
  AGREED, roles, effectiveKind, isDelivered, sizeRule, sendBackIfEdited, stateLabel, signoffStatus, POLICIES,
  override, pmDecide, customerDecide, withdraw,
};
