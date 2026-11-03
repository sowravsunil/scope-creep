// Request intake: paste a chat, email, call note or signal; a writing model drafts one request per ask, quoting the
// customer's words; the PM edits and logs them as tasks in "Customer requests". The Change requests app decides.
const actions = require("./server-actions/actions.js");

module.exports = {
  widgets: [
    {
      location: ["project_tab"],
      name: "Log a request",
      label: "Log a request",
      description: "Turn a chat, email, call note or signal into customer requests",
      icon: "widgets/shared/icon.svg",
      entrypoint: { html: "widgets/log/index.html" },
      identifier: "cr-intake",
      logo: "widgets/shared/logo.png",
    },
  ],
  serverActions: [
    { name: "context", description: "The project's customers and requests phase", run: actions.context },
    { name: "draft", description: "Draft one request per ask from a pasted message", run: actions.draft },
    { name: "log", description: "Create the request tasks", run: actions.log },
  ],
  version: "1.2.0",
  installationFields: () => [
    { name: "rlApiKey", label: "Rocketlane API key", type: "TEXT", required: true, secure: true, hidden: false, rerenderAllFields: false },
    { name: "openrouterKey", label: "OpenRouter API key (for drafting)", type: "TEXT", required: true, secure: true, hidden: false, rerenderAllFields: false },
    {
      name: "requestsPhase", label: "Phase that holds customer requests", type: "TEXT", required: false, secure: false,
      hidden: false, rerenderAllFields: false, defaultValue: "Customer requests",
    },
    {
      name: "extractModel", label: "Drafting model (OpenRouter id)", type: "TEXT", required: false, secure: false,
      hidden: false, rerenderAllFields: false, defaultValue: "anthropic/claude-haiku-5.5",
    },
  ],
};
