// The signed SOW for the Northwind demo project, as data.
// Same scope as the "SOW scope (reference)" task that seed.py creates. Keys are what Jev picks from.
module.exports = {
  project: "Northwind Retail: Support desk rollout",
  contract: "Fixed fee, $48,000, 320 hours. Go-live Dec 4, then 2 weeks of hypercare.",
  inScope: {
    email_channels: "2 email channels: support@ and orders@",
    ticket_forms: "Ticket fields and forms for the 3 store regions: US, UK, DE",
    sla_tiers: "4 SLA tiers: Standard, Priority, VIP, Store ops",
    agent_groups: "3 agent groups with roles, up to 60 agents",
    shopify_lookup: "Shopify integration: order lookup in the ticket sidebar, read only",
    zendesk_migration: "Migration of 2 years of Zendesk tickets (about 180k) with attachments",
    training: "2 agent training sessions and 1 admin training",
    hypercare: "2 weeks of hypercare after go-live",
  },
  outOfScope: [
    "Returns portal",
    "Loyalty data",
    "Wholesale accounts",
    "Other ticket sources (chat, social, phone)",
  ],
};
