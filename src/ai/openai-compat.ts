/**
 * OpenAI-compatible provider.
 * Works with: OpenAI, Google Gemini (via OpenAI compat endpoint),
 * Ollama (http://localhost:11434/v1), and any other OpenAI-protocol server.
 */
import { LoaderConfig, VetResult } from '../types';
import { parseVetResponse } from './parse';

const DEFAULT_URLS: Record<string, string> = {
  openai: 'https://api.openai.com',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  ollama: 'http://localhost:11434',
};

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-flash',
  ollama: 'llama3',
};

export async function vetWithOpenAICompat(
  code: string,
  systemPrompt: string,
  config: LoaderConfig
): Promise<VetResult> {
  const provider = config.aiProvider as string;
  const baseUrl = config.aiBaseUrl ?? DEFAULT_URLS[provider];
  const model = config.aiModel ?? DEFAULT_MODELS[provider] ?? 'gpt-4o';

  if (!baseUrl) throw new Error(`Cannot determine base URL for provider: ${provider}. Set AI_BASE_URL.`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.aiApiKey) {
    headers['Authorization'] = `Bearer ${config.aiApiKey}`;
  }

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: vetUserMessage(code) },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${provider} API error ${response.status}: ${body}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  const text = data.choices[0]?.message.content ?? '';

  return parseVetResponse(text);
}

function vetUserMessage(code: string): string {
  return `Audit this RhostMUSH softcode for security issues. Return JSON only.

\`\`\`mushcode
${code}
\`\`\`

Format:
{
  "verdict": "pass" | "fail" | "warn",
  "summary": "one-sentence summary",
  "findings": [
    { "severity": "error" | "warn" | "info", "line": <number or null>, "message": "description" }
  ]
}`;
}
