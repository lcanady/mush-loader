/**
 * mush-patterns integration.
 *
 * After a successful vet (pass or warn+approved):
 *   → Extract the code as a pattern and add it to ../mush-patterns/patterns/
 *
 * After a failed vet:
 *   → Append the findings to ../mush-patterns/anti-patterns/
 *
 * Both operations create files and open a PR via `gh`.
 */
// import = require() compiles to `const cp = require(...)` in CJS —
// no __importStar wrapper — so test mocks patching require('child_process')
// affect the same object this module holds.
import cp = require('child_process');
import fs = require('fs');
import { join } from 'path';
import { VetResult } from './types';

const PATTERNS_DIR = join(__dirname, '..', '..', 'mush-patterns');

function patternsAvailable(): boolean {
  return fs.existsSync(PATTERNS_DIR) && fs.existsSync(join(PATTERNS_DIR, '.git'));
}

/**
 * Run a command without a shell (no string interpolation, no injection risk).
 * args[0] is the binary; the rest are passed directly to the OS.
 */
function run(args: string[], cwd: string): string {
  const [bin, ...rest] = args;
  return cp.execFileSync(bin, rest, { cwd, encoding: 'utf-8' }).trim();
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Contribute a passing/warning vetted code block to mush-patterns.
 * Creates a pattern file and opens a PR.
 */
export async function contributePattern(opts: {
  name: string;
  description: string;
  code: string;
  vetResult: VetResult;
  tags?: string[];
  author?: string;
}): Promise<{ prUrl: string } | { skipped: string }> {
  if (!patternsAvailable()) {
    return { skipped: `mush-patterns repo not found at ${PATTERNS_DIR}` };
  }

  const { name, description, code, vetResult, tags = [], author } = opts;
  const id = `system-${slug(name)}-001`;
  const branch = `patterns/${slug(name)}-${today()}`;
  const filePath = join(PATTERNS_DIR, 'patterns', 'systems', `${slug(name)}.md`);

  // Determine domain from code content
  const domain = code.includes('$+') || code.includes('$@') ? 'commands'
    : code.includes('&FN_') || code.includes('u(') ? 'functions'
    : 'systems';

  const findings = vetResult.findings.length > 0
    ? vetResult.findings.map(f => `- **[${f.severity}]** ${f.line ? `(line ${f.line}) ` : ''}${f.message}`).join('\n')
    : '_No findings._';

  const content = `---
id: ${id}
domain: ${domain}
server: RhostMUSH
source: mush-loader vet
complexity: medium
tags: [${tags.join(', ')}]
date_added: "${today()}"
tested: false
---

# Pattern: ${name}

${description}

## Code

\`\`\`mushcode
${code}
\`\`\`

## Vet result

Verdict: **${vetResult.verdict}**
Summary: ${vetResult.summary}

${findings}
${author ? `\n## Author\n\n${author}` : ''}

## Notes

- Vetted by mush-loader on ${today()}
- Add a \`@rhost/testkit\` test snippet here before marking \`tested: true\`
`;

  fs.mkdirSync(join(PATTERNS_DIR, 'patterns', domain), { recursive: true });

  // Don't overwrite existing patterns — append a sequence number
  let finalPath = filePath;
  let seq = 1;
  while (fs.existsSync(finalPath)) {
    finalPath = filePath.replace('.md', `-${String(seq).padStart(3, '0')}.md`);
    seq++;
  }

  const prBody =
    `Automatically extracted by mush-loader after a passing vet.\n\n` +
    `## Summary\n${description}\n\n` +
    `## Vet verdict\n${vetResult.verdict}: ${vetResult.summary}\n\n` +
    `Added by mush-loader`;

  try {
    run(['git', 'checkout', '-b', branch], PATTERNS_DIR);
    fs.writeFileSync(finalPath, content, 'utf-8');
    run(['git', 'add', 'patterns/'], PATTERNS_DIR);
    run(['git', 'commit', '-m', `feat: add pattern from mush-loader vet — ${name}`], PATTERNS_DIR);
    run(['git', 'push', '-u', 'origin', branch], PATTERNS_DIR);

    const prUrl = run(
      ['gh', 'pr', 'create',
        '--title', `feat: pattern from mush-loader — ${name}`,
        '--body', prBody],
      PATTERNS_DIR
    );

    return { prUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { skipped: `git/PR error: ${msg}` };
  }
}

/**
 * Record a failing vet to ../mush-patterns/anti-patterns/.
 * Anti-patterns help train future vetting prompts.
 */
export async function recordAntiPattern(opts: {
  name: string;
  code: string;
  vetResult: VetResult;
}): Promise<{ written: string } | { skipped: string }> {
  if (!patternsAvailable()) {
    return { skipped: `mush-patterns repo not found at ${PATTERNS_DIR}` };
  }

  const { name, code, vetResult } = opts;
  const antiDir = join(PATTERNS_DIR, 'anti-patterns');
  fs.mkdirSync(antiDir, { recursive: true });

  const filePath = join(antiDir, `${slug(name)}-${today()}.md`);

  const findings = vetResult.findings
    .map(f => `- **[${f.severity}]**${f.line ? ` line ${f.line}:` : ''} ${f.message}`)
    .join('\n');

  const content = `---
date: "${today()}"
verdict: ${vetResult.verdict}
---

# Anti-pattern: ${name}

**Rejected on:** ${today()}
**Reason:** ${vetResult.summary}

## Findings

${findings}

## Rejected code

\`\`\`mushcode
${code}
\`\`\`
`;

  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    run(['git', 'add', 'anti-patterns/'], PATTERNS_DIR);
    run(['git', 'commit', '-m', `chore: record failed vet anti-pattern — ${name}`], PATTERNS_DIR);
    return { written: filePath };
  } catch (err) {
    // Non-fatal — write the file locally even if git commit fails
    fs.writeFileSync(filePath, content, 'utf-8');
    return { written: filePath };
  }
}
