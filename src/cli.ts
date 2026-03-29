#!/usr/bin/env node
/**
 * mush-loader CLI
 *
 * Usage:
 *   mush-loader load [--vet] [--dry-run] <file.mush>
 *   mush-loader vet <file.mush>
 *   mush-loader registry
 *   mush-loader search <query>
 *   mush-loader info <pkg[@version]>
 *   mush-loader install <pkg[@version]>
 *   mush-loader update <pkg[@version]>
 *   mush-loader status
 *   mush-loader bootstrap
 *
 * All config via env vars or loader.conf (sourced before running).
 * See config/loader.conf.example for all options.
 */
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { basename } from 'path';
import { loadConfig } from './config';
import { validateMushcode } from './validate';
import { vetParsed, recordVetOutcome, FullVetResult } from './vet';
import { installCode, installParsed } from './install';
import { parseMushFile } from './parse';
import {
  fetchIndex,
  fetchPackage,
  filterRegistry,
  formatRegistryInfo,
  formatRegistryListing,
  resolvePackage,
} from './registry';
import { appendHistory, findLastInstall } from './history';
import { VetResult } from './types';
import { withClient } from './client';
import { apiAvailable, apiGet } from './api';

const RESET = '\x1b[0m';
const RED   = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';

function printVetResult(result: VetResult | FullVetResult): void {
  const color = result.verdict === 'pass' ? GREEN : result.verdict === 'warn' ? YELLOW : RED;
  console.log(`\n${BOLD}${color}Verdict: ${result.verdict.toUpperCase()}${RESET}`);
  console.log(`${result.summary}\n`);

  if (result.findings.length > 0) {
    console.log(`${BOLD}Findings:${RESET}`);
    for (const f of result.findings) {
      const fc = f.severity === 'error' ? RED : f.severity === 'warn' ? YELLOW : CYAN;
      const loc = f.line ? ` (line ${f.line})` : '';
      console.log(`  ${fc}[${f.severity}]${RESET}${loc} ${f.message}`);
    }
  }
}

async function cmdLoad(args: string[]): Promise<void> {
  const vetFlag = args.includes('--vet');
  const dryRun  = args.includes('--dry-run');
  const file    = args.filter(a => !a.startsWith('-'))[0];

  if (!file) {
    console.error('Usage: mush-loader load [--vet] [--dry-run] <file.mush>');
    process.exit(1);
  }

  const rawCode = readFileSync(resolve(file), 'utf-8');
  const parsed  = parseMushFile(rawCode);
  const name    = basename(file, '.mush');
  const config  = loadConfig();

  if (vetFlag) {
    console.log(`${CYAN}Vetting ${file}...${RESET}`);
    const result = await vetParsed(parsed, config);
    printVetResult(result);

    if (result.verdict === 'fail') {
      console.error(`\n${RED}Load blocked — fix errors before loading.${RESET}`);
      console.log(`\n${CYAN}Recording anti-pattern to mush-patterns...${RESET}`);
      await recordVetOutcome({ name, description: `Failed vet: ${file}`, code: rawCode, vetResult: result });
      process.exit(1);
    }

    if (result.verdict === 'warn') {
      console.log(`\n${YELLOW}Warnings found. Proceed with load? [y/N]${RESET} `);
      const answer = await prompt();
      if (answer.toLowerCase() !== 'y') {
        console.log('Load cancelled.');
        process.exit(0);
      }
    }
  } else {
    const result = validateMushcode(rawCode);
    printVetResult(result);
    if (result.verdict === 'fail') {
      console.error(`\n${RED}Load blocked — static validation failed.${RESET}`);
      process.exit(1);
    }
  }

  if (dryRun) {
    console.log(`\n${BOLD}${CYAN}--- dry-run: commands that would execute ---${RESET}`);
    const sections: Array<{ label: string; code: string }> = [
      { label: 'pre-install',  code: parsed.preInstall },
      { label: 'main',         code: parsed.main },
      { label: 'post-install', code: parsed.postInstall },
    ];
    for (const { label, code } of sections) {
      if (!code.trim()) continue;
      console.log(`\n${DIM}--- ${label} ---${RESET}`);
      const lines = code.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      for (const line of lines) console.log(`  ${line}`);
    }
    console.log(`\n${GREEN}Dry run complete — nothing sent to the game.${RESET}`);
    return;
  }

  console.log(`\n${CYAN}Installing ${file}...${RESET}`);
  const installResult = await withClient(config, client => installParsed(parsed, client));

  for (const line of installResult.log) console.log(line);

  if (installResult.success) {
    console.log(`\n${GREEN}Install complete.${RESET}`);
    if (installResult.object) console.log(`  Object: ${installResult.object}`);
    appendHistory({
      timestamp: new Date().toISOString(),
      source: 'file',
      name,
      host: config.host,
      port: config.port,
      code: rawCode,
      success: true,
      object: installResult.object,
    });
    if (vetFlag) {
      console.log(`\n${CYAN}Contributing pattern to mush-patterns...${RESET}`);
      await recordVetOutcome({ name, description: `Loaded from ${file}`, code: rawCode, vetResult: await vetParsed(parsed, config) });
    }
  } else {
    appendHistory({
      timestamp: new Date().toISOString(),
      source: 'file',
      name,
      host: config.host,
      port: config.port,
      code: rawCode,
      success: false,
    });
    console.error(`\n${RED}Install completed with errors:${RESET}`);
    for (const e of installResult.errors) console.error(`  ${e}`);
    process.exit(1);
  }
}

