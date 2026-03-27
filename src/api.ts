/**
 * RhostMUSH HTTP API client.
 *
 * The API port (api_port in rhostmush.conf) exposes an HTTP endpoint that lets
 * external programs execute mushcode and read values without a telnet session.
 *
 * Protocol (headers-only — no request or response body):
 *   POST + Exec64: <base64(cmd)>   → execute one command; 200 = queued only
 *   GET  + Exec64: <base64(expr)>  → evaluate expression; result in Return: header
 *
 * Error detection strategy:
 *   POST is fire-and-forget — HTTP 200 means the command was queued, NOT that
 *   it succeeded at the MUSH level.  To detect MUSH errors (permission denied,
 *   object not found, etc.) use GET with a function equivalent via translateCommand().
 *   Commands with no function equivalent (think, @power, @pemit, …) use POST and
 *   their MUSH-level errors are undetectable.
 *
 * Authentication: HTTP Basic — user = "#<dbref>", password = API password.
 * Always use Exec64: (base64) so mushcode with special characters passes safely.
 *
 * Config requirements (all three must be set for apiAvailable() to return true):
 *   API_PORT     — port matching api_port in rhostmush.conf
 *   API_DBREF    — dbref of the @api/enable'd object, e.g. "#123"
 *   API_PASSWORD — password set with @api/password <dbref>=<pass>
 */
import { LoaderConfig } from './types';

// ---------------------------------------------------------------------------
// Command → GET translation
// ---------------------------------------------------------------------------

export interface CommandTranslation {
  /** GET expression that executes the side effect and returns a checkable value. */
  expr: string;
  /**
   * Returns a non-empty error string when the GET result indicates failure,
   * or null/undefined when the command succeeded.
   */
  errorFromResult(result: string): string | null;
  /** Extract a dbref from a success result, if applicable. */
  dbrefFromResult?(result: string): string | undefined;
}

/**
 * Try to translate a single .mush command line into a GET-evaluable expression
 * whose Return: value indicates success or failure.
 *
 * Returns null when no translation exists — the caller should fall back to
 * apiExec (POST), accepting that MUSH-level errors will be invisible.
 *
 * Translations implemented:
 *   @create Name [<tag>]  →  [create(Name <tag>)]       returns #dbref or #-N
 *   @set    obj=flag      →  [set(obj,flag)]             returns 1 or #-N
 *   @lock[/type] obj=key  →  [lock(obj,key[,type])]      returns 1 or #-N
 *
 * Not translated (POST-only):
 *   &ATTR obj=val    — no standard set-attribute function in MUSH
 *   @power obj=pwr   — no function equivalent
 *   @parent obj=p    — parent() return semantics vary across servers
 *   think / @pemit / @emit / @fo / @trigger / …
 */
export function translateCommand(line: string): CommandTranslation | null {
  // @create Name [<tag>]  — returns #dbref on success, #-N on failure
  const createM = line.match(/^@create\s+(.+)$/i);
  if (createM) {
    const args = createM[1].trim();
    return {
      expr: `[create(${args})]`,
      errorFromResult(r) {
        return r.startsWith('#-') ? `create(${args}) returned ${r}` : null;
      },
      dbrefFromResult(r) {
        return /^#\d+$/.test(r) ? r : undefined;
      },
    };
  }

  // @set obj=flag  — returns 1 on success, #-N on failure
  const setM = line.match(/^@set\s+(.+?)\s*=\s*(.+)$/i);
  if (setM) {
    const [, obj, flag] = setM;
    return {
      expr: `[set(${obj.trim()},${flag.trim()})]`,
      errorFromResult(r) {
        return r !== '1' && r !== '' ? `set(${obj.trim()},${flag.trim()}) returned ${r}` : null;
      },
    };
  }

  // @lock[/type] obj=key  — returns 1 on success, #-N on failure
  const lockM = line.match(/^@lock(?:\/(\w+))?\s+(.+?)\s*=\s*(.*)$/i);
  if (lockM) {
    const [, lockType, obj, key] = lockM;
    const typeArg = lockType ? `,${lockType}` : '';
    return {
      expr: `[lock(${obj.trim()},${key.trim()}${typeArg})]`,
      errorFromResult(r) {
        return r !== '1' && r !== '' ? `lock(${obj.trim()},${key.trim()}${typeArg}) returned ${r}` : null;
      },
    };
  }

  return null;
}

function apiBaseUrl(config: LoaderConfig): string {
  return `http://${config.host}:${config.apiPort}`;
}

function basicAuth(config: LoaderConfig): string {
  const creds = `${config.apiDbref}:${config.apiPassword}`;
  return 'Basic ' + Buffer.from(creds).toString('base64');
}

/**
 * Returns true when all three API credentials (apiPort, apiDbref, apiPassword)
 * are present in the config.  When false, fall back to the telnet path.
 */
export function apiAvailable(config: LoaderConfig): boolean {
  return !!(config.apiPort && config.apiDbref && config.apiPassword);
}

/**
 * Execute a single mushcode command via POST.
 * Throws on any non-2xx HTTP status; MUSH-level errors are not detectable here.
 */
export async function apiExec(
  command: string,
  config: LoaderConfig
): Promise<void> {
  const exec64 = Buffer.from(command).toString('base64');
  const res = await fetch(apiBaseUrl(config), {
    method: 'POST',
    headers: {
      'Authorization': basicAuth(config),
      'Exec64': exec64,
    },
  });

  if (!res.ok) {
    const detail = res.headers.get('Exec') ?? res.statusText;
    throw new Error(`API POST ${res.status}: ${detail.slice(0, 200)}`);
  }
}

/**
 * Evaluate a mushcode expression via GET and return the result string.
 * Requests base64-encoded return value (Encode: yes) to safely handle
 * multi-line or special-character output.
 * Throws on any non-2xx HTTP status.
 */
export async function apiGet(
  expression: string,
  config: LoaderConfig
): Promise<string> {
  const exec64 = Buffer.from(expression).toString('base64');
  const res = await fetch(apiBaseUrl(config), {
    method: 'GET',
    headers: {
      'Authorization': basicAuth(config),
      'Exec64': exec64,
      'Encode': 'yes',
    },
  });

  if (!res.ok) {
    const detail = res.headers.get('Exec') ?? res.statusText;
    throw new Error(`API GET ${res.status}: ${detail.slice(0, 200)}`);
  }

  const returnB64 = res.headers.get('Return') ?? '';
  return Buffer.from(returnB64, 'base64').toString('utf-8');
}
