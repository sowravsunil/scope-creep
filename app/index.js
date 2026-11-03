// Change request checker: checks customer requests against the project's SOW with Jev, then (later steps)
// runs a two-step approval and turns approved changes into numbered change orders.
const actions = require("./server-actions/actions.js");

const serverActions = [
  { name: "inbox", description: "List a project's customer requests and stored results", run: actions.inbox },
  { name: "classify", description: "Check one request against the SOW", run: actions.classify },
  { name: "detail", description: "One request's result and history", run: actions.detail },
  { name: "decide", description: "Override, PM decision, customer sign-off, or withdraw", run: actions.decide },
  { name: "portal", description: "Change requests waiting for the customer", run: actions.portal },
  { name: "auditExport", description: "CSV of current decisions and retained history in a project", run: actions.auditExport },
  { name: "selfTest", description: "Check storage and settings inside Rocketlane", run: actions.selfTest },
];

const widgets = [
  {
    location: ["project_tab"],
    name: "Change requests",
    label: "Change requests",
    description: "Customer requests checked against the SOW",
    icon: "widgets/shared/icon.svg",
    entrypoint: { html: "widgets/inbox/index.html" },
    identifier: "cr-inbox",
    logo: "widgets/shared/logo.png",
  },
  {
    location: ["task_tab"],
    name: "Change request",
    label: "Change request",
    description: "This request's SOW check and history",
    icon: "widgets/shared/icon.svg",
    entrypoint: { html: "widgets/request/index.html" },
    identifier: "cr-request",
    logo: "widgets/shared/logo.png",
  },
  {
    location: ["customer_portal_widget"],
    name: "Change requests to sign off",
    label: "Change requests to sign off",
    description: "Customers approve or decline change requests their PM has approved",
    icon: "widgets/shared/icon.svg",
    entrypoint: { html: "widgets/portal/index.html" },
    identifier: "cr-portal",
    logo: "widgets/shared/logo.png",
  },
];

module.exports = {
  widgets,
  serverActions,
  version: "1.5.0",
  installationFields: () => [
    { name: "rlApiKey", label: "Rocketlane API key", type: "TEXT", required: true, secure: true, hidden: false, rerenderAllFields: false },
    { name: "openrouterKey", label: "OpenRouter API key (for Jev)", type: "TEXT", required: true, secure: true, hidden: false, rerenderAllFields: false },
    {
      name: "requestsPhase", label: "Phase that holds customer requests", type: "TEXT", required: false, secure: false,
      hidden: false, rerenderAllFields: false, defaultValue: "Customer requests",
    },
    {
      name: "signoffPolicy", label: "Who signs off for the customer", type: "SINGLE_SELECT", required: false, secure: false,
      hidden: false, rerenderAllFields: false, defaultValue: "champion",
      metaData: {
        options: [
          { label: "The project's customer champion (any customer if none is set)", value: "champion" },
          { label: "Every customer on the project (any decline stops it)", value: "all" },
          { label: "The first customer to respond", value: "first" },
        ],
      },
    },
    {
      name: "absorbUnderHours", label: "Do it at no charge under this many hours (0 = no line; the PM always decides)", type: "NUMBER",
      required: false, secure: false, hidden: false, rerenderAllFields: false, defaultValue: 0, metaData: { range: { min: 0, max: 200 } },
    },
    {
      name: "approvedPhase", label: "Phase for approved change orders", type: "TEXT", required: false, secure: false,
      hidden: false, rerenderAllFields: false, defaultValue: "Approved changes",
    },
    {
      name: "sowTaskPrefix", label: "Name of the task that holds the signed SOW (starts with)", type: "TEXT", required: false,
      secure: false, hidden: false, rerenderAllFields: false, defaultValue: "SOW scope",
    },
    {
      name: "minConfidence", label: "Flag for closer review below this confidence (%)", type: "NUMBER", required: false,
      secure: false, hidden: false, rerenderAllFields: false, defaultValue: 60, metaData: { range: { min: 0, max: 100 } },
    },
  ],
};
