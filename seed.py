#!/usr/bin/env python3
"""Populate the trial with a fake demo project (Northwind Retail).

Usage (run from this folder):
  python3 seed.py                        # create customer, project, phases, tasks; IDs saved to seed.json
  python3 seed.py --customer you@x.com   # same, and add that address as a customer user on the project
  python3 seed.py teardown               # delete the project created above

All data is made up. Only pass --customer with an address you own: Rocketlane emails it an invite.
"""
import datetime
import json
import os
import sys

from rl import HERE, call, items, show

OWNER_ID = None  # the project owner and the PM; set in cmd_seed
PROJECT = "Northwind Retail: Support desk rollout"
CUSTOMER = "Northwind Retail"
SEED_FILE = os.path.join(HERE, "seed.json")

# The plan below is written as if today were week 3 of the project (2026-11-03). Every date is shifted by however far
# the real today is from that, so a reseed on any day shows the same picture: discovery done, configuration under way,
# nothing overdue.
PLAN_TODAY = datetime.date(2026, 11, 3)
SHIFT = datetime.date.today() - PLAN_TODAY


def when(day):
    return (datetime.date.fromisoformat(day) + SHIFT).isoformat()

TODO, IN_PROGRESS, DONE, BLOCKED = 1, 2, 3, 4

SOW_SCOPE = """<p><b>Signed SOW, fixed fee $48,000, 320 hours.</b> In scope:</p><ul>
<li>2 email channels: support@ and orders@</li>
<li>Ticket fields and forms for the 3 store regions (US, UK, DE)</li>
<li>4 SLA tiers: Standard, Priority, VIP, Store ops</li>
<li>3 agent groups with roles, up to 60 agents</li>
<li>Shopify integration: order lookup in the ticket sidebar (read only)</li>
<li>Migration of 2 years of Zendesk tickets (about 180k) with attachments</li>
<li>2 agent training sessions and 1 admin training</li>
<li>2 weeks of hypercare after go-live</li></ul>
<p>Out of scope: returns portal, loyalty data, wholesale accounts, other ticket sources.</p>"""

# (name, start, due)
PHASES = [
    ("Discovery", "2026-10-19", "2026-10-30"),
    ("Configuration", "2026-10-26", "2026-11-20"),
    ("Data migration", "2026-11-09", "2026-11-27"),
    ("Training and go-live", "2026-11-23", "2026-12-18"),
    ("Customer requests", "2026-10-19", "2026-12-18"),
    ("Approved changes", "2026-10-19", "2026-12-18"),
]

# (phase, name, start, due, effort hours, status, milestone, description)
TASKS = [
    ("Discovery", "SOW scope (reference)", "2026-10-19", "2026-10-19", 0, DONE, False, SOW_SCOPE),
    ("Discovery", "Kickoff call", "2026-10-19", "2026-10-19", 2, DONE, True, ""),
    ("Discovery", "Requirements workshop", "2026-10-21", "2026-10-22", 8, DONE, False, ""),
    ("Discovery", "Solution design sign-off", "2026-10-26", "2026-10-30", 6, DONE, True, ""),
    ("Configuration", "Set up support@ and orders@ email channels", "2026-10-26", "2026-11-06", 6, IN_PROGRESS, False, ""),
    ("Configuration", "Ticket fields and forms for US, UK, DE", "2026-11-02", "2026-11-06", 16, TODO, False, ""),
    ("Configuration", "Build the 4 SLA tiers", "2026-11-02", "2026-11-10", 12, TODO, False, ""),
    ("Configuration", "Agent groups and roles", "2026-11-09", "2026-11-13", 10, TODO, False, ""),
    ("Configuration", "Shopify order lookup integration", "2026-11-10", "2026-11-20", 24, TODO, False, ""),
    ("Data migration", "Export 2 years of Zendesk tickets", "2026-11-09", "2026-11-13", 12, TODO, False, ""),
    ("Data migration", "Field mapping and test import", "2026-11-16", "2026-11-20", 20, TODO, False, ""),
    ("Data migration", "Final migration run", "2026-11-24", "2026-11-27", 16, TODO, True, ""),
    ("Training and go-live", "Admin training", "2026-11-23", "2026-11-24", 4, TODO, False, ""),
    ("Training and go-live", "Agent training (2 sessions)", "2026-11-30", "2026-12-02", 8, TODO, False, ""),
    ("Training and go-live", "Go-live", "2026-12-04", "2026-12-04", 4, TODO, True, ""),
    ("Training and go-live", "Hypercare", "2026-12-07", "2026-12-18", 30, TODO, False, ""),
]

# Raised by the customer. Left unclassified: sorting these is the prototype's job.
# (title, what the customer wrote)
REQUESTS = [
    ("Returns portal for EU stores",
     "Hi team, while you're in there can you also set up the returns portal for our UK and DE stores? "
     "Our ops lead assumed it was part of this. Ideally before go-live."),
    ("Where do agents see order history?",
     "Quick question from our support lead: once Shopify is connected, where exactly will agents see a "
     "customer's past orders? Want to put it in the training deck."),
    ("Sandbox login broken",
     "None of us can log in to the sandbox since this morning, it says the SSO certificate is invalid. "
     "Our admins are blocked on reviewing the ticket forms."),
    ("Three more SLA tiers for wholesale",
     "We forgot about wholesale accounts in the workshop. Can we add three more SLA tiers for them "
     "(Gold, Silver, Bronze)? Same setup as the others."),
    ("Thanks for the workshop",
     "Thanks for running the workshop on Wednesday, the team found it really useful."),
    ("Also migrate the 2019 Freshdesk tickets",
     "Could you quickly also pull in the Freshdesk tickets from the company we acquired in 2019? "
     "It's a smaller account, maybe 20k tickets. Should be the same process as Zendesk right?"),
    ("Move agent training to week of Dec 1",
     "Black Friday week is going to be hard for us. Can agent training move to the week of December 1?"),
    ("Show loyalty points in the Shopify panel",
     "Can the Shopify sidebar also show loyalty points? We use a loyalty app that writes them to the "
     "customer record."),
    # A small ask, the grey zone partners described: the model is unsure (roughly 50/50, "Needs review") and sizes
    # it under an hour, so with a 2-hour line the PM is nudged towards doing it at no charge.
    ("One more canned response for holiday hours",
     "Can you add one more canned response for our holiday opening hours? Just a short paragraph we'll send you."),
]


