// The app's own storage (Rocketlane KV). Works from button clicks and widget loads; not from scheduled runs (no credentials there).
const YEAR = 365 * 24 * 60 * 60;

const get = async (r, key) => {
  const v = await r.kv.getAppValue(key);
  return v ? v.value : null;
};

const set = (r, key, value) => r.kv.setAppValue({ key, value, ttlInSeconds: YEAR });

// Appends to a short per-task history: who did what, when. Read-modify-write is fine at this volume.
const log = async (r, taskId, event) => {
  const key = `log:${taskId}`;
  const prev = (await get(r, key)) || [];
  prev.push({ at: new Date().toISOString(), ...event });
  await set(r, key, prev.slice(-50));
};

// Claims the next change order number for a project. Each number is its own key, written only if it doesn't exist,
// then read back to confirm we own it. (The KV increment call returns 403 for custom apps, so no counter.)
const claimNumber = async (r, prefix) => {
  const hint = (await get(r, `${prefix}:last`)) || 0;
  for (let n = hint + 1; n < hint + 200; n++) {
    const key = `${prefix}:${n}`;
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await r.kv.setAppValue({ key, value: { token }, ttlInSeconds: YEAR, setIf: "not_exist" });
    } catch (e) {
      continue; // taken
    }
    const back = await get(r, key);
    if (back && back.token === token) {
      await set(r, `${prefix}:last`, n);
      return n;
    }
  }
  throw new Error(`Couldn't claim a number under ${prefix}`);
};

// One change at a time per request: two people clicking at once (or a double click) can't both get through.
// The lock is a key written only if it doesn't exist. Stale after 60s, so a crash can't leave a request stuck.
const withLock = async (r, name, fn) => {
  const key = `lock:${name}`;
  const take = () => r.kv.setAppValue({ key, value: { at: Date.now() }, ttlInSeconds: 60, setIf: "not_exist" });
  try {
    await take();
  } catch (e) {
    const held = await get(r, key);
    if (held && Date.now() - held.at < 60_000) throw new Error("Someone else is updating this request right now. Try again in a moment.");
    await r.kv.deleteAppValue(key).catch(() => {});
    await take();
  }
  try {
    return await fn();
  } finally {
    await r.kv.deleteAppValue(key).catch(() => {});
  }
};

// Rocketlane tells server code who clicked (id and email) but not their name. Names are looked up once from the
// users API and remembered, so history and approvals show "Adam Smith", not an email address.
const withName = async (r, rl, user) => {
  if (!user || !user.userId) return user;
  let names = (await get(r, "user-names")) || {};
  if (!names[user.userId]) {
    for (const u of await rl.users()) {
      names[u.userId] = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || String(u.userId);
    }
    await set(r, "user-names", names);
  }
  return { ...user, name: names[user.userId] || user.emailId };
};

module.exports = { get, set, log, claimNumber, withLock, withName };
