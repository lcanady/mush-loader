#!/usr/bin/env node
/**
 * mush-loader CLI
 *
 * Usage:
 *   mush-loader load <file.mush>          Load a file (static validation only)
 *   mush-loader load --vet <file.mush>    Load with AI vetting first
 *   mush-loader vet <file.mush>           Vet without loading
 *   mush-loader registry                 List registry packages
 *   mush-loader install <pkg[@version]>  Fetch from registry and install
 *   mush-loader bootstrap                Install the game-side loader object
 *
 * All config via env vars or loader.conf (sourced before running).
 * See config/loader.conf.example for all options.
 */
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { basename } from 'path';
import { loadConfig } from './config';
import { validateMushcode } from './validate';
import { vetCode, vetParsed, recordVetOutcome, FullVetResult } from './vet';
import { installCode, installParsed } from './install';
import { parseMushFile } from './parse';
import { fetchIndex, fetchPackage, formatRegistryListing } from './registry';
import { VetResult } from './types';
import { withClient } from './client';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';

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
  const file = args.filter(a => !a.startsWith('-'))[0];

  if (!file) {
    console.error('Usage: mush-loader load [--vet] <file.mush>');
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
    // Always run static validation even without --vet
    const result = validateMushcode(rawCode);
    printVetResult(result);
    if (result.verdict === 'fail') {
      console.error(`\n${RED}Load blocked — static validation failed.${RESET}`);
      process.exit(1);
    }
  }

  console.log(`\n${CYAN}Installing ${file}...${RESET}`);
  const installResult = await withClient(config, client => installParsed(parsed, client));

  for (const line of installResult.log) console.log(line);

  if (installResult.success) {
    console.log(`\n${GREEN}Install complete.${RESET}`);
    if (installResult.object) console.log(`  Object: ${installResult.object}`);
    if (vetFlag) {
      console.log(`\n${CYAN}Contributing pattern to mush-patterns...${RESET}`);
      await recordVetOutcome({ name, description: `Loaded from ${file}`, code: rawCode, vetResult: await vetParsed(parsed, config) });
    }
  } else {
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
  const config = loadConfig();
  const entries = await fetchIndex(config);
  console.log(formatRegistryListing(entries));
}

async function cmdInstall(args: string[]): Promise<void> {
  const pkgArg = args[0];
  if (!pkgArg) {
    console.error('Usage: mush-loader install <pkg[@version]>');
    process.exit(1);
  }

  const [name, version] = pkgArg.split('@');
  const config = loadConfig();
  const entries = await fetchIndex(config);
  const entry = entries.find(e =>
    e.name === name && (version ? e.version === version : true)
  );

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

  // Still run static validation on registry packages
  const staticResult = validateMushcode(code);
  if (staticResult.verdict === 'fail') {
    printVetResult(staticResult);
    console.error(`\n${RED}Static validation failed on registry package — this should not happen. Aborting.${RESET}`);
    process.exit(1);
  }

  console.log(`${CYAN}Installing ${entry.name}@${entry.version}...${RESET}`);
  const installResult = await installCode(code, config);

  for (const line of installResult.log) console.log(line);

  if (installResult.success) {
    console.log(`\n${GREEN}Installed ${entry.name}@${entry.version}${RESET}`);
  } else {
    console.error(`\n${RED}Install errors:${RESET}`);
    for (const e of installResult.errors) console.error(`  ${e}`);
    process.exit(1);
  }
}

async function cmdBootstrap(): Promise<void> {
  const config = loadConfig();
  const bootstrapPath = join(__dirname, '..', 'softcode', 'bootstrap.mush');
  const commandsPath = join(__dirname, '..', 'softcode', 'commands.mush');

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

function printHelp(): void {
  console.log(`
${BOLD}mush-loader${RESET} — Safe MUSHcode loader for RhostMUSH

${BOLD}Commands:${RESET}
  load [--vet] <file.mush>     Load a .mush file (--vet runs AI vetting first)
  vet <file.mush>              Vet a file without loading it
  registry                     List available packages in the registry
  install <pkg[@version]>      Fetch a registry package and install it
  bootstrap                    Install the game-side +mload command object

${BOLD}Config (env vars or loader.conf):${RESET}
  RHOST_HOST     Game hostname (default: localhost)
  RHOST_PORT     Game port (default: 4201)
  RHOST_USER     Wizard character name
  RHOST_PASS     Wizard password
  AI_PROVIDER    anthropic | openai | gemini | ollama | custom
  AI_API_KEY     API key for your AI provider
  AI_MODEL       Model name (provider-specific)
  AI_BASE_URL    Base URL (for ollama/custom)
  REGISTRY_URL   Registry index URL

${BOLD}Examples:${RESET}
  mush-loader bootstrap
  mush-loader load my-system.mush
  mush-loader load --vet my-system.mush
  mush-loader vet my-system.mush
  mush-loader registry
  mush-loader install bboard@1.0.0
`);
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case 'load':      return cmdLoad(args);
    case 'vet':       return cmdVet(args);
    case 'registry':  return cmdRegistry();
    case 'install':   return cmdInstall(args);
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