async function cmdVet(args: string[]): Promise<void> {
  const file = args[0];
  if (!file) {
    console.error('Usage: mush-loader vet <file.mush>');
    process.exit(1);
  }

  const rawCode = readFileSync(resolve(file), 'utf-8');
  const parsed  = parseMushFile(rawCode);
  const name    = basename(file, '.mush');
  const config  = loadConfig();

  const result = await vetParsed(parsed, config);
  printVetResult(result);

  console.log(`\n${CYAN}Recording vet outcome to mush-patterns...${RESET}`);
  await recordVetOutcome({ name, description: `Vetted from ${file}`, code: rawCode, vetResult: result });

  process.exit(result.verdict === 'fail' ? 1 : 0);
}

async function cmdRegistry(): Promise<void> {
  const config  = loadConfig();
  const entries = await fetchIndex(config);
  console.log(formatRegistryListing(entries));
}

async function cmdSearch(args: string[]): Promise<void> {
  const query = args.join(' ').trim();
  if (!query) {
    console.error('Usage: mush-loader search <query>');
    process.exit(1);
  }

  const config  = loadConfig();
  const entries = await fetchIndex(config);
  const results = filterRegistry(entries, query);

  if (results.length === 0) {
    console.log(`No packages found matching: ${query}`);
  } else {
    console.log(`${BOLD}Search results for "${query}":${RESET}`);
    console.log(formatRegistryListing(results));
  }
}

async function cmdInfo(args: string[]): Promise<void> {
  const pkgArg = args[0];
  if (!pkgArg) {
    console.error('Usage: mush-loader info <pkg[@version]>');
    process.exit(1);
  }

  const [name, version] = pkgArg.split('@');
  const config  = loadConfig();
  const entries = await fetchIndex(config);
  const entry   = resolvePackage(entries, name, version);

  if (!entry) {
    console.error(`Package not found: ${pkgArg}`);
    process.exit(1);
  }

  console.log(`\n${BOLD}${entry.name}@${entry.version}${RESET}`);
  console.log(formatRegistryInfo(entry));
}

