/**
 * Parse a raw AI response string into a VetResult.
 * Handles JSON wrapped in markdown code fences, raw JSON, or malformed output.
 */
import { VetResult, VetFinding } from '../types';

export function parseVetResponse(raw: string): VetResult {
  // Strip markdown code fences if present
  const cleaned = raw
    .replace(/^```json\s*/m, '')
    .replace(/^```\s*/m, '')
    .replace(/```\s*$/m, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as {
      verdict?: string;
      summary?: string;
      findings?: Array<{ severity?: string; line?: number | null; message?: string }>;
    };

    const verdict = (['pass', 'fail', 'warn'].includes(parsed.verdict ?? ''))
      ? parsed.verdict as VetResult['verdict']
      : 'warn';

    const findings: VetFinding[] = (parsed.findings ?? []).map(f => ({
      severity: (['error', 'warn', 'info'].includes(f.severity ?? ''))
        ? f.severity as VetFinding['severity']
        : 'warn',
      line: f.line ?? undefined,
      message: f.message ?? '(no message)',
    }));

    return {
      verdict,
      findings,
      summary: parsed.summary ?? '(no summary)',
      raw,
    };
  } catch {
    // AI returned something unparseable — treat as a warning
    return {
      verdict: 'warn',
      findings: [{
        severity: 'warn',
        message: 'AI response could not be parsed as JSON — manual review required',
      }],
      summary: 'AI vetting response was malformed. Treat as unvetted.',
      raw,
    };
  }
}
