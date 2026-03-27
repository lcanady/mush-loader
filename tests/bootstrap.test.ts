/**
 * bootstrap.test.ts
 *
 * Verifies that the mush-loader bootstrap object is installed on the game
 * and that its core attributes are present and well-formed.
 *
 * RED until softcode/bootstrap.mush has been loaded onto the game.
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

runner.describe('mush-loader bootstrap object', ({ it, beforeAll }) => {
  let loaderDbref: string;

  beforeAll(async ({ client }) => {
    // Find the loader object by name
    loaderDbref = await client.eval('search(name=MushLoader <sys>)');
  });

  it('bootstrap object exists', async ({ expect }) => {
    await expect('search(name=MushLoader <sys>)').toBeDbref();
  });

  it('bootstrap object is inherit safe', async ({ expect }) => {
    await expect(`hasflag(search(name=MushLoader <sys>),inherit)`).toBe('1');
    await expect(`hasflag(search(name=MushLoader <sys>),safe)`).toBe('1');
  });

  it('has MLOAD_VERSION attribute', async ({ expect }) => {
    await expect(`get(search(name=MushLoader <sys>)/MLOAD_VERSION)`).toBeTruthy();
  });

  it('has MLOAD_LOG attribute initialized', async ({ expect }) => {
    await expect(`get(search(name=MushLoader <sys>)/MLOAD_LOG)`).not.toBeError();
  });

  it('has MLOAD_PENDING attribute initialized', async ({ expect }) => {
    await expect(`get(search(name=MushLoader <sys>)/MLOAD_PENDING)`).not.toBeError();
  });

  it('has MLOAD_QUEUE attribute initialized', async ({ expect }) => {
    await expect(`get(search(name=MushLoader <sys>)/MLOAD_QUEUE)`).not.toBeError();
  });
});

runner
  .run({ host: HOST, port: PORT, username: USER, password: PASS })
  .then(r => process.exit(r.failed > 0 ? 1 : 0))
  .catch(err => { console.error(err.message); process.exit(1); });
