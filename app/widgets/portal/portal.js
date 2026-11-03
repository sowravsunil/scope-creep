const { start, call, get, esc, when, badge, showError } = window.CR;
const main = document.getElementById("main");

// The customer sees the request, the agreed hours and the PM's note. No model scores: those are internal.
const item = (x) => `
  <div class="item" data-task="${esc(x.taskId)}">
    <div class="title">${esc(x.taskName)} ${badge(x.status)}</div>
    <div class="muted" style="margin-bottom:8px">${esc(x.projectName)}</div>
    ${x.request ? `<div style="margin-bottom:8px">"${esc(x.request)}"</div>` : ""}
    <div class="row"><span class="k">Effort</span><span>${esc(x.hours)} hours</span></div>
    ${x.note ? `<div class="row"><span class="k">From your PM</span><span>${esc(x.note)}</span></div>` : ""}
    <div class="row"><span class="k">Sent</span><span class="muted">${when(x.pmAt)}</span></div>
    ${x.state === "awaiting_customer" ? `<div class="row"><span class="k">Sign-off</span><span>${esc(x.rule)}${
      x.approvedBy.length ? ` · approved by ${esc(x.approvedBy.join(", "))}` : ""}${
      x.waitingOn.length ? ` · waiting on ${esc(x.waitingOn.join(", "))}` : ""}</span></div>` : ""}
    ${x.canDecide ? `
      <div class="row"><span class="k">Note</span><input class="note" placeholder="Optional" style="flex:1"></div>
      <button data-decision="approve">Approve ${esc(x.hours)} hours</button>
      <button data-decision="decline">Decline</button>` : ""}
    <div class="err"></div>
  </div>`;

const run = async () => {
  const client = await start();
  // A portal widget may or may not know its project; the server falls back to every project this customer is on.
  let projectId = null;
  try {
    const p = await get(client, "project");
    projectId = p && (p.projectId || (p.project && p.project.projectId));
  } catch (e) {}

  const load = async () => {
    const d = await call(client, "portal", projectId ? { projectId } : {});
    // "Waiting for you" means your answer is needed; the rest (including ones waiting on someone else) are below.
    const waiting = d.items.filter((x) => x.canDecide);
    const done = d.items.filter((x) => !x.canDecide);
    main.innerHTML =
      (waiting.length ? waiting.map(item).join("") : `<p class="muted">Nothing waiting for you right now.</p>`) +
      (done.length ? `<h2 style="margin-top:16px">Everything else</h2>${done.map(item).join("")}` : "");

    main.querySelectorAll("button[data-decision]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const box = btn.closest(".item");
        box.querySelectorAll("button").forEach((b) => (b.disabled = true));
        try {
          await call(client, "decide", {
            taskId: box.dataset.task,
            step: "customer",
            decision: btn.dataset.decision,
            note: box.querySelector(".note").value,
          });
          await load();
        } catch (e) {
          box.querySelectorAll("button").forEach((b) => (b.disabled = false));
          box.querySelector(".err").innerHTML = `<div class="error" style="margin-top:8px">${esc(e.message)}</div>`;
        }
      }),
    );
  };
  await load();
};

run().catch((e) => showError(main, e));
