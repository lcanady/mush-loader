/**
 * Anthropic provider (claude-* models).
 * Uses the Messages API directly via fetch — no SDK dependency.
 */
import { LoaderConfig, VetResult } from '../types';
import { parseVetResponse } from './parse';

const DEFAULT_MODEL = 'claude-opus-4-6';

export async function vetWithAnthropic(
  code: string,
  systemPrompt: string,
  config: LoaderConfig
): Promise<VetResult> {
  if (!config.aiApiKey) throw new Error('AI_API_KEY is required for Anthropic provider');

  const model = config.aiModel ?? DEFAULT_MODEL;
  const baseUrl = config.aiBaseUrl ?? 'https://api.anthropic.com';

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.aiApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: vetUserMessage(code),
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json() as { content: Array<{ type: string; text: string }> };
  const text = data.content.find(b => b.type === 'text')?.text ?? '';

  return parseVetResponse(text);
}

function vetUserMessage(code: string): string {
  return `Please audit the following RhostMUSH softcode for security issues.

\`\`\`mushcode
${code}
\`\`\`

Respond with a JSON object in this exact format:
{
  "verdict": "pass" | "fail" | "warn",
  "summary": "one-sentence summary",
  "findings": [
    { "severity": "error" | "warn" | "info", "line": <number or null>, "message": "description" }
  ]
}`;
}
