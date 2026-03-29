/**
 * Local install history.
 *
 * Writes ~/.mush-loader/history.json after every successful load or registry
 * install.  Each entry records enough context to show what ran, when, and on
 * which game — and to diff against a future registry version.
 *
 * The file is append-only from the CLI's perspective; old entries are never
 * deleted automatically.  Entries are stored newest-first.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface HistoryEntry {
  /** ISO-8601 timestamp */
  timestamp: string;
  /** 'file' for mush-loader load, 'registry' for mush-loader install/update */
  source: 'file' | 'registry';
  /** Package name (basename without .mush) or registry name */
  name: string;
  /** Registry version, if applicable */
  version?: string;
  /** Game host the code was installed on */
  host: string;
  /** Game port */
  port: number;
  /** Raw .mush source that was installed (used for update diff) */
  code: string;
  /** Whether the install succeeded */
  success: boolean;
  /** Dbref of the installed object, if captured */
  object?: string;
}

function historyPath(): string {
  const dir = join(homedir(), '.mush-loader');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'history.json');
}

export function readHistory(): HistoryEntry[] {
  const p = historyPath();
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function appendHistory(entry: HistoryEntry): void {
  const entries = readHistory();
  entries.unshift(entry); // newest first
  writeFileSync(historyPath(), JSON.stringify(entries, null, 2), 'utf-8');
}

/**
 * Find the most recent successful install of a registry package on a specific host.
 * Used by `mush-loader update` to get the previously-installed code for diffing.
 */
export function findLastInstall(name: string, host: string): HistoryEntry | undefined {
  return readHistory().find(
    e => e.name === name && e.host === host && e.source === 'registry' && e.success
  );
}

/**
 * Return the N most recent history entries, optionally filtered by host.
 */
export function recentHistory(limit = 20, host?: string): HistoryEntry[] {
  const entries = readHistory();
  const filtered = host ? entries.filter(e => e.host === host) : entries;
  return filtered.slice(0, limit);
}
