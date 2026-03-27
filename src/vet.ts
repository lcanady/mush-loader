/**
 * Vetting pipeline.
 *
 * All three sections (pre-install, main, post-install) are vetted independently.
 * A single error in any section blocks the entire load.
 *
 * After vetting:
 *   pass/warn → contributePattern() to ../mush-patterns
 *   fail      → recordAntiPattern()  to ../mush-patterns/anti-patterns
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { LoaderConfig, VetResult, VetFinding, ParsedMushFile } from './types';
import { validateMushcode } from './validate';
import { getVetFn } from './ai/index';
import { contributePattern, recordAntiPattern } from './patterns';

function loadSystemPrompt(): string {
  const promptPath = join(__dirname, '..', 'prompts', 'vet-system.md');
  try {
    return readFileSync(promptPath, 'utf-8');
  } catch {
    return 'You are a RhostMUSH softcode security auditor. Identify injection risks, privilege escalation, and unsafe patterns.';
  }
}

function mergeResults(label: string, result: VetResult): VetResult {
  return {
    ...result,
    findings: result.findings.map(f => ({ ...f, message: `[${label}] ${f.message}` })),
    summary: `[${label}] ${result.summary}`,
  };
}

/** Vet a single code block. Returns a result with section label on all findings. */
async function vetSection(
  code: string,
  label: string,
  config: LoaderConfig,
  systemPrompt: string
): Promise<VetResult> {
  if (!code.trim()) {
    return { verdict: 'pass', findings: [], summary: `[${label}] empty — skipped` };
  }

  const staticResult = validateMushcode(code);
  if (staticResult.verdict === 'fail') {
    return mergeResults(label, staticResult);
  }

  if (!config.aiProvider) {
    return mergeResults(label, {
      ...staticResult,
      summary: staticResult.summary + ' (AI vetting skipped — no AI_PROVIDER configured)',
    });
  }

  const vetFn = getVetFn(config);
  let aiResult: VetResult;
  try {
    aiResult = await vetFn(code, systemPrompt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return mergeResults(label, {
      verdict: 'warn',
      findings: [
        ...staticResult.findings,
        { severity: 'warn', message: `AI vetting failed: ${msg}` },
      ],
      summary: `Static passed but AI vetting failed: ${msg}`,
    });
  }

  const allFindings: VetFinding[] = [...staticResult.findings, ...aiResult.findings];
  const hasErrors = allFindings.some(f => f.severity === 'error');
  const hasWarns  = allFindings.some(f => f.severity === 'warn');

  return mergeResults(label, {
    verdict: hasErrors ? 'fail' : hasWarns ? 'warn' : 'pass',
    findings: allFindings,
    summary: aiResult.summary,
    raw: aiResult.raw,
  });
}

export interface FullVetResult {
  /** Merged verdict across all sections — worst of pre/main/post */
  verdict: VetResult['verdict'];
  /** Merged findings from all sections, each prefixed with [section] */
  findings: VetFinding[];
  summary: string;
  perSection: {
    preInstall:  VetResult;
    main:        VetResult;
    postInstall: VetResult;
  };
}

/**
 * Vet all three sections of a parsed .mush file.
 * Returns a merged FullVetResult.
 */
export async function vetParsed(
  parsed: ParsedMushFile,
  config: LoaderConfig
): Promise<FullVetResult> {
  const systemPrompt = loadSystemPrompt();

  const [preResult, mainResult, postResult] = await Promise.all([
    vetSection(parsed.preInstall,  'pre-install',  config, systemPrompt),
    vetSection(parsed.main,        'main',          config, systemPrompt),
    vetSection(parsed.postInstall, 'post-install',  config, systemPrompt),
  ]);

  const allFindings = [
    ...preResult.findings,
    ...mainResult.findings,
    ...postResult.findings,
  ];

  const hasErrors = allFindings.some(f => f.severity === 'error');
  const hasWarns  = allFindings.some(f => f.severity === 'warn');
  const verdict   = hasErrors ? 'fail' : hasWarns ? 'warn' : 'pass';

  const mainSummary = [preResult, mainResult, postResult]
    .filter(r => r.verdict !== 'pass')
    .map(r => r.summary)
    .join('; ') || mainResult.summary;

  return {
    verdict,
    findings: allFindings,
    summary: mainSummary,
    perSection: { preInstall: preResult, main: mainResult, postInstall: postResult },
  };
}

/**
 * Convenience wrapper for a raw code string (no sections).
 * Used by `mush-loader vet <file>` on files without markers.
 */
export async function vetCode(code: string, config: LoaderConfig): Promise<VetResult> {
  const systemPrompt = loadSystemPrompt();
  return vetSection(code, 'main', config, systemPrompt);
}

/**
 * Record the vet outcome to ../mush-patterns.
 * Call this after the user has approved (or the load succeeded).
 */
export async function recordVetOutcome(opts: {
  name: string;
  description: string;
  code: string;
  vetResult: VetResult | FullVetResult;
  tags?: string[];
  author?: string;
}): Promise<void> {
  // Normalise to a flat VetResult for the patterns module
  const flat: VetResult = 'perSection' in opts.vetResult
    ? {
        verdict:  opts.vetResult.verdict,
        findings: opts.vetResult.findings,
        summary:  opts.vetResult.summary,
      }
    : opts.vetResult;

  if (flat.verdict === 'fail') {
    const result = await recordAntiPattern({
      name:      opts.name,
      code:      opts.code,
      vetResult: flat,
    });
    if ('written' in result) {
      console.log(`  Anti-pattern recorded: ${result.written}`);
    } else {
      console.log(`  Anti-pattern skipped: ${result.skipped}`);
    }
  } else {
    const result = await contributePattern({
      name:        opts.name,
      description: opts.description,
      code:        opts.code,
      vetResult:   flat,
      tags:        opts.tags,
      author:      opts.author,
    });
    if ('prUrl' in result) {
      console.log(`  Pattern PR opened: ${result.prUrl}`);
    } else {
      console.log(`  Pattern skipped: ${result.skipped}`);
    }
  }
}