def field_ids():
    path = os.path.join(HERE, "fields.json")
    if not os.path.exists(path):
        sys.exit("fields.json not found. Run: python3 rl.py setup-fields")
    return {label: f.get("fieldId") for label, f in json.load(open(path)).items()}


def find_project():
    status, resp = call("GET", "/projects", params={"pageSize": 100})
    for p in items(resp) if 200 <= status < 300 else []:
        if p.get("projectName") == PROJECT:
            return p.get("projectId")
    return None


def find_owner():
    """RL_OWNER_ID from .env if set, else the account's first team member (on a fresh trial, the admin)."""
    if os.environ.get("RL_OWNER_ID"):
        return int(os.environ["RL_OWNER_ID"])
    status, resp = call("GET", "/users", params={"pageSize": 100})
    for u in items(resp) if 200 <= status < 300 else []:
        if u.get("type") == "TEAM_MEMBER":
            return u.get("userId")
    sys.exit("No team member found to own the project. Set RL_OWNER_ID in .env.")


def cmd_seed(customer_email=None):
    global OWNER_ID
    if find_project():
        sys.exit(f"'{PROJECT}' already exists. Run 'python3 seed.py teardown' first to recreate it.")
    fields = field_ids()
    OWNER_ID = find_owner()

    project = {"projectName": PROJECT, "customer": {"companyName": CUSTOMER}, "autoCreateCompany": True,
               "owner": {"userId": OWNER_ID}, "startDate": when("2026-10-19"), "dueDate": when("2026-12-18"),
               "visibility": "EVERYONE", "status": {"value": IN_PROGRESS}, "budgetedHours": 320,
               "financials": {"contractType": "FIXED_FEE", "fixedFeeContract": {"fixedFee": 48000}},
               "currency": "USD"}
    if customer_email:
        # Also the project's customer champion: the person whose sign-off counts under the app's default policy.
        project["teamMembers"] = {"members": [{"userId": OWNER_ID}], "customers": [{"emailId": customer_email}],
                                  "customerChampion": {"emailId": customer_email}}
    status, resp = call("POST", "/projects", project)
    if not show(f"create project '{PROJECT}'", status, resp):
        return
    pid = resp.get("projectId")
    saved = {"projectId": pid, "phases": {}, "tasks": {}, "requests": {}}

    for name, start, due in PHASES:
        status, resp = call("POST", "/phases", {"phaseName": name, "project": {"projectId": pid},
                                                "startDate": when(start), "dueDate": when(due)})
        if show(f"create phase '{name}'", status, resp):
            saved["phases"][name] = resp.get("phaseId")

    for phase, name, start, due, hours, state, milestone, desc in TASKS:
        task = {"taskName": name, "project": {"projectId": pid}, "phase": {"phaseId": saved["phases"][phase]},
                "startDate": when(start), "dueDate": when(due), "status": {"value": state},
                "type": "MILESTONE" if milestone else "TASK",
                "assignees": {"members": [{"userId": OWNER_ID}]}}
        if hours:
            task["effortInMinutes"] = hours * 60
        if desc:
            task["taskDescription"] = desc
        status, resp = call("POST", "/tasks", task)
        if show(f"create task '{name}'", status, resp):
            saved["tasks"][name] = resp.get("taskId")

    for title, text in REQUESTS:
        task = {"taskName": title, "project": {"projectId": pid},
                "phase": {"phaseId": saved["phases"]["Customer requests"]},
                "startDate": when("2026-11-02"), "dueDate": when("2026-11-06"), "status": {"value": TODO},
                "taskDescription": f"<p>{text}</p>",
                "assignees": {"members": [{"userId": OWNER_ID}]},
                "fields": [{"fieldId": fields["Request details"], "fieldValue": text}]}
        status, resp = call("POST", "/tasks", task)
        if show(f"create request '{title}'", status, resp):
            saved["requests"][title] = resp.get("taskId")

    with open(SEED_FILE, "w") as fh:
        json.dump(saved, fh, indent=2)
    print(f"Saved IDs to seed.json (project {pid})")


def cmd_teardown():
    pid = find_project()
    if not pid:
        sys.exit(f"'{PROJECT}' not found, nothing to delete.")
    status, resp = call("DELETE", f"/projects/{pid}")
    if show(f"delete project {pid}", status, resp) and os.path.exists(SEED_FILE):
        os.remove(SEED_FILE)


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        cmd_seed()
    elif len(args) == 2 and args[0] == "--customer":
        cmd_seed(args[1])
    elif args == ["teardown"]:
        cmd_teardown()
    else:
        print(__doc__)
        sys.exit(1)
