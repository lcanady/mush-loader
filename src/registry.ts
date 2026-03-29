/**
 * Registry client.
 * Fetches the index from REGISTRY_URL and downloads packages.
 */
import { LoaderConfig, RegistryEntry } from './types';
import { createHash } from 'crypto';

const ALLOWED_SCHEMES = ['https:', 'http:'];

export function validateRegistryUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`REGISTRY_URL is not a valid URL: ${url}`);
  }
  if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
    throw new Error(`REGISTRY_URL scheme must be http or https, got: ${parsed.protocol} (${url})`);
  }
}

export async function fetchIndex(config: LoaderConfig): Promise<RegistryEntry[]> {
  validateRegistryUrl(config.registryUrl);
  const response = await fetch(config.registryUrl);
  if (!response.ok) {
    throw new Error(`Registry fetch failed: ${response.status} ${config.registryUrl}`);
  }
  const data = await response.json() as { packages: RegistryEntry[] };
  return data.packages ?? [];
}

export async function fetchPackage(entry: RegistryEntry): Promise<string> {
  const response = await fetch(entry.url);
  if (!response.ok) {
    throw new Error(`Package download failed: ${response.status} ${entry.url}`);
  }
  const code = await response.text();

  // Verify integrity
  const hash = createHash('sha256').update(code).digest('hex');
  if (hash !== entry.sha256) {
    throw new Error(
      `Integrity check failed for ${entry.name}@${entry.version}\n` +
      `  expected: ${entry.sha256}\n` +
      `  got:      ${hash}`
    );
  }

  return code;
}

export function formatRegistryListing(entries: RegistryEntry[]): string {
  if (entries.length === 0) return 'Registry is empty.';

  const rows = entries.map(e => {
    const vetted = e.vetted ? '[vetted]' : '[unvetted]';
    const tags = e.tags.length > 0 ? `(${e.tags.join(', ')})` : '';
    return `  ${e.name}@${e.version} ${vetted} — ${e.description} ${tags}`.trimEnd();
  });

  return `Available packages:\n${rows.join('\n')}`;
}

/**
 * Filter registry entries by a search query.
 * Matches against name, description, and tags (case-insensitive substring).
 */
export function filterRegistry(entries: RegistryEntry[], query: string): RegistryEntry[] {
  const q = query.toLowerCase();
  return entries.filter(e =>
    e.name.toLowerCase().includes(q) ||
    e.description.toLowerCase().includes(q) ||
    e.tags.some(t => t.toLowerCase().includes(q))
  );
}

/**
 * Resolve the best matching entry for a name+optional-version specifier.
 * When version is omitted, returns the entry with the lexicographically
 * greatest version string (semver-ish "latest").
 */
export function resolvePackage(
  entries: RegistryEntry[],
  name: string,
  version?: string
): RegistryEntry | undefined {
  const matches = entries.filter(e =>
    e.name === name && (version ? e.version === version : true)
  );
  if (matches.length === 0) return undefined;
  if (version) return matches[0];
  // Pick latest by semver-ish sort (lexicographic on split segments)
  return matches.sort((a, b) => compareVersions(b.version, a.version))[0];
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Format a single registry entry as a detailed info block.
 */
export function formatRegistryInfo(entry: RegistryEntry): string {
  const vetted = entry.vetted ? 'yes' : 'no';
  const tags = entry.tags.length > 0 ? entry.tags.join(', ') : '(none)';
  const author = entry.author ?? '(unknown)';
  return [
    `  Name:    ${entry.name}`,
    `  Version: ${entry.version}`,
    `  Author:  ${author}`,
    `  Vetted:  ${vetted}`,
    `  Tags:    ${tags}`,
    `  URL:     ${entry.url}`,
    `  SHA256:  ${entry.sha256}`,
    ``,
    `  ${entry.description}`,
  ].join('\n');
}
