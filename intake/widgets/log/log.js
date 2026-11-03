const { start, call, get, esc, showError } = window.CR;
const main = document.getElementById("main");

const form = (ctx) => `
  <textarea class="paste" id="text" placeholder="e.g. Thanks for today's call! Could you also add a returns portal for our UK stores? And can agent training move to the week of Dec 1?"></textarea>
  <div class="controls">
    <label>From <select id="source">
      <option value="call">A call (my notes)</option><option value="chat">Chat</option><option value="email">Email</option>
      <option value="signal">A Nitro signal</option><option value="other">Other</option></select></label>
    <label>Asked by <select id="askedBy">
      ${ctx.customers.map((c) => `<option>${esc(c.name)}</option>`).join("")}<option value="">Someone else</option></select></label>
    <button id="draft" class="primary">Draft requests</button>
  </div>
  <div id="drafts"></div>`;

// A draft whose words are already in a task starts unticked, so the same chat pasted twice doesn't log twice.
const draftCard = (a, i) => `
  <div class="draft" data-i="${i}">
    <label><input type="checkbox" class="keep" ${a.duplicateOf ? "" : "checked"}> Log this one</label>
    ${a.duplicateOf ? `<span class="badge b-review" style="margin-left:8px">Already logged as "${esc(a.duplicateOf.title)}"</span>` : ""}
    <input class="title" value="${esc(a.title)}" data-orig="${esc(a.title)}">
    <textarea class="summary" data-orig="${esc(a.summary)}" placeholder="One line on what's being asked">${esc(a.summary)}</textarea>
    <div class="quote">Their words: "${esc(a.quote)}"</div>
  </div>`;

const run = async () => {
  const client = await start();
  const project = await get(client, "project");
  const projectId = project && (project.projectId || (project.project && project.project.projectId));
  if (!projectId) throw new Error("Couldn't tell which project this is.");
  const ctx = await call(client, "context", { projectId });
  main.innerHTML = form(ctx);

  let drafts = [];
  document.getElementById("draft").addEventListener("click", async (e) => {
    const text = document.getElementById("text").value;
    const box = document.getElementById("drafts");
    e.target.disabled = true;
    box.innerHTML = `<p class="muted">Reading it...</p>`;
    try {
      const res = await call(client, "draft", { text, projectId, source: document.getElementById("source").value, projectName: ctx.projectName });
      drafts = res.asks;
      window.__drafts = drafts; // logThem reads the quotes from here: the customer's words aren't editable
      box.innerHTML =
        (res.note ? `<div class="error" style="margin-bottom:10px">${esc(res.note)}</div>` : "") +
        (drafts.length
          ? `<p class="muted">${drafts.length === 1 ? "One ask" : `${drafts.length} separate asks`} found${
              drafts.some((a) => a.duplicateOf) ? `, ${drafts.filter((a) => a.duplicateOf).length} already logged` : ""
            }. Edit anything, untick what isn't a real request, then log.</p>` +
            drafts.map(draftCard).join("") +
            `<button id="log" class="primary">Log ${drafts.length === 1 ? "it" : "them"}</button>`
          : `<p class="muted">No ask found in this message (thanks, FYIs and greetings are skipped). Nothing to log.</p>`) +
        (res.dropped && res.dropped.length
          ? `<p class="muted" style="margin-top:10px">Left out ${res.dropped.length}: ${res.dropped.map((d) => `"${esc(d.title)}" (${esc(d.reason)})`).join("; ")}</p>`
          : "");
      const log = document.getElementById("log");
      if (log) log.addEventListener("click", () => logThem(client, projectId, text));
    } catch (err) {
      box.innerHTML = `<div class="error">${esc(err.message)}</div>`;
    }
    e.target.disabled = false;
  });
};

const logThem = async (client, projectId, original) => {
  const cards = [...document.querySelectorAll(".draft")].filter((c) => c.querySelector(".keep").checked);
  const box0 = document.getElementById("drafts");
  if (!cards.length) {
    box0.insertAdjacentHTML("beforeend", `<p class="muted" style="margin-top:8px">Nothing ticked, so nothing was logged.</p>`);
    return;
  }
  const asks = cards.map((c) => {
    const i = Number(c.dataset.i);
    const title = c.querySelector(".title");
    const summary = c.querySelector(".summary");
    return { title: title.value, summary: summary.value, quote: window.__drafts[i].quote, edited: title.value !== title.dataset.orig || summary.value !== summary.dataset.orig };
  });
  const box = document.getElementById("drafts");
  try {
    const res = await call(client, "log", {
      projectId,
      asks,
      original,
      source: document.getElementById("source").value,
      askedBy: document.getElementById("askedBy").value,
    });
    box.innerHTML =
      `<p>Logged ${res.created.length}: ${res.created.map((c) => `<b>${esc(c.title)}</b>`).join(", ")}.</p>` +
      `<p class="muted">They're in "Customer requests", assigned to you. Open the Change requests tab to see them checked against the SOW.</p>`;
    document.getElementById("text").value = "";
  } catch (err) {
    box.insertAdjacentHTML("beforeend", `<div class="error" style="margin-top:8px">${esc(err.message)}</div>`);
  }
};

run().catch((e) => showError(main, e));
