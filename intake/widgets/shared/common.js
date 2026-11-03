// Shared helpers for both widgets: SDK start-up, calling server actions, and small formatting bits.
window.CR = (() => {
  const start = () => window.rliSdk.init({});

  // Server actions return { ok, ... } inside the SDK's { response } wrapper.
  const call = async (client, action, payload) => {
    const res = await client.data.invoke(action, payload || {});
    const body = res && res.response !== undefined ? res.response : res;
    if (!body) throw new Error(`No response from ${action}`);
    if (body.ok === false) throw new Error(body.error);
    return body;
  };

  // data.get returns { response: { project: {...} } } style objects.
  const get = async (client, name) => {
    const res = await client.data.get(name);
    const body = res && res.response ? res.response : res;
    return (body && body[name]) || body;
  };

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x) => (x == null ? "" : `${Math.round(x * 100)}%`);
  const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
  const badgeClass = (label) =>
    ({ "Change request": "b-cr", "In scope": "b-in", Blocker: "b-block", Noise: "b-noise", "Needs review": "b-review" }[label] ||
      (/no charge/i.test(label) ? "b-in" : /agreed|delivered/i.test(label) ? "b-cr" : "b-noise"));
  const badge = (label) => `<span class="badge ${badgeClass(label)}">${esc(label)}</span>`;

  const showError = (el, err) => {
    el.innerHTML = `<div class="error">${esc(err && err.message ? err.message : err)}</div>`;
  };

  return { start, call, get, esc, pct, when, badge, showError };
})();
