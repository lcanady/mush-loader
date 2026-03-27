/** Shared types for mush-loader */

export interface LoaderConfig {
  // Game connection (via @rhost/testkit telnet)
  host: string;
  port: number;
  username: string;
  password: string;

  // RhostMUSH HTTP API port (optional — used instead of telnet when all three set)
  // Configure with api_port in rhostmush.conf; enable object with @api/enable + @api/password
  apiPort?: number;
  apiDbref?: string;    // e.g. '#123' — the dbref authenticated via the API
  apiPassword?: string; // password set with @api/password <dbref>=<pass>

  // AI vetting (optional)
  aiProvider?: 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'custom';
  aiApiKey?: string;
  aiModel?: string;
  aiBaseUrl?: string;     // for ollama / custom endpoints

  // Registry
  registryUrl: string;
}

export type VetVerdict = 'pass' | 'fail' | 'warn';

export interface VetFinding {
  severity: 'error' | 'warn' | 'info';
  line?: number;
  message: string;
}

export interface VetResult {
  verdict: VetVerdict;
  findings: VetFinding[];
  summary: string;
  raw?: string;           // full AI response, for debugging
}

/**
 * A parsed .mush file with optional pre/post-install hooks.
 *
 * File format:
 *   #!pre-install
 *   <mushcode run before main code>
 *   #!end-pre-install
 *
 *   <main mushcode>
 *
 *   #!post-install
 *   <mushcode run after main code>
 *   #!end-post-install
 *
 * All three sections are independently vetted before any section is installed.
 */
export interface ParsedMushFile {
  /** Raw source file contents */
  raw: string;
  /** Mushcode to run before the main body (may be empty) */
  preInstall: string;
  /** Main mushcode body */
  main: string;
  /** Mushcode to run after the main body (may be empty) */
  postInstall: string;
}

export interface LoadPackage {
  name: string;
  version: string;
  description: string;
  author?: string;
  license?: string;
  /** Path to the .mush file, or inline mushcode */
  code: string;
  vetted?: boolean;
  vetResult?: VetResult;
}

export interface RegistryEntry {
  name: string;
  version: string;
  description: string;
  author?: string;
  url: string;            // URL to the .mush file
  sha256: string;         // integrity check
  vetted: boolean;
  tags: string[];
}

export interface InstallResult {
  success: boolean;
  object?: string;        // dbref of installed object
  errors: string[];
  log: string[];
}
