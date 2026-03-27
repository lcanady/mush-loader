import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseVetResponse } from '../../src/ai/parse';

describe('parseVetResponse', () => {
  test('parses a clean pass response', () => {
    const raw = JSON.stringify({ verdict: 'pass', summary: 'All good.', findings: [] });
    const r = parseVetResponse(raw);
    assert.equal(r.verdict, 'pass');
    assert.equal(r.summary, 'All good.');
    assert.equal(r.findings.length, 0);
  });

  test('parses a fail response with findings', () => {
    const raw = JSON.stringify({
      verdict: 'fail',
      summary: 'Injection risk.',
      findings: [{ severity: 'error', line: 3, message: 'execscript injection' }],
    });
    const r = parseVetResponse(raw);
    assert.equal(r.verdict, 'fail');
    assert.equal(r.findings[0].severity, 'error');
    assert.equal(r.findings[0].line, 3);
    assert.equal(r.findings[0].message, 'execscript injection');
  });

  test('strips markdown code fences', () => {
    const raw = '```json\n{"verdict":"pass","summary":"ok","findings":[]}\n```';
    const r = parseVetResponse(raw);
    assert.equal(r.verdict, 'pass');
  });

  test('strips bare code fences', () => {
    const raw = '```\n{"verdict":"warn","summary":"check it","findings":[]}\n```';
    const r = parseVetResponse(raw);
    assert.equal(r.verdict, 'warn');
  });

  test('malformed JSON → warn, not pass or fail', () => {
    const r = parseVetResponse('this is not json at all');
    // CRITICAL: must not downgrade a potential fail to pass
    assert.equal(r.verdict, 'warn');
    assert.ok(r.findings.some(f => /parse|malform/i.test(f.message)));
  });

  test('unknown verdict value → defaults to warn', () => {
    const raw = JSON.stringify({ verdict: 'unknown', summary: 'hmm', findings: [] });
    const r = parseVetResponse(raw);
    assert.equal(r.verdict, 'warn');
  });

  test('unknown severity value → defaults to warn', () => {
    const raw = JSON.stringify({
      verdict: 'fail',
      summary: 'bad',
      findings: [{ severity: 'critical', message: 'oops' }],
    });
    const r = parseVetResponse(raw);
    assert.equal(r.findings[0].severity, 'warn');
  });

  test('missing findings field → empty array', () => {
    const raw = JSON.stringify({ verdict: 'pass', summary: 'ok' });
    const r = parseVetResponse(raw);
    assert.equal(r.findings.length, 0);
  });

  test('missing message field → placeholder', () => {
    const raw = JSON.stringify({
      verdict: 'warn',
      summary: 's',
      findings: [{ severity: 'warn' }],
    });
    const r = parseVetResponse(raw);
    assert.ok(r.findings[0].message.length > 0);
  });

  test('null line field → undefined (not null)', () => {
    const raw = JSON.stringify({
      verdict: 'warn',
      summary: 's',
      findings: [{ severity: 'warn', line: null, message: 'test' }],
    });
    const r = parseVetResponse(raw);
    assert.equal(r.findings[0].line, undefined);
  });

  test('raw field preserved on success', () => {
    const raw = JSON.stringify({ verdict: 'pass', summary: 'ok', findings: [] });
    const r = parseVetResponse(raw);
    assert.equal(r.raw, raw);
  });

  test('raw field preserved on parse failure', () => {
    const raw = 'not json';
    const r = parseVetResponse(raw);
    assert.equal(r.raw, raw);
  });

  test('missing summary field → placeholder', () => {
    const raw = JSON.stringify({ verdict: 'pass', findings: [] });
    const r = parseVetResponse(raw);
    assert.ok(r.summary.length > 0);
  });

  test('missing verdict field → defaults to warn', () => {
    const raw = JSON.stringify({ summary: 'hmm', findings: [] });
    const r = parseVetResponse(raw);
    assert.equal(r.verdict, 'warn');
  });

  test('finding with present line number preserves it', () => {
    const raw = JSON.stringify({
      verdict: 'warn',
      summary: 's',
      findings: [{ severity: 'warn', line: 5, message: 'check' }],
    });
    const r = parseVetResponse(raw);
    assert.equal(r.findings[0].line, 5);
  });
});
