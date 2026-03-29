import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Point history module at a temp dir so tests never touch ~/.mush-loader
const TEST_HOME = join(tmpdir(), `mush-loader-test-${process.pid}`);
const origHome = process.env.HOME;

// Override the module's homedir by patching HOME before import
process.env.HOME = TEST_HOME;

// Now import — module reads HOME at call time via os.homedir()
import { appendHistory, readHistory, findLastInstall, recentHistory } from '../../src/history';
import type { HistoryEntry } from '../../src/history';

const entry = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  timestamp: '2026-01-01T00:00:00.000Z',
  source: 'registry',
  name: 'bboard',
  version: '1.0.0',
  host: 'localhost',
  port: 4201,
  code: '@create BBoard',
  success: true,
  ...overrides,
});

describe('history', () => {
  beforeEach(() => {
    process.env.HOME = TEST_HOME;
    mkdirSync(join(TEST_HOME, '.mush-loader'), { recursive: true });
    // clear any existing history file
    const p = join(TEST_HOME, '.mush-loader', 'history.json');
    if (existsSync(p)) rmSync(p);
  });

  afterEach(() => {
    process.env.HOME = origHome;
    if (existsSync(TEST_HOME)) rmSync(TEST_HOME, { recursive: true });
  });

  test('readHistory returns [] when file does not exist', () => {
    assert.deepEqual(readHistory(), []);
  });

  test('readHistory returns [] when file is corrupt JSON', () => {
    writeFileSync(join(TEST_HOME, '.mush-loader', 'history.json'), 'NOT JSON');
    assert.deepEqual(readHistory(), []);
  });

  test('appendHistory writes and reads back an entry', () => {
    appendHistory(entry());
    const h = readHistory();
    assert.equal(h.length, 1);
    assert.equal(h[0].name, 'bboard');
  });

  test('appendHistory prepends — newest entry is first', () => {
    appendHistory(entry({ timestamp: '2026-01-01T00:00:00.000Z', name: 'older' }));
    appendHistory(entry({ timestamp: '2026-01-02T00:00:00.000Z', name: 'newer' }));
    const h = readHistory();
    assert.equal(h[0].name, 'newer');
    assert.equal(h[1].name, 'older');
  });

  test('findLastInstall returns the most recent successful registry install for that host', () => {
    appendHistory(entry({ name: 'bboard', host: 'mygame.com', success: true, version: '1.0.0' }));
    appendHistory(entry({ name: 'bboard', host: 'other.com',  success: true, version: '2.0.0' }));
    const r = findLastInstall('bboard', 'mygame.com');
    assert.equal(r?.version, '1.0.0');
  });

  test('findLastInstall ignores failed installs', () => {
    appendHistory(entry({ success: false, version: '2.0.0' }));
    appendHistory(entry({ success: true,  version: '1.0.0' }));
    const r = findLastInstall('bboard', 'localhost');
    assert.equal(r?.version, '1.0.0');
  });

  test('findLastInstall returns undefined when no match', () => {
    assert.equal(findLastInstall('bboard', 'localhost'), undefined);
  });

  test('findLastInstall ignores file-source entries', () => {
    appendHistory(entry({ source: 'file', success: true, version: '1.0.0' }));
    assert.equal(findLastInstall('bboard', 'localhost'), undefined);
  });

  test('recentHistory returns at most N entries', () => {
    for (let i = 0; i < 25; i++) appendHistory(entry({ name: `pkg-${i}` }));
    assert.equal(recentHistory(10).length, 10);
  });

  test('recentHistory filters by host when provided', () => {
    appendHistory(entry({ host: 'game-a.com' }));
    appendHistory(entry({ host: 'game-b.com' }));
    appendHistory(entry({ host: 'game-a.com' }));
    const r = recentHistory(20, 'game-a.com');
    assert.equal(r.length, 2);
    assert.ok(r.every(e => e.host === 'game-a.com'));
  });
});
