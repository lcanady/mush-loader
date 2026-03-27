import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateMushcode } from '../../src/validate';

describe('validateMushcode — dangerous patterns', () => {
  test('passes clean code', () => {
    const r = validateMushcode('&FN_GREET #42=[if(not(%0),#-1 MISSING ARG,Hello [name(%0)]!)]');
    assert.equal(r.verdict, 'pass');
    assert.equal(r.findings.length, 0);
  });

  test('blocks execscript() with user arg (%0)', () => {
    const r = validateMushcode('&CMD #1=$+run *: [execscript(%0)]');
    assert.equal(r.verdict, 'fail');
    assert.ok(r.findings.some(f => f.severity === 'error' && /execscript/i.test(f.message)));
  });

  test('blocks execscript() with shell var ($VAR)', () => {
    const r = validateMushcode('[execscript($EVIL)]');
    assert.equal(r.verdict, 'fail');
  });

  test('blocks @power', () => {
    const r = validateMushcode('@power me=execscript');
    assert.equal(r.verdict, 'fail');
    assert.ok(r.findings.some(f => /power/i.test(f.message)));
  });

  test('blocks @wizard', () => {
    const r = validateMushcode('@wizard #42');
    assert.equal(r.verdict, 'fail');
    assert.ok(r.findings.some(f => /wizard/i.test(f.message)));
  });

  test('blocks destroy targeting #1', () => {
    const r = validateMushcode('@destroy #1');
    assert.equal(r.verdict, 'fail');
    assert.ok(r.findings.some(f => /#1/.test(f.message)));
  });

  test('blocks @switch with user input in case label (after =)', () => {
    // Dangerous: %0 appears as the case label (after =) — it is evaluated
    const r = validateMushcode('&CMD #1=$+cmd *: @switch/first me=%0,{@pemit %#=ok}');
    assert.equal(r.verdict, 'fail');
  });

  test('warns on removing safe flag', () => {
    const r = validateMushcode('@set #42=!safe');
    assert.ok(r.findings.some(f => f.severity === 'warn' && /safe/i.test(f.message)));
  });

  test('warns on execscript (suspicious even without user arg)', () => {
    const r = validateMushcode('[execscript(node, /opt/tool)]');
    assert.ok(r.findings.some(f => /execscript/i.test(f.message)));
  });

  test('warns on @boot', () => {
    const r = validateMushcode('@boot #42');
    assert.ok(r.findings.some(f => /@boot/i.test(f.message)));
  });

  test('warns on unbalanced brackets', () => {
    // Two opens, one close
    const r = validateMushcode('[[if(1,yes,no]');
    assert.ok(r.findings.some(f => /unbalanced/i.test(f.message)));
  });

  test('reports correct line numbers', () => {
    const code = '&SAFE #1=ok\n@power me=execscript\n&ALSO_SAFE #1=fine';
    const r = validateMushcode(code);
    const powerFinding = r.findings.find(f => /power/i.test(f.message));
    assert.equal(powerFinding?.line, 2);
  });

  test('verdict is warn when only warnings, no errors', () => {
    const r = validateMushcode('[execscript(node, /safe/path)]');
    assert.equal(r.verdict, 'warn');
  });

  test('verdict is fail when any error present', () => {
    const r = validateMushcode('@power me=execscript\n[execscript(node, /safe)]');
    assert.equal(r.verdict, 'fail');
  });
});
