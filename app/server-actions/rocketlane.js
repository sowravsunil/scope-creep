// Minimal Rocketlane REST client for the app's server code. Uses the API key from the app's install settings.
const BASE = "https://api.rocketlane.com/api/1.0";

const rocketlane = (apiKey) => {
  if (!apiKey) throw new Error("Rocketlane API key is not set in the app's install settings.");

  const call = async (method, path, { params, body } = {}) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    const res = await fetch(BASE + path + qs, {
      method,
      headers: { "api-key": apiKey, accept: "application/json", "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Rocketlane ${method} ${path} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  };

  // Follows pageToken until the list is complete.
  const all = async (path, params) => {
    const out = [];
    let query = { pageSize: 100, ...params };
    for (;;) {
      const page = await call("GET", path, { params: query });
      out.push(...((page && page.data) || []));
      const next = page && page.pagination;
      if (!next || !next.hasMore) return out;
      query = { ...query, pageToken: next.nextPageToken };
    }
  };

  return {
    call,
    phases: (projectId) => all("/phases", { projectId }),
    tasks: (projectId, phaseId) =>
      all("/tasks", { "projectId.eq": projectId, ...(phaseId ? { "phaseId.eq": phaseId } : {}), includeAllFields: "true" }),
    task: (taskId) => call("GET", `/tasks/${taskId}`, { params: { includeAllFields: "true" } }),
    updateTask: (taskId, body) => call("PUT", `/tasks/${taskId}`, { body }),
    createTask: (body) => call("POST", "/tasks", { body }),
    moveTask: (taskId, phaseId) => call("POST", `/tasks/${taskId}/move-phase`, { body: { phase: { phaseId } } }),
    deleteTask: (taskId) => call("DELETE", `/tasks/${taskId}`),
    project: (projectId) => call("GET", `/projects/${projectId}`, { params: { includeAllFields: "true" } }),
    projects: () => all("/projects"),
    users: () => all("/users"),
    fields: () => all("/fields", { includeFields: "options" }),
  };
};

module.exports = { rocketlane };
