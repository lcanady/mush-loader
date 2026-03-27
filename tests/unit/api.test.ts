import { test, describe, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiAvailable, apiExec, apiGet, translateCommand } from '../../src/api';
import type { LoaderConfig } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cfg(overrides: Partial<LoaderConfig> = {}): LoaderConfig {
  return {
    host: 'localhost', port: 4201, username: 'Wizard', password: 'pw',
    registryUrl: 'https://example.com/index.json',
    ...overrides,
  };
}

function apiCfg(overrides: Partial<LoaderConfig> = {}): LoaderConfig {
  return cfg({ apiPort: 2222, apiDbref: '#12', apiPassword: 'secret', ...overrides });
}

/** Build the Authorization header value mush-loader should send. */
function expectedAuth(dbref: string, pass: string): string {
  return 'Basic ' + Buffer.from(`${dbref}:${pass}`).toString('base64');
}

interface CapturedFetch {
  url: string;
  method: string;
  headers: Headers;
}

/** Mock globalThis.fetch, capturing url + init as a typed object. */
function stubFetch(
  respondWith: (captured: CapturedFetch) => Response | Promise<Response>
): { captured(): CapturedFetch | undefined } {
  let captured: CapturedFetch | undefined;
  mock.method(globalThis, 'fetch', async (input: string, init?: RequestInit) => {
    captured = {
      url: input,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers as HeadersInit),
    };
    return respondWith(captured);
  });
  return { captured: () => captured };
}

// ---------------------------------------------------------------------------
// apiAvailable
// ---------------------------------------------------------------------------

describe('apiAvailable', () => {
  test('true when all three API fields are set', () => {
    assert.equal(apiAvailable(apiCfg()), true);
  });

  test('false when apiPort is missing', () => {
    assert.equal(apiAvailable(cfg({ apiDbref: '#12', apiPassword: 'pw' })), false);
  });

  test('false when apiDbref is missing', () => {
    assert.equal(apiAvailable(cfg({ apiPort: 2222, apiPassword: 'pw' })), false);
  });

  test('false when apiPassword is missing', () => {
    assert.equal(apiAvailable(cfg({ apiPort: 2222, apiDbref: '#12' })), false);
  });

  test('false when none are set', () => {
    assert.equal(apiAvailable(cfg()), false);
  });
});

// ---------------------------------------------------------------------------
// apiExec
// ---------------------------------------------------------------------------

describe('apiExec', () => {
  afterEach(() => mock.restoreAll());

  test('sends POST to correct URL with Exec64 and Authorization headers', async () => {
    const { captured } = stubFetch(() =>
      new Response(null, { status: 200, headers: { Exec: 'Ok - Executed' } })
    );

    const command = '@create MySystem <sys>';
    await apiExec(command, apiCfg());

    const c = captured();
    assert.ok(c, 'fetch should have been called');
    assert.equal(c!.method, 'POST');
    assert.equal(c!.url, 'http://localhost:2222');
    assert.equal(c!.headers.get('Authorization'), expectedAuth('#12', 'secret'));

    const exec64 = c!.headers.get('Exec64');
    assert.ok(exec64, 'Exec64 header should be set');
    assert.equal(Buffer.from(exec64!, 'base64').toString('utf-8'), command);
  });

  test('does not use plain Exec: header (avoids special-char escaping issues)', async () => {
    const { captured } = stubFetch(() => new Response(null, { status: 200 }));

    await apiExec("&ATTR #1=it's fine; $(whoami)", apiCfg());

    assert.ok(!captured()!.headers.get('Exec'),
      'Exec: header must not be used — use Exec64: instead');
  });

  test('resolves without throwing on 200', async () => {
    stubFetch(() => new Response(null, { status: 200, headers: { Exec: 'Ok - Executed' } }));
    await assert.doesNotReject(() => apiExec('@emit hello', apiCfg()));
  });

  test('throws on 403 with truncated Exec header detail', async () => {
    const longDetail = 'Error - Permission Denied'.repeat(20);
    stubFetch(() => new Response(null, { status: 403, headers: { Exec: longDetail } }));

    await assert.rejects(
      () => apiExec('@emit hello', apiCfg()),
      (err: Error) => {
        assert.ok(err.message.includes('403'));
        assert.ok(err.message.length <= 230, 'error message should be bounded');
        return true;
      }
    );
  });

  test('throws on 404', async () => {
    stubFetch(() => new Response(null, { status: 404, headers: { Exec: 'Error - Invalid target' } }));
    await assert.rejects(() => apiExec('@emit hi', apiCfg()), /404/);
  });
});

// ---------------------------------------------------------------------------
// apiGet
// ---------------------------------------------------------------------------

