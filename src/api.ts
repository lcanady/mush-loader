/**
 * RhostMUSH HTTP API client.
 *
 * The API port (api_port in rhostmush.conf) exposes an HTTP endpoint that lets
 * external programs execute mushcode and read values without a telnet session.
 *
 * Protocol (headers-only — no request or response body):
 *   POST + Exec64: <base64(cmd)>   → execute one command; 200 = queued
 *   GET  + Exec64: <base64(expr)>  → evaluate expression; result in Return: header
 *
 * Authentication: HTTP Basic — user = "#<dbref>", password = API password.
 * We always use Exec64: (base64) so mushcode with special characters passes safely.
 *
 * Limitation: POST responses confirm queueing only.  MUSH-level errors
 * (bad syntax, permission denied in softcode) are not visible in the HTTP
 * response — only HTTP-level failures (4xx) are catchable here.
 * Use apiGet() with a verification expression if you need MUSH-level confirmation.
 *
 * Config requirements (all three must be set for apiAvailable() to return true):
 *   API_PORT     — port matching api_port in rhostmush.conf
 *   API_DBREF    — dbref of the @api/enable'd object, e.g. "#123"
 *   API_PASSWORD — password set with @api/password <dbref>=<pass>
 */
import { LoaderConfig } from './types';

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
