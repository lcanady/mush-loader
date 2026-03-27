# AI Provider Configuration

mush-loader supports any AI provider for vetting. Static validation always runs regardless.

## Anthropic (Claude)

```bash
export AI_PROVIDER=anthropic
export AI_API_KEY=sk-ant-...
export AI_MODEL=claude-opus-4-6   # or claude-sonnet-4-6
```

## OpenAI

```bash
export AI_PROVIDER=openai
export AI_API_KEY=sk-...
export AI_MODEL=gpt-4o
```

## Google Gemini

Uses the OpenAI-compatible endpoint:

```bash
export AI_PROVIDER=gemini
export AI_API_KEY=AIza...
export AI_MODEL=gemini-2.5-flash
```

## Ollama (local)

No API key required. Ensure Ollama is running (`ollama serve`).

```bash
export AI_PROVIDER=ollama
export AI_BASE_URL=http://localhost:11434
export AI_MODEL=llama3   # or any model you have pulled
```

## Custom / roll-your-own

Point at any endpoint that accepts `{ "system": "...", "user": "..." }` and returns a JSON VetResult.

```bash
export AI_PROVIDER=custom
export AI_BASE_URL=http://localhost:8080/vet
export AI_API_KEY=optional
```

The vetting system prompt (in `prompts/vet-system.md`) is sent as the `system` field. You can replace this file with your own prompt — it's the full `mush-architect` skill loaded as system context.

## No AI provider

Leave `AI_PROVIDER` unset or empty. Static validation still runs. This is safe for trusted code or when you don't have API access.
