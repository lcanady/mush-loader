/**
 * AI provider factory.
 * Returns a vet function for the configured provider.
 */
import { LoaderConfig, VetResult } from '../types';
import { vetWithAnthropic } from './anthropic';
import { vetWithOpenAICompat } from './openai-compat';
import { vetWithCustom } from './custom';

export type VetFn = (code: string, systemPrompt: string) => Promise<VetResult>;

export function getVetFn(config: LoaderConfig): VetFn {
  switch (config.aiProvider) {
    case 'anthropic':
      return (code, prompt) => vetWithAnthropic(code, prompt, config);

    case 'openai':
    case 'gemini':
    case 'ollama':
      return (code, prompt) => vetWithOpenAICompat(code, prompt, config);

    case 'custom':
      return (code, prompt) => vetWithCustom(code, prompt, config);

    default:
      throw new Error(
        'No AI_PROVIDER configured. Set AI_PROVIDER to one of: anthropic, openai, gemini, ollama, custom'
      );
  }
}
