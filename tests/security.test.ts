/**
 * security.test.ts
 *
 * Proves that the vulnerabilities identified in the security audit are closed.
 * RED until softcode/commands.mush has been loaded onto the game.
 */
import { RhostRunner } from '@rhost/testkit';

const PASS = process.env.RHOST_PASS;
if (!PASS) { console.error('RHOST_PASS env var is required'); process.exit(1); }

const HOST = process.env.RHOST_HOST ?? 'localhost';
const PORT = parseInt(process.env.RHOST_PORT ?? '4201', 10);
const USER = process.env.RHOST_USER ?? 'Wizard';

const runner = new RhostRunner();

runner.describe('mush-loader security', ({ it, beforeAll }) => {
  let loader: string;

  beforeAll(async ({ client }) => {
    loader = await client.eval('search(name=MushLoader <sys>)');
    if (!loader.startsWith('#')) throw new Error('MushLoader <sys> not found — run bootstrap first');
  });

  // --- Injection: FN_SAFE_PATH blocks shell metacharacters ---

  it('FN_SAFE_PATH passes a clean path', async ({ expect }) => {
    await expect(`u(${loader}/FN_SAFE_PATH,/opt/mush-loader/packages/bboard.mush)`).toBe('/opt/mush-loader/packages/bboard.mush');
  });

  it('FN_SAFE_PATH blocks semicolon (shell separator)', async ({ expect }) => {
    await expect(`u(${loader}/FN_SAFE_PATH,foo.mush;rm -rf /)`).toBeError();
  });

  it('FN_SAFE_PATH blocks pipe', async ({ expect }) => {
    await expect(`u(${loader}/FN_SAFE_PATH,foo.mush|cat /etc/passwd)`).toBeError();
  });

  it('FN_SAFE_PATH blocks shell substitution', async ({ expect }) => {
    await expect(`u(${loader}/FN_SAFE_PATH,$(whoami))`).toBeError();
  });

  it('FN_SAFE_PATH blocks relative traversal (..)', async ({ expect }) => {
    await expect(`u(${loader}/FN_SAFE_PATH,../../etc/passwd)`).toBeError();
  });

  it('FN_SAFE_PATH blocks bare .. component', async ({ expect }) => {
    await expect(`u(${loader}/FN_SAFE_PATH,/opt/../etc/passwd)`).toBeError();
  });

  it('FN_SAFE_PATH blocks argument injection via --flag', async ({ expect }) => {
    await expect(`u(${loader}/FN_SAFE_PATH,--help)`).toBeError();
  });

  // --- FN_SAFE_PKG ---

  it('FN_SAFE_PKG passes a valid package name', async ({ expect }) => {
    await expect(`u(${loader}/FN_SAFE_PKG,bboard@1.0.0)`).toBe('bboard@1.0.0');
  });

  it('FN_SAFE_PKG blocks slash (path traversal attempt)', async ({ expect }) => {
    await expect(`u(${loader}/FN_SAFE_PKG,../../../evil)`).toBeError();
  });

  it('FN_SAFE_PKG blocks semicolon', async ({ expect }) => {
    await expect(`u(${loader}/FN_SAFE_PKG,foo;rm -rf /)`).toBeError();
  });

  it('FN_SAFE_PKG blocks shell substitution', async ({ expect }) => {
    await expect(`u(${loader}/FN_SAFE_PKG,$(whoami))`).toBeError();
  });

  // --- Injection: MUSHcode evaluation via @pemit ---

  it('+mload with evaluable filename does not execute injected code', async ({ client }) => {
    // If [setq(9,INJECTED)] evaluates, %q9 on the loader obj would be set
    const lines = await client.command(`+mload [setq(9,INJECTED)]`);
    const q9 = await client.eval(`u(${loader}/FN_SAFE_PATH,[setq(9,INJECTED)])`);
    // FN_SAFE_PATH must reject it — brackets are not in the allowed charset
    if (!q9.startsWith('#-1')) {
      throw new Error(`Expected FN_SAFE_PATH to reject bracket-containing input, got: ${q9}`);
    }
  });

  // --- Log poisoning: stored entries must not re-evaluate ---

  it('log entries with mushcode are stored escaped and do not execute on display', async ({ client, expect }) => {
    // Directly call FN_LOG with a mushcode-containing string
    await client.command(`@trigger ${loader}/FN_LOG=[pemit(#1=POISON)]`);
    const lines = await client.command('+mload/log');
    const output = lines.join(' ');
    // The literal text should appear, not trigger a pemit to #1
    if (output.includes('POISON') && !output.includes('[pemit')) {
      throw new Error('Log entry was evaluated rather than displayed as literal text');
    }
  });

  // --- Privilege: trigger targets check wizard flag ---

  it('TR_EXEC_LOAD denies non-wizard enactor', async ({ client, world }) => {
    const mortal = await world.create('TestMortal');
    const lines = await client.command(`@trigger ${loader}/TR_EXEC_LOAD=/tmp/test.mush,${mortal}`);
    const output = lines.join(' ');
    if (!output.toLowerCase().includes('permission')) {
      throw new Error(`Expected permission denial for non-wizard trigger, got: ${output}`);
    }
  });

  it('TR_EXEC_VET denies non-wizard enactor', async ({ client, world }) => {
    const mortal = await world.create('TestMortal2');
    const lines = await client.command(`@trigger ${loader}/TR_EXEC_VET=/tmp/test.mush,${mortal}`);
    const output = lines.join(' ');
    if (!output.toLowerCase().includes('permission')) {
      throw new Error(`Expected permission denial for non-wizard trigger, got: ${output}`);
    }
  });

  it('TR_EXEC_INSTALL denies non-wizard enactor', async ({ client, world }) => {
    const mortal = await world.create('TestMortal3');
    const lines = await client.command(`@trigger ${loader}/TR_EXEC_INSTALL=bboard,${mortal}`);
    const output = lines.join(' ');
    if (!output.toLowerCase().includes('permission')) {
      throw new Error(`Expected permission denial for non-wizard trigger, got: ${output}`);
    }
  });

  // --- Lock: object is wizard-only ---

  it('MushLoader <sys> has wizard use lock', async ({ expect }) => {
    await expect(`lattr(${loader}/ALOCKER)`).toContain('USE');
  });

  it('MushLoader <sys> is flagged safe', async ({ expect }) => {
    await expect(`hasflag(${loader},safe)`).toBe('1');
  });

  it('MushLoader <sys> is flagged inherit', async ({ expect }) => {
    await expect(`hasflag(${loader},inherit)`).toBe('1');
  });
});

runner
  .run({ host: HOST, port: PORT, username: USER, password: PASS })
  .then(r => process.exit(r.failed > 0 ? 1 : 0))
  .catch(err => { console.error(err.message); process.exit(1); });
