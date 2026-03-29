import { test, describe, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { contributePattern, recordAntiPattern } from '../../src/patterns';

// require() gives us the mutable CJS exports objects that mock.method can intercept.
// import * namespace objects go through __importStar and are NOT the same reference,
// so patches on require('child_process') would not affect the import * namespace copy.
/* eslint-disable @typescript-eslint/no-require-imports */
const cp = require('child_process') as typeof import('child_process');
const fs = require('fs') as typeof import('fs');
/* eslint-enable @typescript-eslint/no-require-imports */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fake a PATTERNS_DIR that looks like a valid git repo to patternsAvailable().
 *  Returns true for directory/git checks; false for .md files so the
 *  sequence-number loop in contributePattern() exits on the first iteration.
 */
function stubFs() {
  mock.method(fs, 'existsSync', (p: string) => !p.endsWith('.md'));
  mock.method(fs, 'mkdirSync',  () => undefined);
  mock.method(fs, 'writeFileSync', () => undefined);
}

describe('patterns.ts — YAML injection via tags (L-1)', () => {
  afterEach(() => mock.restoreAll());

  test('[L-1 RED] tag with newline injects extra YAML key into frontmatter', async () => {
    const written: string[] = [];
    mock.method(fs, 'existsSync', (p: string) => !p.endsWith('.md'));
    mock.method(fs, 'mkdirSync',  () => undefined);
    mock.method(fs, 'writeFileSync', (_p: string, content: string) => { written.push(content); });
    mock.method(cp, 'execFileSync', (bin: string) => bin === 'gh' ? 'https://github.com/pr/1' : '');

    await contributePattern({
      name: 'safe-pkg',
      description: 'desc',
      code: '@create Foo',
      vetResult: { verdict: 'pass', findings: [], summary: 'ok' },
      tags: ['legit', 'evil\ninjected: value'],
    });

    assert.ok(written.length > 0, 'writeFileSync must have been called');
    const content = written[0];
    // The YAML frontmatter tags line must not contain a raw newline inside the value
    const frontmatter = content.split('---')[1] ?? '';
    assert.ok(
      !frontmatter.includes('injected: value'),
      'YAML injection: "injected: value" must not appear as a top-level key in frontmatter (RED)',
    );
  });

  test('[L-1 GREEN] tags containing only alphanumerics/hyphens pass through', async () => {
    const written: string[] = [];
    mock.method(fs, 'existsSync', (p: string) => !p.endsWith('.md'));
    mock.method(fs, 'mkdirSync',  () => undefined);
    mock.method(fs, 'writeFileSync', (_p: string, content: string) => { written.push(content); });
    mock.method(cp, 'execFileSync', (bin: string) => bin === 'gh' ? 'https://github.com/pr/1' : '');

    await contributePattern({
      name: 'safe-pkg',
      description: 'desc',
      code: '@create Foo',
      vetResult: { verdict: 'pass', findings: [], summary: 'ok' },
      tags: ['utility', 'social', 'admin-only'],
    });

    const content = written[0];
    assert.ok(content.includes('utility'), 'valid tags must appear in output');
    assert.ok(content.includes('admin-only'), 'hyphenated tags must be preserved');
  });
});

describe('patterns.ts — shell safety (M1 / L2)', () => {
  afterEach(() => mock.restoreAll());

  // --- Red: execSync must not be called (shell injection vector) ---
  test('contributePattern never calls execSync — must use execFileSync', async () => {
    let execSyncCalled = false;
    mock.method(cp, 'execSync', () => { execSyncCalled = true; return ''; });
    mock.method(cp, 'execFileSync', (bin: string) => bin === 'gh' ? 'https://github.com/pr/1' : '');
    stubFs();

    await contributePattern({
      name: "evil'name; rm -rf /",
      description: "desc with 'single' quotes",
      code: '@create Test',
      vetResult: { verdict: 'pass', findings: [], summary: "summary with 'quotes' and $injected" },
    });

    assert.equal(execSyncCalled, false,
      'execSync was called — shell injection risk. Use execFileSync with an args array.');
  });

  test('recordAntiPattern never calls execSync', async () => {
    let execSyncCalled = false;
    mock.method(cp, 'execSync', () => { execSyncCalled = true; return ''; });
    mock.method(cp, 'execFileSync', () => '');
    stubFs();

    await recordAntiPattern({
      name: "anti'pattern; $(whoami)",
      code: '@fo me=@destroy me',
      vetResult: { verdict: 'fail', findings: [], summary: "dangerous; rm -rf /" },
    });

    assert.equal(execSyncCalled, false,
      'execSync was called — shell injection risk. Use execFileSync with an args array.');
  });

  // --- Green: execFileSync receives an args array, not a shell string ---
  test('contributePattern calls execFileSync with an args array for git/gh', async () => {
    const calls: Array<{ bin: string; args: string[] }> = [];
    mock.method(cp, 'execFileSync', (bin: string, args: string[]) => {
      calls.push({ bin, args });
      return bin === 'gh' ? 'https://github.com/pr/1' : '';
    });
    stubFs();

    await contributePattern({
      name: "my-system",
      description: "A system with 'quotes' and \"double\"",
      code: '@create MySystem <sys>',
      vetResult: { verdict: 'pass', findings: [], summary: "all good; no issues" },
    });

    assert.ok(calls.length > 0, 'execFileSync should have been called');
    for (const { bin, args } of calls) {
      assert.ok(Array.isArray(args),
        `${bin} was called without an args array — shell injection risk`);
      for (const arg of args) {
        assert.equal(typeof arg, 'string', `arg must be a string, got ${typeof arg}`);
      }
    }
  });

  test('PR body arg contains the summary verbatim without shell quoting', async () => {
    const dangerousSummary = "it's fine; $(echo injected) & `whoami`";
    const calls: Array<{ bin: string; args: string[] }> = [];
    mock.method(cp, 'execFileSync', (bin: string, args: string[]) => {
      calls.push({ bin, args });
      return bin === 'gh' ? 'https://github.com/pr/1' : '';
    });
    stubFs();

    await contributePattern({
      name: 'test-pkg',
      description: "safe desc",
      code: '@create Foo',
      vetResult: { verdict: 'pass', findings: [], summary: dangerousSummary },
    });

    const ghCall = calls.find(c => c.bin === 'gh');
    assert.ok(ghCall, 'gh pr create should have been called');

    const bodyArgIdx = ghCall!.args.indexOf('--body');
    assert.ok(bodyArgIdx !== -1, '--body flag must be a discrete arg');
    const bodyValue = ghCall!.args[bodyArgIdx + 1];
    assert.ok(typeof bodyValue === 'string', '--body value must be a string arg');
    assert.ok(bodyValue.includes(dangerousSummary),
      'Summary must appear verbatim in body arg (no shell-escaping needed)');
  });
});
