import { test, describe, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import { validateRegistryUrl, formatRegistryListing, fetchIndex, fetchPackage } from '../../src/registry';
import type { RegistryEntry, LoaderConfig } from '../../src/types';

const stubConfig = (overrides: Partial<LoaderConfig> = {}): LoaderConfig => ({
  host: 'localhost', port: 4201, username: 'Wizard', password: 'test',
  registryUrl: 'https://example.com/index.json', ...overrides,
});

const entry = (overrides: Partial<RegistryEntry> = {}): RegistryEntry => ({
  name: 'bboard', version: '1.0.0', description: 'Bulletin board',
  url: 'https://example.com/bboard.mush', sha256: 'abc123',
  vetted: true, tags: ['utility'], ...overrides,
});

describe('validateRegistryUrl', () => {
  test('accepts https URL', () => {
    assert.doesNotThrow(() => validateRegistryUrl('https://example.com/index.json'));
  });

  test('accepts http URL', () => {
    assert.doesNotThrow(() => validateRegistryUrl('http://localhost:3000/index.json'));
  });

  test('rejects file:// URL', () => {
    assert.throws(() => validateRegistryUrl('file:///etc/passwd'), /REGISTRY_URL/);
  });

  test('rejects javascript: URL', () => {
    assert.throws(() => validateRegistryUrl('javascript:alert(1)'), /REGISTRY_URL/);
  });

  test('rejects data: URL', () => {
    assert.throws(() => validateRegistryUrl('data:text/plain,evil'), /REGISTRY_URL/);
  });

  test('rejects a bare path', () => {
    assert.throws(() => validateRegistryUrl('/etc/passwd'), /REGISTRY_URL/);
  });
});

describe('formatRegistryListing', () => {
  test('empty array returns "Registry is empty."', () => {
    assert.equal(formatRegistryListing([]), 'Registry is empty.');
  });

  test('single vetted entry with tags', () => {
    const out = formatRegistryListing([entry()]);
    assert.ok(out.startsWith('Available packages:'));
    assert.ok(out.includes('bboard@1.0.0'));
    assert.ok(out.includes('[vetted]'));
    assert.ok(out.includes('Bulletin board'));
    assert.ok(out.includes('(utility)'));
  });

  test('unvetted entry shows [unvetted]', () => {
    const out = formatRegistryListing([entry({ vetted: false })]);
    assert.ok(out.includes('[unvetted]'));
    assert.ok(!out.includes('[vetted]'));
  });

  test('entry with no tags omits tag parens', () => {
    const out = formatRegistryListing([entry({ tags: [] })]);
    assert.ok(!out.includes('('));
  });

  test('multiple entries each appear on their own line', () => {
    const entries = [
      entry({ name: 'alpha', version: '1.0.0' }),
      entry({ name: 'beta',  version: '2.0.0' }),
    ];
    const lines = formatRegistryListing(entries).split('\n');
    assert.equal(lines.length, 3); // header + 2 entries
    assert.ok(lines[1].includes('alpha@1.0.0'));
    assert.ok(lines[2].includes('beta@2.0.0'));
  });
});

describe('fetchIndex', () => {
  afterEach(() => mock.restoreAll());

  test('returns packages array on success', async () => {
    const packages = [entry()];
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      json: async () => ({ packages }),
    }));
    const result = await fetchIndex(stubConfig());
    assert.deepEqual(result, packages);
  });

  test('falls back to empty array when packages key missing', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      json: async () => ({}),
    }));
    const result = await fetchIndex(stubConfig());
    assert.deepEqual(result, []);
  });

  test('throws on non-ok response', async () => {
    mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 404 }));
    await assert.rejects(() => fetchIndex(stubConfig()), /Registry fetch failed/);
  });

  test('rejects invalid registryUrl scheme', async () => {
    await assert.rejects(
      () => fetchIndex(stubConfig({ registryUrl: 'ftp://evil.com/index.json' })),
      /REGISTRY_URL/,
    );
  });
});

describe('fetchPackage', () => {
  afterEach(() => mock.restoreAll());

  test('returns code when hash matches', async () => {
    const code = '@create Foo';
    const sha256 = createHash('sha256').update(code).digest('hex');
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      text: async () => code,
    }));
    const result = await fetchPackage(entry({ sha256 }));
    assert.equal(result, code);
  });

  test('throws on hash mismatch', async () => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      text: async () => '@create Foo',
    }));
    await assert.rejects(
      () => fetchPackage(entry({ sha256: 'badhash' })),
      /Integrity check failed/,
    );
  });

  test('throws on non-ok response', async () => {
    mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503 }));
    await assert.rejects(
      () => fetchPackage(entry()),
      /Package download failed/,
    );
  });
});