async function cmdInstall(args: string[]): Promise<void> {
  const pkgArg = args[0];
  if (!pkgArg) {
    console.error('Usage: mush-loader install <pkg[@version]>');
    process.exit(1);
  }

  const [name, version] = pkgArg.split('@');
  const config  = loadConfig();
  const entries = await fetchIndex(config);
  const entry   = resolvePackage(entries, name, version);

  if (!entry) {
    console.error(`Package not found: ${pkgArg}`);
    process.exit(1);
  }

  if (!entry.vetted) {
    console.log(`${YELLOW}Warning: ${entry.name}@${entry.version} is not marked as vetted in the registry.${RESET}`);
    console.log('Proceed anyway? [y/N] ');
    const answer = await prompt();
    if (answer.toLowerCase() !== 'y') {
      console.log('Install cancelled.');
      process.exit(0);
    }
  }

  console.log(`${CYAN}Downloading ${entry.name}@${entry.version}...${RESET}`);
  const code = await fetchPackage(entry);

  const staticResult = validateMushcode(code);
  if (staticResult.verdict === 'fail') {
    printVetResult(staticResult);
    console.error(`\n${RED}Static validation failed on registry package — this should not happen. Aborting.${RESET}`);
    process.exit(1);
  }

  console.log(`${CYAN}Installing ${entry.name}@${entry.version}...${RESET}`);
  const installResult = await installCode(code, config);

  for (const line of installResult.log) console.log(line);

  appendHistory({
    timestamp: new Date().toISOString(),
    source: 'registry',
    name: entry.name,
    version: entry.version,
    host: config.host,
    port: config.port,
    code,
    success: installResult.success,
    object: installResult.object,
  });

  if (installResult.success) {
    console.log(`\n${GREEN}Installed ${entry.name}@${entry.version}${RESET}`);
  } else {
    console.error(`\n${RED}Install errors:${RESET}`);
    for (const e of installResult.errors) console.error(`  ${e}`);
    process.exit(1);
  }
}

async function cmdUpdate(args: string[]): Promise<void> {
  const pkgArg = args[0];
  if (!pkgArg) {
    console.error('Usage: mush-loader update <pkg[@version]>');
    process.exit(1);
  }

  const [name, version] = pkgArg.split('@');
  const config  = loadConfig();
  const entries = await fetchIndex(config);
  const entry   = resolvePackage(entries, name, version);

  if (!entry) {
    console.error(`Package not found in registry: ${pkgArg}`);
    process.exit(1);
  }

  const previous = findLastInstall(name, config.host);

  console.log(`${CYAN}Downloading ${entry.name}@${entry.version}...${RESET}`);
  const newCode = await fetchPackage(entry);

  if (previous) {
    if (previous.version === entry.version && previous.code === newCode) {
      console.log(`${GREEN}${entry.name}@${entry.version} is already up to date.${RESET}`);
      return;
    }
    const diff = unifiedDiff(
      previous.code,
      newCode,
      `${entry.name}@${previous.version ?? 'local'}`,
      `${entry.name}@${entry.version}`
    );
    if (diff.trim()) {
      console.log(`\n${BOLD}Changes:${RESET}`);
      for (const line of diff.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++')) console.log(`${GREEN}${line}${RESET}`);
        else if (line.startsWith('-') && !line.startsWith('---')) console.log(`${RED}${line}${RESET}`);
        else if (line.startsWith('@@')) console.log(`${CYAN}${line}${RESET}`);
        else console.log(line);
      }
    } else {
      console.log(`${YELLOW}(code is identical but version tag differs — re-installing)${RESET}`);
    }
    console.log(`\nProceed with update? [y/N] `);
    const answer = await prompt();
    if (answer.toLowerCase() !== 'y') {
      console.log('Update cancelled.');
      return;
    }
  } else {
    console.log(`${YELLOW}No previous install found for ${name} on ${config.host} — installing fresh.${RESET}`);
  }

  const staticResult = validateMushcode(newCode);
  if (staticResult.verdict === 'fail') {
    printVetResult(staticResult);
    console.error(`\n${RED}Static validation failed — aborting update.${RESET}`);
    process.exit(1);
  }

  console.log(`\n${CYAN}Installing ${entry.name}@${entry.version}...${RESET}`);
  const installResult = await installCode(newCode, config);

  for (const line of installResult.log) console.log(line);

  appendHistory({
    timestamp: new Date().toISOString(),
    source: 'registry',
    name: entry.name,
    version: entry.version,
    host: config.host,
    port: config.port,
    code: newCode,
    success: installResult.success,
    object: installResult.object,
  });

  if (installResult.success) {
    console.log(`\n${GREEN}Updated ${entry.name} to ${entry.version}${RESET}`);
  } else {
    console.error(`\n${RED}Update errors:${RESET}`);
    for (const e of installResult.errors) console.error(`  ${e}`);
    process.exit(1);
  }
}

