// Checks one customer request against its project's SOW with Jev, writes the result onto the task, and records it.
const crypto = require("crypto");
const { buildRequest, callJev, interpret, THRESHOLDS, MODEL } = require("../../core/decide");
const { parseSow } = require("../../core/parse-sow");
const store = require("./store");

const KIND_LABELS = { in_scope: "In scope", change_request: "Change request", blocker: "Blocker", noise: "Noise" };
const { SIZE_RANGES } = require("../../core/decide");
const SIZE_LABELS = Object.fromEntries(SIZE_RANGES.map((s) => [s.key, s.short]));
const SIZE_HOURS = Object.fromEntries(SIZE_RANGES.map((s) => [s.key, s.hours])); // rough midpoint; the PM sets real hours

const FIELD_NAMES = {
  details: "Request details",
  classification: "Classification",
  confidence: "Classifier confidence",
  effort: "Estimated effort (hours)",
};

const plain = (html) => String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const settings = (r) => {
  const p = r.installationParams || {};
  return {
    requestsPhase: p.requestsPhase || "Customer requests",
    approvedPhase: p.approvedPhase || "Approved changes",
    sowTaskPrefix: p.sowTaskPrefix || "SOW scope",
    minConfidence: p.minConfidence ? Number(p.minConfidence) / 100 : THRESHOLDS.minConfidence,
  };
};

// Task custom fields by label, with option label -> value for single choice. Cached; refreshed if a field is missing.
const fieldMap = async (r, rl, refresh) => {
  let map = refresh ? null : await store.get(r, "field-map-v2");
  if (!map || Object.values(FIELD_NAMES).some((n) => !map[n])) {
    map = {};
    for (const f of await rl.fields()) {
      if (f.objectType !== "TASK") continue;
      map[f.fieldLabel] = {
        fieldId: f.fieldId,
        options: Object.fromEntries((f.fieldOptions || []).map((o) => [o.optionLabel, o.optionValue])),
      };
    }
    await store.set(r, "field-map-v2", map);
  }
  return map;
};

// Everything a project needs: the requests phase, the SOW, the fields. Fails with a message a PM can act on.
const projectSetup = async (r, rl, projectId) => {
  const s = settings(r);
  const phases = await rl.phases(projectId);
  const byName = (name) => phases.find((p) => (p.phaseName || "").trim().toLowerCase() === name.toLowerCase());
  const phase = byName(s.requestsPhase);
  if (!phase) throw new Error(`This project has no "${s.requestsPhase}" phase, so there are no requests to check.`);
  const approved = byName(s.approvedPhase);
  const tasks = await rl.tasks(projectId);
  const sowTask = tasks.find((t) => (t.taskName || "").toLowerCase().startsWith(s.sowTaskPrefix.toLowerCase()));
  if (!sowTask) throw new Error(`No task named "${s.sowTaskPrefix}..." in this project. Add one with the signed scope so requests can be checked against it.`);
  const project = (tasks[0] && tasks[0].project && tasks[0].project.projectName) || "";
  const sow = parseSow(sowTask.taskDescription, { project });
  if (!Object.keys(sow.inScope).length) throw new Error(`"${sowTask.taskName}" has no in-scope list. Write the in-scope items as a bulleted list.`);
  return { ...s, phaseId: phase.phaseId, approvedPhaseId: approved ? approved.phaseId : phase.phaseId, sowTaskId: sowTask.taskId, sowTaskName: sowTask.taskName, sow, fields: await fieldMap(r, rl) };
};

const requestText = (task, fields) => {
  const details = (task.fields || []).find((f) => fields[FIELD_NAMES.details] && f.fieldId === fields[FIELD_NAMES.details].fieldId);
  const body = plain(task.taskDescription);
  const extra = details && details.fieldValue && !body.includes(String(details.fieldValue).slice(0, 40)) ? ` ${details.fieldValue}` : "";
  return `${task.taskName}. ${body}${extra}`.trim();
};

const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);

// Fingerprint of what was checked: the request text plus the SOW. Different = the stored result is stale.
const checkHash = (task, setup) => hash(requestText(task, setup.fields) + JSON.stringify(setup.sow));
// Fingerprint of the request text alone: what the PM approved. Different = the approval no longer holds.
const approvalHash = (task, setup) => hash(requestText(task, setup.fields));

// Returns the stored result if the request text hasn't changed since the last check, unless force is set.
const classifyTask = async (r, rl, setup, task, { force, user } = {}) => {
  const text = requestText(task, setup.fields);
  const key = `req:${task.taskId}`;
  const prev = await store.get(r, key);
  const textHash = checkHash(task, setup);
  if (prev && prev.hash === textHash && !force) return prev;
  // With the customer or agreed: the type is settled. Edits are handled by sending it back to the PM instead.
  if (prev && prev.approval && ["awaiting_customer", "approved", "absorbed"].includes(prev.approval.state)) return prev;

  const apiKey = (r.installationParams || {}).openrouterKey;
  if (!apiKey) throw new Error("OpenRouter key is not set in the app's install settings, so requests can't be checked.");
  const res = await callJev(apiKey, buildRequest(setup.sow, { text, raisedBy: "customer" }));
  const d = interpret(res.answers, { ...THRESHOLDS, minConfidence: setup.minConfidence });

  const f = setup.fields;
  // A PM's override wins over a re-check: keep their type on the task and in the record.
  const override = prev && prev.override;
  const label = override ? KIND_LABELS[override.kind] : d.action === "auto" ? KIND_LABELS[d.kind] : "Needs review";
  const updates = [{ fieldId: f[FIELD_NAMES.confidence].fieldId, fieldValue: Math.round(d.kindConfidence * 100) }];
  if (!override) updates.push({ fieldId: f[FIELD_NAMES.classification].fieldId, fieldValue: f[FIELD_NAMES.classification].options[label] });
  if (d.kind === "change_request") updates.push({ fieldId: f[FIELD_NAMES.effort].fieldId, fieldValue: SIZE_HOURS[d.size] });
  const body = { fields: updates };
  if (d.action === "auto" && d.kind === "blocker") body.atRisk = true;
  await rl.updateTask(task.taskId, body);

  const record = {
    taskId: task.taskId,
    taskName: task.taskName,
    hash: textHash,
    label,
    kind: d.kind,
    kindLabel: KIND_LABELS[d.kind],
    confidence: d.kindConfidence,
    probabilities: d.kindProbabilities,
    needsReview: d.action !== "auto",
    reviewSignal: d.reviewProbability,
    sowItem: d.sowItem,
    sowItemText: setup.sow.inScope[d.sowItem] || "Not in the SOW",
    size: d.size,
    sizeLabel: SIZE_LABELS[d.size],
    sizeHours: SIZE_HOURS[d.size],
    model: res.model || MODEL,
    cost: res.usage && res.usage.cost,
    checkedAt: new Date().toISOString(),
    checkedBy: user ? user.userId : null,
    override: override || undefined,
    approval: (prev && prev.approval) || undefined,
  };
  await store.set(r, key, record);
  await store.log(r, task.taskId, {
    event: prev ? "rechecked" : "checked",
    by: user ? user.name || user.emailId : "app",
    result: `${label} (${Math.round(d.kindConfidence * 100)}%)`,
  });
  return record;
};

module.exports = { projectSetup, classifyTask, checkHash, approvalHash, settings, KIND_LABELS, SIZE_LABELS };
