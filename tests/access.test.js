const test = require('node:test');
const assert = require('node:assert/strict');
const actions = require('../app/server-actions/actions');
const intake = require('../intake/server-actions/actions');
const { requireOwner } = require('../app/server-actions/access');
const approvals = require('../app/server-actions/approvals');
const { approvalHash } = require('../app/server-actions/classify');

const owner = { userId: 1, emailId: 'owner@example.test' };
const customer = { userId: 2, emailId: 'customer@example.test' };
const outsider = { userId: 3, emailId: 'outsider@example.test' };
const task = { taskId: 10, taskName: 'Extra region', taskDescription: '<p>Add a region</p>', project: { projectId: 7 }, phase: { phaseId: 11 }, status: { value: 1 }, fields: [] };
const project = { projectId: 7, owner, teamMembers: { customers: [customer], customerChampion: customer } };
const fields = ['Request details', 'Classification', 'Classifier confidence', 'Estimated effort (hours)', 'IM decision', 'Customer sign-off', 'Change order ID'].map((fieldLabel, i) => ({ fieldId: i + 1, fieldLabel, objectType: 'TASK', fieldOptions: ['Pending', 'Approved', 'Rejected'].map((optionLabel, j) => ({ optionLabel, optionValue: j })) }));

function fixture(t) {
  const values = new Map();
  const requests = [];
  const r = { installationParams: { rlApiKey: 'offline-test' }, kv: {
    getAppValue: async key => values.has(key) ? { value: values.get(key) } : null,
    setAppValue: async ({ key, value, setIf }) => {
      if (setIf === 'not_exist' && values.has(key)) throw new Error('exists');
      values.set(key, structuredClone(value));
    },
    deleteAppValue: async key => values.delete(key),
  } };
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const u = new URL(url);
    assert.equal(u.origin, 'https://api.rocketlane.com', 'never call a model provider');
    requests.push({ path: u.pathname, method: options.method });
    let body;
    if (u.pathname.endsWith('/projects/7')) body = project;
    else if (u.pathname.endsWith('/tasks/10')) body = task;
    else if (u.pathname.endsWith('/phases')) body = { data: [{ phaseId: 11, phaseName: 'Customer requests' }, { phaseId: 12, phaseName: 'Approved changes' }] };
    else if (u.pathname.endsWith('/tasks')) body = { data: u.searchParams.has('phaseId.eq') ? (u.searchParams.get('phaseId.eq') === '11' ? [task] : []) : [{ taskName: 'SOW scope', taskDescription: '<p>In scope:</p><ul><li>One region</li></ul>', project: { projectId: 7 } }] };
    else if (u.pathname.endsWith('/fields')) body = { data: fields };
    else if (u.pathname.endsWith('/users')) body = { data: [owner, customer] };
    else throw new Error(`Unexpected offline request: ${u.pathname}`);
    return { ok: true, text: async () => JSON.stringify(body) };
  });
  return { r, values, requests };
}
const args = (user, payload = {}) => ({ context: { user }, payload: { projectId: 7, taskId: 10, ...payload } });

for (const [name, action] of Object.entries({ inbox: actions.inbox, detail: actions.detail, classify: actions.classify, export: actions.auditExport, diagnostics: actions.selfTest, intakeContext: intake.context, draft: intake.draft, log: intake.log })) {
  test(`${name} rejects a customer before internal reads or mutations`, async t => {
    const { r, values, requests } = fixture(t);
    const result = await action(r, args(customer));
    assert.equal(result.ok, false);
    assert.match(result.error, /Only the project owner/);
    assert.equal(values.size, 0);
    assert.ok(requests.every(x => x.method === 'GET' && /\/(projects\/7|tasks\/10)$/.test(x.path)));
  });
}

test('owner identity accepts numeric/string IDs; missing and unrelated actors fail', async () => {
  const rl = { project: async () => project };
  assert.equal(await requireOwner(rl, 7, { userId: '1' }), project);
  await assert.rejects(requireOwner(rl, 7, null), /who you are/);
  await assert.rejects(requireOwner(rl, 7, outsider), /Only the project owner/);
});

test('owner can read the inbox', async t => {
  const { r } = fixture(t);
  const result = await actions.inbox(r, args(owner));
  assert.equal(result.ok, true);
  assert.equal(result.requests.length, 1);
});

test('customer decision persists without returning the internal classification', async t => {
  const { r, values } = fixture(t);
  values.set('req:10', { kind: 'change_request', confidence: 0.9, probabilities: { change_request: 0.9 }, approval: { state: 'awaiting_customer', hours: 4, textHash: approvalHash(task, { fields: {} }), signoff: { policy: 'champion', approvers: [customer] }, decisions: {} } });
  const result = await actions.decide(r, args(customer, { step: 'customer', decision: 'decline' }));
  assert.deepEqual(result, { ok: true, updated: true });
  assert.equal(values.get('req:10').approval.state, 'customer_declined');
});

test('unknown decision values do not become rejections', async () => {
  const record = { kind: 'change_request' };
  await assert.rejects(approvals.pmDecide({}, {}, {}, task, record, { decision: 'typo' }, owner, { isOwner: true }), /Choose/);
  await assert.rejects(approvals.customerDecide({}, {}, {}, task, record, { decision: 'typo' }, customer, { isCustomer: true }), /Choose/);
  assert.deepEqual(record, { kind: 'change_request' });
});
