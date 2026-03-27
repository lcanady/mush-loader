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
