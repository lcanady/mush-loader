/**
 * Config loader. Reads from environment variables.
 * All values can be set in a .env-style loader.conf file sourced before running,
 * or passed directly as environment variables.
 */
import { LoaderConfig } from './types';

export function loadConfig(): LoaderConfig {
  const host = process.env.RHOST_HOST ?? 'localhost';
  const rawPort = process.env.RHOST_PORT ?? '4201';
  const port = parseInt(rawPort, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`RHOST_PORT must be a number between 1 and 65535, got: ${rawPort}`);
  }
  const username = process.env.RHOST_USER ?? '';
  const password = process.env.RHOST_PASS ?? '';

  if (!username) throw new Error('RHOST_USER is required');
  if (!password) throw new Error('RHOST_PASS is required');

  const aiProvider = process.env.AI_PROVIDER as LoaderConfig['aiProvider'] | undefined;
  if (aiProvider && !['anthropic', 'openai', 'gemini', 'ollama', 'custom'].includes(aiProvider)) {
    throw new Error(`Unknown AI_PROVIDER: ${aiProvider}. Valid: anthropic, openai, gemini, ollama, custom`);
  }

  return {
    host,
    port,
    username,
    password,
    aiProvider,
    aiApiKey: process.env.AI_API_KEY,
    aiModel: process.env.AI_MODEL,
    aiBaseUrl: process.env.AI_BASE_URL,
    registryUrl: process.env.REGISTRY_URL ?? 'https://raw.githubusercontent.com/lcanady/mush-registry/main/index.json',
  };
}
