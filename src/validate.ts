/**
 * Static validator for MUSHcode.
 * Runs before any install — no AI required.
 * Catches obviously dangerous patterns and syntax issues.
 */
import { VetFinding, VetResult } from './types';

// Patterns that are always dangerous regardless of context
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; message: string; severity: VetFinding['severity'] }> = [
  {
    pattern: /execscript\s*\(\s*[^,)]*\$|execscript\s*\(\s*[^,)]*%[0-9]/i,
    message: 'execscript() called with user-controlled argument — injection risk',
    severity: 'error',
  },
  {
    pattern: /@pemit[^=]+=.*%[0-9](?!.*strip)/i,
    message: 'User input interpolated into @pemit without stripping — XSS-equivalent risk',
    severity: 'warn',
  },
  {
    pattern: /\$[^:]+:\s*@?switch[^=]+=.*%[0-9]/i,
    message: 'User input in @switch case label — evaluated in MUSHcode context',
    severity: 'error',
  },
  {
    pattern: /@set\s+[^=]+=\s*!safe|@set\s+[^=]+=\s*!inherit/i,
    message: 'Removing safe or inherit flag from an object',
    severity: 'warn',
  },
  {
    pattern: /@power\s/i,
    message: '@power used — grants wizard-level permissions',
    severity: 'error',
  },
  {
    pattern: /@\bwizard\b/i,
    message: '@wizard used — sets wizard flag',
    severity: 'error',
  },
  {
    pattern: /\bdestroy\b.*#1\b/i,
    message: 'Attempt to destroy #1 (Master Room)',
    severity: 'error',
  },
  // @fo/@force with user-controlled target or command — classic privilege escalation
  {
    pattern: /@(?:fo|force)\s+%[0-9#]/i,
    message: '@fo/@force with user-controlled object — attacker can force themselves or others to run arbitrary code',
    severity: 'error',
  },
  {
    pattern: /@(?:fo|force)\s+[^=]+=.*%[0-9]/i,
    message: '@fo/@force passes user input as the forced command — injection risk',
    severity: 'error',
  },
  // @trigger with user-controlled attribute name lets callers fire arbitrary attrs
  {
    pattern: /@trigger\s+[^/=]+=%[0-9]/i,
    message: '@trigger attribute name is user-controlled — arbitrary attribute execution',
    severity: 'error',
  },
  // @function without /safe — inherits caller permissions and can escalate
  {
    pattern: /@(?:a)?function(?!\/safe)\s/i,
    message: '@function defined without /safe — inherits caller permissions; use @function/safe',
    severity: 'warn',
  },
  // get()/xget() with user-controlled first argument — reads arbitrary attributes
  {
    pattern: /\bx?get\s*\(\s*%[0-9]/i,
    message: 'get()/xget() called with user-controlled object — can read any readable attribute',
    severity: 'warn',
  },
  // @chown with user-controlled target object or new owner
  {
    pattern: /@chown\s+%[0-9]/i,
    message: '@chown target is user-controlled — may transfer ownership of unintended objects',
    severity: 'error',
  },
  {
    pattern: /@chown\s+[^=]+=%[0-9]/i,
    message: '@chown new owner is user-controlled — may assign ownership to any player',
    severity: 'error',
  },
  // @tel/@teleport with user-controlled destination — location-bypass attacks
  {
    pattern: /@tel(?:eport)?\s+[^=]+=%[0-9]/i,
    message: '@tel destination is user-controlled — may bypass location locks',
    severity: 'warn',
  },
  // @newpassword — always suspicious in softcode
  {
    pattern: /@newpassword\s/i,
    message: "@newpassword used — changes a player's password; verify this is intentional and wizard-locked",
    severity: 'error',
  },
  // @su/@sudo — privilege switch, must be wizard-only
  {
    pattern: /@su(?:do)?\s/i,
    message: '@su/@sudo used — switches privilege context; must be locked to wizard',
    severity: 'error',
  },
];

// Patterns that are suspicious but not necessarily wrong
const SUSPICIOUS_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /execscript/i, message: 'execscript() used — verify the script path is not user-controlled' },
  { pattern: /@\bboot\b/i, message: '@boot used — boots a player from the game' },
  { pattern: /@\bnuke\b/i, message: '@nuke used — destroys an object permanently' },
  { pattern: /\ball\b.*\bflag\b/i, message: 'Flag manipulation on all objects — verify scope' },
];

export function validateMushcode(code: string): VetResult {
  const findings: VetFinding[] = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    for (const { pattern, message, severity } of DANGEROUS_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({ severity, line: lineNum, message });
      }
    }

    for (const { pattern, message } of SUSPICIOUS_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({ severity: 'warn', line: lineNum, message });
      }
    }
  }

  // Also check for unbalanced brackets (common source of softcode bugs)
  const open = (code.match(/\[/g) ?? []).length;
  const close = (code.match(/\]/g) ?? []).length;
  if (open !== close) {
    findings.push({
      severity: 'warn',
      message: `Unbalanced brackets: ${open} opening vs ${close} closing`,
    });
  }

  const errors = findings.filter(f => f.severity === 'error');
  const warns = findings.filter(f => f.severity === 'warn');

  const verdict = errors.length > 0 ? 'fail'
    : warns.length > 0 ? 'warn'
    : 'pass';

  const summary = verdict === 'pass'
    ? 'Static validation passed — no dangerous patterns found.'
    : verdict === 'warn'
    ? `Static validation passed with ${warns.length} warning(s). Review before loading.`
    : `Static validation FAILED — ${errors.length} error(s) found. Load blocked.`;

  return { verdict, findings, summary };
}
