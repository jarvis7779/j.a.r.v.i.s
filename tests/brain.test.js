const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePrompt, recordPattern, buildAcademicPolicyPrompt } = require('../src/brain');

test('normalizePrompt remove caps and extra spaces', () => {
  assert.equal(normalizePrompt('  OLA   MUNDO  '), 'ola mundo');
});

test('recordPattern learns frequency and last prompt', () => {
  const state = { patterns: {}, total: 0 };
  const updated = recordPattern(state, 'pesquise sobre IA e educação');

  assert.equal(updated.total, 1);
  assert.equal(updated.patterns['pesquise'].count, 1);
  assert.equal(updated.lastPrompt, 'pesquise sobre IA e educação');
});

test('academic policy prompt enforces Scholar and university sources', () => {
  const text = buildAcademicPolicyPrompt();
  assert.match(text, /Google Scholar/i);
  assert.match(text, /universidades/i);
  assert.match(text, /obrigat/i);
});
