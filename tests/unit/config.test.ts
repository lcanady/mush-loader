import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config';

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try { fn(); }
  finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe('loadConfig', () => {
  test('loads valid config', () => {
    withEnv({ RHOST_USER: 'Wizard', RHOST_PASS: 'secret', RHOST_PORT: '4201' }, () => {
      const c = loadConfig();
      assert.equal(c.username, 'Wizard');
      assert.equal(c.port, 4201);
    });
  });

  test('throws when RHOST_USER is empty string', () => {
    withEnv({ RHOST_USER: '', RHOST_PASS: 'secret' }, () => {
      assert.throws(() => loadConfig(), /RHOST_USER/);
    });
  });

  test('throws when RHOST_USER is unset', () => {
    withEnv({ RHOST_USER: undefined, RHOST_PASS: 'secret' }, () => {
      assert.throws(() => loadConfig(), /RHOST_USER/);
    });
  });

  test('throws when RHOST_PASS is empty string', () => {
    withEnv({ RHOST_USER: 'Wizard', RHOST_PASS: '' }, () => {
      assert.throws(() => loadConfig(), /RHOST_PASS/);
    });
  });

  test('throws when RHOST_PASS is unset', () => {
    withEnv({ RHOST_USER: 'Wizard', RHOST_PASS: undefined }, () => {
      assert.throws(() => loadConfig(), /RHOST_PASS/);
    });
  });

  test('throws on invalid AI_PROVIDER', () => {
    withEnv({ RHOST_USER: 'Wizard', RHOST_PASS: 'secret', AI_PROVIDER: 'invalid' }, () => {
      assert.throws(() => loadConfig(), /AI_PROVIDER/);
    });
  });

  test('throws on non-numeric RHOST_PORT', () => {
    withEnv({ RHOST_USER: 'Wizard', RHOST_PASS: 'secret', RHOST_PORT: 'abc' }, () => {
      assert.throws(() => loadConfig(), /RHOST_PORT/);
    });
  });

  test('throws on out-of-range port', () => {
    withEnv({ RHOST_USER: 'Wizard', RHOST_PASS: 'secret', RHOST_PORT: '99999' }, () => {
      assert.throws(() => loadConfig(), /RHOST_PORT/);
    });
  });

  test('uses default port 4201 when RHOST_PORT not set', () => {
    withEnv({ RHOST_USER: 'Wizard', RHOST_PASS: 'secret', RHOST_PORT: undefined }, () => {
      const c = loadConfig();
      assert.equal(c.port, 4201);
    });
  });

  test('uses explicit RHOST_HOST when set', () => {
    withEnv({ RHOST_USER: 'Wizard', RHOST_PASS: 'secret', RHOST_HOST: 'game.example.com' }, () => {
      const c = loadConfig();
      assert.equal(c.host, 'game.example.com');
    });
  });

  test('accepts valid AI_PROVIDER', () => {
    withEnv({ RHOST_USER: 'Wizard', RHOST_PASS: 'secret', AI_PROVIDER: 'anthropic' }, () => {
      const c = loadConfig();
      assert.equal(c.aiProvider, 'anthropic');
    });
  });
});
