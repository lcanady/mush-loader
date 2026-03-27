/**
 * commands.test.ts
 *
 * Verifies that the +mload command suite on the bootstrap object
 * behaves correctly for all subcommands.
 *
 * RED until softcode/commands.mush has been loaded onto the game.
 */
import { RhostRunner } from '@rhost/testkit';

const PASS = process.env.RHOST_PASS;
if (!PASS) {
  console.error('RHOST_PASS env var is required');
  process.exit(1);
}

const HOST = process.env.RHOST_HOST ?? 'localhost';
const PORT = parseInt(process.env.RHOST_PORT ?? '4201', 10);
const USER = process.env.RHOST_USER ?? 'Wizard';

const runner = new RhostRunner();

runner.describe('+mload command suite', ({ it, beforeAll, afterAll }) => {
  let obj: string;

  beforeAll(async ({ world, client }) => {
    // Create a scratch object to load test code onto during tests
    obj = await world.create('MushLoaderTest');
    // Ensure loader object exists
    const loader = await client.eval('search(name=MushLoader <sys>)');
    if (!loader.startsWith('#')) {
      throw new Error('MushLoader <sys> not found — run bootstrap first');
    }
  });

  // +mload/status
  it('+mload/status returns a status line', async ({ client }) => {
    const lines = await client.command('+mload/status');
    if (lines.length === 0) throw new Error('+mload/status produced no output');
    const output = lines.join(' ');
    if (output.includes('#-1') || output.includes('#-2')) {
      throw new Error(`+mload/status returned error: ${output}`);
    }
  });

  // +mload/log
  it('+mload/log returns output without error', async ({ client }) => {
    const lines = await client.command('+mload/log');
    if (lines.some(l => l.includes('#-1') || l.includes('#-2'))) {
      throw new Error(`+mload/log returned error: ${lines.join(' ')}`);
    }
  });

  // +mload/registry
  it('+mload/registry returns a listing or empty message', async ({ client }) => {
    const lines = await client.command('+mload/registry');
    if (lines.length === 0) throw new Error('+mload/registry produced no output');
  });

  // +mload with no argument
  it('+mload with no argument shows usage', async ({ client }) => {
    const lines = await client.command('+mload');
    const output = lines.join(' ');
    if (!output.toLowerCase().includes('usage') && !output.toLowerCase().includes('+mload')) {
      throw new Error(`Expected usage message, got: ${output}`);
    }
  });

  // +mload/vet with inline code (safe case)
  it('+mload/vet with safe code queues it as pending', async ({ client, expect }) => {
    const safeCode = encodeURIComponent('&TEST_ATTR #1=hello');
    const lines = await client.command(`+mload/vet inline:${safeCode}`);
    const output = lines.join(' ');
    if (!output.toLowerCase().includes('vet') && !output.toLowerCase().includes('pend')) {
      throw new Error(`Expected vetting/pending message, got: ${output}`);
    }
  });

  // +mload/approve when nothing pending
  it('+mload/approve with nothing pending says so', async ({ client }) => {
    const lines = await client.command('+mload/approve');
    const output = lines.join(' ');
    if (!output.toLowerCase().includes('nothing') && !output.toLowerCase().includes('no pend')) {
      throw new Error(`Expected 'nothing pending', got: ${output}`);
    }
  });

  // +mload/reject when nothing pending
  it('+mload/reject with nothing pending says so', async ({ client }) => {
    const lines = await client.command('+mload/reject');
    const output = lines.join(' ');
    if (!output.toLowerCase().includes('nothing') && !output.toLowerCase().includes('no pend')) {
      throw new Error(`Expected 'nothing pending', got: ${output}`);
    }
  });
});

runner
  .run({ host: HOST, port: PORT, username: USER, password: PASS })
  .then(r => process.exit(r.failed > 0 ? 1 : 0))
  .catch(err => { console.error(err.message); process.exit(1); });
