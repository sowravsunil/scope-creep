const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { quoteIsReal } = require('../core/extract');
const root = path.join(__dirname, '..');

test('latest saved evaluation reproduces documented counts without API calls', () => {
  const output = execFileSync(process.execPath, ['eval/run-eval.js', '--from', 'eval/results/run-2026-11-03T05-05-15-412Z-sowlive.json'], { cwd: root, encoding: 'utf8' });
  assert.match(output, /Correct: 46\/48/);
  assert.match(output, /45\/45 100%/);
  assert.match(output, /exact 59%, within one bucket 100%/);
});

test('historical four-range run retains its original size-score interpretation', () => {
  const output = execFileSync(process.execPath, ['eval/run-eval.js', '--from', 'eval/results/run-2026-10-31T07-31-56-778Z.json'], { cwd: root, encoding: 'utf8' });
  assert.match(output, /exact 59%, within one bucket 100%/);
  assert.match(output, /44\/44 100%/);
});

test('source quote check tolerates formatting but rejects invented words', () => {
  assert.equal(quoteIsReal('Can you add “one region”?', 'Hi! Can you add "one region"? Thanks.'), true);
  assert.equal(quoteIsReal('Can you add two regions?', 'Can you add one region?'), false);
  assert.equal(quoteIsReal('', 'Anything'), false);
});
