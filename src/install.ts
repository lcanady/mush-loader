/**
 * Installer — sends mushcode to the game via @rhost/testkit.
 *
 * Handles pre-install, main, and post-install sections in order.
 * If any section fails mid-run, subsequent sections are not executed.
 *
 * Lines starting with # or empty lines are ignored.
 */
import { RhostClient } from '@rhost/testkit';
import { LoaderConfig, InstallResult, ParsedMushFile } from './types';
import { withClient } from './client';
import { parseMushFile } from './parse';
import { apiAvailable, apiExec } from './api';

export async function installCode(
  code: string,
  config: LoaderConfig
): Promise<InstallResult> {
  const parsed = parseMushFile(code);
  if (apiAvailable(config)) {
    return installParsedWithApi(parsed, config);
  }
  return withClient(config, async (client) => {
    return installParsed(parsed, client);
  });
}

/**
 * Install via the RhostMUSH HTTP API port.
 * Runs pre-install → main → post-install in order, aborting on first failure.
 * Note: HTTP 200 confirms the command was queued; MUSH-level errors (bad syntax,
 * permission denied in softcode) are not visible in the response.
 */
async function installParsedWithApi(
  parsed: ParsedMushFile,
  config: LoaderConfig
): Promise<InstallResult> {
  const sections: Array<{ label: string; code: string }> = [
    { label: 'pre-install',  code: parsed.preInstall },
    { label: 'main',         code: parsed.main },
    { label: 'post-install', code: parsed.postInstall },
  ];

  const log: string[] = [];
  const errors: string[] = [];

  for (const { label, code } of sections) {
    if (!code.trim()) continue;
    log.push(`--- ${label} ---`);
    const result = await installSectionWithApi(code, config);
    log.push(...result.log);
    errors.push(...result.errors.map(e => `[${label}] ${e}`));
    if (errors.length > 0) {
      log.push(`--- ${label} failed, aborting remaining sections ---`);
      break;
    }
  }

  return { success: errors.length === 0, errors, log };
}

async function installSectionWithApi(
  code: string,
  config: LoaderConfig
): Promise<InstallResult> {
  const lines = code
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));

  const log: string[] = [];
  const errors: string[] = [];

  for (const line of lines) {
    try {
      await apiExec(line, config);
      log.push(`> ${line}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to execute: ${line} — ${msg}`);
      log.push(`! ${line} — ${msg}`);
    }
  }

  return { success: errors.length === 0, errors, log };
}

/**
 * Install a pre-parsed .mush file, running sections in order:
 * pre-install → main → post-install.
 * Stops at the first section that produces errors.
 */
export async function installParsed(
  parsed: ParsedMushFile,
  client: RhostClient
): Promise<InstallResult> {
  const sections: Array<{ label: string; code: string }> = [
    { label: 'pre-install',  code: parsed.preInstall },
    { label: 'main',         code: parsed.main },
    { label: 'post-install', code: parsed.postInstall },
  ];

  const log: string[] = [];
  const errors: string[] = [];
  let lastDbref: string | undefined;

  for (const { label, code } of sections) {
    if (!code.trim()) continue;

    log.push(`--- ${label} ---`);
    const result = await installWithClient(code, client);

    log.push(...result.log);
    errors.push(...result.errors.map(e => `[${label}] ${e}`));
    if (result.object) lastDbref = result.object;

    if (errors.length > 0) {
      log.push(`--- ${label} failed, aborting remaining sections ---`);
      break;
    }
  }

  return { success: errors.length === 0, object: lastDbref, errors, log };
}

export async function installWithClient(
  code: string,
  client: RhostClient
): Promise<InstallResult> {
  const lines = code
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));

  const log: string[] = [];
  const errors: string[] = [];
  let lastDbref: string | undefined;

  for (const line of lines) {
    try {
      const output = await client.command(line);
      const flat = output.join(' ').trim();
      log.push(`> ${line}`);
      if (flat) log.push(`  ${flat}`);

      // Track the most recently created object dbref
      const dbrefMatch = flat.match(/#\d+/);
      if (dbrefMatch) lastDbref = dbrefMatch[0];

      if (flat.includes('#-1') || flat.includes('#-2') || flat.includes('#-3')) {
        errors.push(`Command returned error: ${line} → ${flat}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to execute: ${line} — ${msg}`);
      log.push(`! ${line} — ${msg}`);
    }
  }

  return {
    success: errors.length === 0,
    object: lastDbref,
    errors,
    log,
  };
}