describe('apiGet', () => {
  afterEach(() => mock.restoreAll());

  test('sends GET with Exec64, Encode:yes, and Authorization headers', async () => {
    const returnValue = 'hello world';
    const { captured } = stubFetch(() =>
      new Response(null, {
        status: 200,
        headers: { Return: Buffer.from(returnValue).toString('base64') },
      })
    );

    const expr = '[lnum(5)]';
    const result = await apiGet(expr, apiCfg());

    const c = captured();
    assert.ok(c, 'fetch should have been called');
    assert.equal(c!.method, 'GET');
    assert.equal(c!.headers.get('Authorization'), expectedAuth('#12', 'secret'));

    const exec64 = c!.headers.get('Exec64');
    assert.ok(exec64, 'Exec64 header should be set');
    assert.equal(Buffer.from(exec64!, 'base64').toString('utf-8'), expr);

    assert.equal(c!.headers.get('Encode'), 'yes',
      'Encode: yes required so Return: value is base64-safe');

    assert.equal(result, returnValue);
  });

  test('decodes base64 Return header correctly', async () => {
    const multiLine = 'line one\nline two\nline three';
    stubFetch(() =>
      new Response(null, {
        status: 200,
        headers: { Return: Buffer.from(multiLine).toString('base64') },
      })
    );
    const result = await apiGet('[foo()]', apiCfg());
    assert.equal(result, multiLine);
  });

  test('returns empty string when Return header is absent', async () => {
    stubFetch(() => new Response(null, { status: 200 }));
    const result = await apiGet('[foo()]', apiCfg());
    assert.equal(result, '');
  });

  test('throws on 400', async () => {
    stubFetch(() => new Response(null, { status: 400, headers: { Exec: 'Error - Empty String' } }));
    await assert.rejects(() => apiGet('', apiCfg()), /400/);
  });

  test('includes host and port in request URL', async () => {
    const { captured } = stubFetch(() => new Response(null, { status: 200 }));
    await apiGet('[lnum(1)]', apiCfg({ host: '10.0.0.1', apiPort: 9999 }));
    assert.equal(captured()!.url, 'http://10.0.0.1:9999');
  });
});

// ---------------------------------------------------------------------------
// translateCommand — error-detectable GET translations
// ---------------------------------------------------------------------------

describe('translateCommand', () => {
  // --- @create ---
  test('@create returns a translation with create() expr', () => {
    const t = translateCommand('@create MySystem <sys>');
    assert.ok(t, 'should translate @create');
    assert.ok(t!.expr.includes('create(MySystem <sys>)'));
  });

  test('@create: no error on valid dbref result', () => {
    const t = translateCommand('@create Foo')!;
    assert.equal(t.errorFromResult('#123'), null);
  });

  test('@create: error on #-1 result', () => {
    const t = translateCommand('@create Foo')!;
    assert.ok(t.errorFromResult('#-1 QUOTA'));
  });

  test('@create: extracts dbref from success result', () => {
    const t = translateCommand('@create Foo')!;
    assert.equal(t.dbrefFromResult?.('#42'), '#42');
    assert.equal(t.dbrefFromResult?.('#-1'), undefined);
  });

  // --- @set ---
  test('@set returns a translation with set() expr', () => {
    const t = translateCommand('@set MySystem <sys>=inherit safe');
    assert.ok(t, 'should translate @set');
    assert.ok(t!.expr.includes('set('));
  });

  test('@set: no error on "1" result', () => {
    const t = translateCommand('@set #123=safe')!;
    assert.equal(t.errorFromResult('1'), null);
  });

  test('@set: error on #-1 result', () => {
    const t = translateCommand('@set #123=safe')!;
    assert.ok(t.errorFromResult('#-1 NOPERM'));
  });

  // --- @lock ---
  test('@lock returns a translation with lock() expr', () => {
    const t = translateCommand('@lock MySystem <sys>=hasflag(%#,wizard)');
    assert.ok(t, 'should translate @lock');
    assert.ok(t!.expr.includes('lock('));
  });

  test('@lock/use includes lock type in expr', () => {
    const t = translateCommand('@lock/use MySystem <sys>=hasflag(%#,wizard)');
    assert.ok(t!.expr.includes('use'));
  });

  test('@lock: no error on "1" result', () => {
    const t = translateCommand('@lock #123=hasflag(%#,wizard)')!;
    assert.equal(t.errorFromResult('1'), null);
  });

  test('@lock: error on #-1 result', () => {
    const t = translateCommand('@lock #123=hasflag(%#,wizard)')!;
    assert.ok(t.errorFromResult('#-1'));
  });

  // --- Untranslatable commands fall back to POST ---
  test('&ATTR obj=val returns null (POST only)', () => {
    assert.equal(translateCommand('&FN_GREET #123=Hello!'), null);
  });

  test('@power returns null (POST only)', () => {
    assert.equal(translateCommand('@power #123=@a execscript'), null);
  });

  test('think returns null (POST only)', () => {
    assert.equal(translateCommand('think setup complete'), null);
  });

  test('@fo returns null (POST only)', () => {
    assert.equal(translateCommand('@fo me=@emit hello'), null);
  });
});
