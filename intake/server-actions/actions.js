// Request intake: turns a pasted conversation into request tasks in the project's "Customer requests" phase.
// The Change requests app then checks each one against the SOW when its inbox is opened.
const { rocketlane } = require("../../app/server-actions/rocketlane");
const { requireOwner } = require("../../app/server-actions/access");
const { extractAsks, fallback, quoteIsReal } = require("../../core/extract");

const unpack = (args) => ({ payload: (args && args.payload) || {}, user: (args && args.context && args.context.user) || null });
const safely = (fn) => async (r, args) => {
  try {
    return { ok: true, ...(await fn(r, unpack(args))) };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
};
const params = (r) => r.installationParams || {};
const rlFor = (r) => rocketlane(params(r).rlApiKey);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const name = (u) => [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || u.emailId || String(u.userId);

const SOURCES = { call: "a call", chat: "a chat message", email: "an email", signal: "a Nitro signal", other: "a conversation" };

const requestsPhase = async (r, rl, projectId) => {
  const want = (params(r).requestsPhase || "Customer requests").toLowerCase();
  const phase = (await rl.phases(projectId)).find((p) => (p.phaseName || "").trim().toLowerCase() === want);
  if (!phase) throw new Error(`This project has no "${params(r).requestsPhase || "Customer requests"}" phase to log requests into.`);
  return phase;
};

// Has this ask been logged before? Matched on the customer's words, not the title: the drafting model words titles
// differently each time, but the quote is copied from the message. Looks at every task in the project, so a request
// that has already become CO-00N or NC-00N still counts.
const findExisting = async (rl, projectId, asks) => {
  const tasks = await rl.tasks(projectId);
  const text = (t) => [t.taskDescription, ...(t.fields || []).map((f) => f.fieldValue)].map((v) => String(v || "")).join(" ");
  return asks.map((a) => {
    const hit = tasks.find((t) => quoteIsReal(a.quote, text(t).replace(/<[^>]+>/g, " ")));
    return hit ? { ...a, duplicateOf: { taskId: hit.taskId, title: hit.taskName } } : a;
  });
};

module.exports = {
  // Who can be "asked by": the customers on this project, champion first.
  context: safely(async (r, { payload, user }) => {
    const rl = rlFor(r);
    const p = await requireOwner(rl, payload.projectId, user);
    await requestsPhase(r, rl, payload.projectId);
    const team = p.teamMembers || {};
    const champ = team.customerChampion && team.customerChampion.userId;
    const customers = (team.customers || [])
      .map((c) => ({ userId: c.userId, name: name(c), champion: c.userId === champ }))
      .sort((a, b) => b.champion - a.champion);
    return { projectName: p.projectName, customers };
  }),

  // Draft one request per ask. The PM reviews before anything is created.
  draft: safely(async (r, { payload, user }) => {
    await requireOwner(rlFor(r), payload.projectId, user);
    const text = String(payload.text || "").trim();
    if (text.length < 5) throw new Error("Paste the message or your note first.");
    try {
      const out = await extractAsks(params(r).openrouterKey, {
        text,
        source: SOURCES[payload.source] || SOURCES.other,
        project: payload.projectName,
        model: params(r).extractModel || undefined,
      });
      const asks = payload.projectId ? await findExisting(rlFor(r), payload.projectId, out.asks) : out.asks;
      return { ...out, asks, fallback: false };
    } catch (e) {
      // Never block the PM on the drafting model: give one editable draft and say why.
      return { asks: fallback(text), dropped: [], fallback: true, note: `Couldn't draft automatically (${e.message}). Edit this one by hand.` };
    }
  }),

  // Create the request tasks. The customer's own words go in the description and the Request details field (that's
  // what the Change requests app checks); the full original message goes in the private note, for the team only.
  log: safely(async (r, { payload, user }) => {
    const rl = rlFor(r);
    await requireOwner(rl, payload.projectId, user);
    const asks = (payload.asks || []).filter((a) => a && String(a.title || "").trim());
    if (!asks.length) throw new Error("Nothing to log.");
    const phase = await requestsPhase(r, rl, payload.projectId);
    const details = (await rl.fields()).find((f) => f.objectType === "TASK" && f.fieldLabel === "Request details");
    const day = new Date().toISOString().slice(0, 10);
    // The customer can read this line, so it shows the logger's name, not their email.
    const me = user && user.userId ? (await rl.users()).find((u) => String(u.userId) === String(user.userId)) : null;
    const from = `Logged by ${esc(me ? name(me) : "the team")} from ${SOURCES[payload.source] || SOURCES.other} on ${day}` +
      (payload.askedBy ? `, asked by ${esc(payload.askedBy)}` : "");
    const created = [];
    for (const a of asks) {
      const description =
        (a.summary ? `<p>${esc(a.summary)}</p>` : "") +
        `<p>Their words: "${esc(a.quote)}"</p><p><i>${from}.</i></p>`;
      const task = await rl.createTask({
        taskName: String(a.title).trim().slice(0, 120),
        taskDescription: description,
        taskPrivateNote: `<p><b>Original ${esc(SOURCES[payload.source] || "message")}:</b></p><p>${esc(payload.original || "").replace(/\n/g, "<br>")}</p>`,
        project: { projectId: payload.projectId },
        phase: { phaseId: phase.phaseId },
        // Owned by whoever logged it, so it shows up in their tasks instead of sitting unassigned.
        ...(user && user.userId ? { assignees: { members: [{ userId: user.userId }] } } : {}),
        ...(details ? { fields: [{ fieldId: details.fieldId, fieldValue: a.quote }] } : {}),
      });
      created.push({ taskId: task.taskId, title: task.taskName, edited: !!a.edited });
    }
    // How often the PM had to fix the drafts: the writing model's quality signal.
    const prev = (await r.kv.getAppValue("stats").catch(() => null)) || null;
    const stats = (prev && prev.value) || { logged: 0, edited: 0 };
    stats.logged += created.length;
    stats.edited += created.filter((c) => c.edited).length;
    await r.kv.setAppValue({ key: "stats", value: stats, ttlInSeconds: 365 * 24 * 60 * 60 }).catch(() => {});
    return { created, stats };
  }),
};