async function cmdStatus(): Promise<void> {
  const config = loadConfig();
  console.log(`${BOLD}Game: ${config.host}:${config.port}${RESET}\n`);

  if (apiAvailable(config)) {
    console.log(`${CYAN}Testing HTTP API (port ${config.apiPort})...${RESET}`);
    const t0 = Date.now();
    try {
      const result = await apiGet('[version()]', config);
      const ms = Date.now() - t0;
      console.log(`  ${GREEN}API OK${RESET}  ${ms}ms  — server: ${result.trim() || '(no response)'}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ${RED}API FAIL${RESET}  ${msg}`);
    }
  } else {
    console.log(`  ${DIM}HTTP API not configured (API_PORT / API_DBREF / API_PASSWORD not set)${RESET}`);
  }

  console.log(`${CYAN}Testing telnet (port ${config.port})...${RESET}`);
  const t1 = Date.now();
  try {
    await withClient(config, async () => {});
    const ms = Date.now() - t1;
    console.log(`  ${GREEN}Telnet OK${RESET}  ${ms}ms`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ${RED}Telnet FAIL${RESET}  ${msg}`);
  }
}

async function cmdBootstrap(): Promise<void> {
  const config        = loadConfig();
  const bootstrapPath = join(__dirname, '..', 'softcode', 'bootstrap.mush');
  const commandsPath  = join(__dirname, '..', 'softcode', 'commands.mush');

  console.log(`${CYAN}Installing mush-loader bootstrap object...${RESET}`);
  const bootstrapCode = readFileSync(bootstrapPath, 'utf-8');
  const r1 = await installCode(bootstrapCode, config);
  for (const line of r1.log) console.log(line);
  if (!r1.success) {
    for (const e of r1.errors) console.error(`  ${RED}${e}${RESET}`);
    process.exit(1);
  }

  console.log(`${CYAN}Installing +mload commands...${RESET}`);
  const commandsCode = readFileSync(commandsPath, 'utf-8');
  const r2 = await installCode(commandsCode, config);
  for (const line of r2.log) console.log(line);
  if (!r2.success) {
    for (const e of r2.errors) console.error(`  ${RED}${e}${RESET}`);
    process.exit(1);
  }

  console.log(`\n${GREEN}Bootstrap complete. The +mload command suite is now available in-game.${RESET}`);
}

function prompt(): Promise<string> {
  return new Promise(resolve => {
    process.stdout.write('> ');
    process.stdin.once('data', data => resolve(data.toString().trim()));
  });
}

/**
 * Minimal unified diff — no external deps, O(mn) LCS.
 * Returns an empty string when old and new are identical.
 */
function unifiedDiff(oldText: string, newText: string, oldLabel: string, newLabel: string): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Build LCS via DP
  const m = oldLines.length, n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  type Edit = { type: 'same' | 'add' | 'del'; line: string };
  const edits: Edit[] = [];
  let oi = 0, ni = 0;
  while (oi < m || ni < n) {
    if (oi < m && ni < n && oldLines[oi] === newLines[ni]) {
      edits.push({ type: 'same', line: oldLines[oi++] }); ni++;
    } else if (ni < n && (oi >= m || dp[oi][ni + 1] >= dp[oi + 1][ni])) {
      edits.push({ type: 'add', line: newLines[ni++] });
    } else {
      edits.push({ type: 'del', line: oldLines[oi++] });
    }
  }

  const changed = edits.map((e, i) => e.type !== 'same' ? i : -1).filter(i => i >= 0);
  if (changed.length === 0) return '';

  const CONTEXT = 3;
  const hunks: Array<[number, number]> = [];
  let hs = Math.max(0, changed[0] - CONTEXT);
  let he = Math.min(edits.length - 1, changed[0] + CONTEXT);
  for (let k = 1; k < changed.length; k++) {
    const next = changed[k];
    if (next - he <= CONTEXT * 2) {
      he = Math.min(edits.length - 1, next + CONTEXT);
    } else {
      hunks.push([hs, he]);
      hs = Math.max(0, next - CONTEXT);
      he = Math.min(edits.length - 1, next + CONTEXT);
    }
  }
  hunks.push([hs, he]);

  const out: string[] = [`--- ${oldLabel}`, `+++ ${newLabel}`];
  for (const [hStart, hEnd] of hunks) {
    out.push(`@@ hunk @@`);
    for (let k = hStart; k <= hEnd; k++) {
      const e = edits[k];
      out.push(`${e.type === 'same' ? ' ' : e.type === 'add' ? '+' : '-'}${e.line}`);
    }
  }
  return out.join('\n');
}

function printHelp(): void {
  console.log(`
${BOLD}mush-loader${RESET} — Safe MUSHcode loader for RhostMUSH

${BOLD}Commands:${RESET}
  load [--vet] [--dry-run] <file.mush>   Load a .mush file (--vet adds AI vetting)
  vet <file.mush>                        Vet a file without loading it
  registry                               List all registry packages
  search <query>                         Search registry by name/tag/description
  info <pkg[@version]>                   Show details for a registry package
  install <pkg[@version]>                Fetch + install from registry
  update <pkg[@version]>                 Diff + re-install a registry package
  status                                 Check connectivity to the game server
  bootstrap                              Install the in-game +mload command object

${BOLD}Flags:${RESET}
  --vet       Run AI vetting before loading (requires AI_PROVIDER in config)
  --dry-run   Print what would execute without connecting to the game

${BOLD}Config (env vars or loader.conf):${RESET}
  RHOST_HOST     Game hostname (default: localhost)
  RHOST_PORT     Game port (default: 4201)
  RHOST_USER     Wizard character name
  RHOST_PASS     Wizard password
  API_PORT       HTTP API port (optional — enables faster installs)
  API_DBREF      Dbref of the @api/enable'd object (e.g. #123)
  API_PASSWORD   API password set with @api/password
  AI_PROVIDER    anthropic | openai | gemini | ollama | custom
  AI_API_KEY     API key for your AI provider
  AI_MODEL       Model name (provider-specific)
  AI_BASE_URL    Base URL (for ollama/custom)
  REGISTRY_URL   Registry index URL

${BOLD}Examples:${RESET}
  mush-loader status
  mush-loader bootstrap
  mush-loader load --dry-run my-system.mush
  mush-loader load --vet my-system.mush
  mush-loader search bboard
  mush-loader info bboard
  mush-loader install bboard
  mush-loader update bboard
`);
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case 'load':      return cmdLoad(args);
    case 'vet':       return cmdVet(args);
    case 'registry':  return cmdRegistry();
    case 'search':    return cmdSearch(args);
    case 'info':      return cmdInfo(args);
    case 'install':   return cmdInstall(args);
    case 'update':    return cmdUpdate(args);
    case 'status':    return cmdStatus();
    case 'bootstrap': return cmdBootstrap();
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}\nRun mush-loader --help for usage.`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error(`${RED}Error: ${err.message}${RESET}`);
  process.exit(1);
});
