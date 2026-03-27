/**
 * Custom / roll-your-own provider.
 * Sends a POST to AI_BASE_URL with the system prompt and code.
 * Expects a JSON response matching the VetResult shape.
 *
 * This lets you point at a local Claude Code skill server, a fine-tuned
 * model, or any endpoint that speaks a simple JSON request/response protocol.
 *
 * Request body sent:
 *   { "system": "<system prompt>", "user": "<vet message>" }
 *
 * Expected response:
 *   { "verdict": "pass"|"fail"|"warn", "summary": "...", "findings": [...] }
 */
import { LoaderConfig, VetResult } from '../types';
import { parseVetResponse } from './parse';

export async function vetWithCustom(
  code: string,
  systemPrompt: string,
  config: LoaderConfig
): Promise<VetResult> {
  if (!config.aiBaseUrl) throw new Error('AI_BASE_URL is required for custom provider');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.aiApiKey) headers['Authorization'] = `Bearer ${config.aiApiKey}`;

  const response = await fetch(config.aiBaseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      system: systemPrompt,
      user: `Audit this RhostMUSH softcode for security issues. Return JSON only.\n\n\`\`\`mushcode\n${code}\n\`\`\``,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Custom AI endpoint error ${response.status}: ${body}`);
  }

  const text = await response.text();
  return parseVetResponse(text);
}
