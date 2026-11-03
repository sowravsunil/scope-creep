#!/usr/bin/env python3
"""Rocketlane trial setup helper (standard library only).

Usage (run from this folder):
  python3 rl.py check                       # is the API key working?
  python3 rl.py projects                    # list projects with their IDs
  python3 rl.py phases <projectId>          # list phases in a project
  python3 rl.py fields                      # list task custom fields
  python3 rl.py setup-fields                # create the prototype's task fields (skips existing ones)
  python3 rl.py smoke <projectId> <phaseId> # create/read/delete a task and a budget
"""
import datetime
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://api.rocketlane.com/api/1.0"
HERE = os.path.dirname(os.path.abspath(__file__))

FIELDS = [
    ("Request details", "MULTI_LINE_TEXT", None),
    ("Classification", "SINGLE_CHOICE", [("In scope", "GREEN"), ("Change request", "YELLOW"),
                                         ("Blocker", "RED"), ("Noise", "GRAY"), ("Needs review", "PURPLE")]),
    ("Classifier confidence", "NUMBER", None),
    ("Estimated effort (hours)", "NUMBER", None),
    ("IM decision", "SINGLE_CHOICE", [("Pending", "GRAY"), ("Approved", "GREEN"), ("Rejected", "RED")]),
    ("Customer sign-off", "SINGLE_CHOICE", [("Pending", "GRAY"), ("Approved", "GREEN"), ("Rejected", "RED")]),
    ("Change order ID", "TEXT", None),
]
# Classifier output stays internal: customers shouldn't see "Noise" or a confidence score in the portal.
PRIVATE = {"Classification", "Classifier confidence", "Estimated effort (hours)"}


def load_env():
    path = os.path.join(HERE, ".env")
    if os.path.exists(path):
        for line in open(path):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
KEY = os.environ.get("RL_API_KEY", "")
if not KEY:
    sys.exit("RL_API_KEY is empty. Copy .env.example to .env and paste your key there.")


def call(method, path, body=None, params=None):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "api-key": KEY, "accept": "application/json", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            text = r.read().decode()
            return r.status, (json.loads(text) if text else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:1000]
    except urllib.error.URLError as e:
        return 0, str(e.reason)


def items(resp):
    if isinstance(resp, dict):
        return resp.get("data", resp)
    return resp or []


def show(label, status, resp):
    ok = 200 <= status < 300
    print(f"[{'PASS' if ok else 'FAIL'}] {label}: HTTP {status}")
    if not ok:
        print("       ", resp)
    return ok


def cmd_check():
    status, resp = call("GET", "/projects", params={"pageSize": 1})
    show("API key works", status, resp)


def cmd_projects():
    status, resp = call("GET", "/projects", params={"pageSize": 50})
    if show("list projects", status, resp):
        for p in items(resp):
            print(f"  {p.get('projectId')}\t{p.get('projectName')}")


def cmd_phases(project_id):
    status, resp = call("GET", "/phases", params={"projectId": project_id, "pageSize": 100})
    if show("list phases", status, resp):
        for ph in items(resp):
            print(f"  {ph.get('phaseId')}\t{ph.get('phaseName')}")


def existing_fields():
    params = {"pageSize": 100, "includeFields": "options"}
    fields = []
    while True:
        status, resp = call("GET", "/fields", params=params)
        if not show("list fields", status, resp):
            return None
        fields += items(resp)
        page = resp.get("pagination", {}) if isinstance(resp, dict) else {}
        if not page.get("hasMore"):
            return fields
        params["pageToken"] = page.get("nextPageToken")


def cmd_fields():
    fields = existing_fields() or []
    for f in fields:
        if f.get("objectType") == "TASK":
            opts = ", ".join(f"{o.get('optionLabel')}={o.get('optionValue')}" for o in (f.get("fieldOptions") or []))
            print(f"  {f.get('fieldId')}\t{f.get('fieldType')}\t{f.get('fieldLabel')}" + (f"\t[{opts}]" if opts else ""))


def cmd_setup_fields():
    fields = existing_fields()
    if fields is None:
        return
    have = {f.get("fieldLabel"): f for f in fields if f.get("objectType") == "TASK"}
    saved = {}
    for label, ftype, options in FIELDS:
        if label in have:
            print(f"[SKIP] '{label}' already exists (id {have[label].get('fieldId')})")
            saved[label] = have[label]
            continue
        body = {"fieldLabel": label, "fieldType": ftype, "objectType": "TASK", "enabled": True,
                "private": label in PRIVATE}
        if options:
            body["fieldOptions"] = [{"optionLabel": o, "optionColor": c} for o, c in options]
        status, resp = call("POST", "/fields", body, params={"includeFields": "options"})
        if show(f"create field '{label}'", status, resp):
            saved[label] = resp
    with open(os.path.join(HERE, "fields.json"), "w") as fh:
        json.dump(saved, fh, indent=2)
    print("Saved field IDs to fields.json")


def cmd_smoke(project_id, phase_id):
    pid, phid = int(project_id), int(phase_id)
    task = {"taskName": "[SMOKE TEST] Can you also add a Zendesk migration?",
            "taskDescription": "<p>Smoke test from rl.py. Safe to delete.</p>",
            "project": {"projectId": pid}, "phase": {"phaseId": phid}}
    status, resp = call("POST", "/tasks", task)
    if not show("create task", status, resp):
        return
    task_id = resp.get("taskId")
    status, resp = call("GET", f"/tasks/{task_id}", params={"includeAllFields": "true"})
    if show("read task back", status, resp):
        print("        description returned:", bool(resp.get("taskDescription")))
    status, resp = call("DELETE", f"/tasks/{task_id}")
    show("delete task", status, resp)

    today = datetime.date.today()
    budget = {"projectId": pid, "budgetName": "[SMOKE TEST] CO-000", "billingType": "FIXED_FEE",
              "budgetAmount": 1, "startDate": today.isoformat(),
              "endDate": (today + datetime.timedelta(days=30)).isoformat()}
    status, resp = call("POST", "/budgets", budget)
    if not show("create budget", status, resp):
        print("        If this is 403/400 about plan, budgets may not be in your trial.")
        return
    budget_id = resp.get("budgetId")
    status, resp = call("DELETE", f"/budgets/{budget_id}")
    show("delete budget", status, resp)


if __name__ == "__main__":
    args = sys.argv[1:]
    cmds = {"check": cmd_check, "projects": cmd_projects, "phases": cmd_phases, "fields": cmd_fields,
            "setup-fields": cmd_setup_fields, "smoke": cmd_smoke}
    if not args or args[0] not in cmds:
        print(__doc__)
        sys.exit(1)
    cmds[args[0]](*args[1:])
