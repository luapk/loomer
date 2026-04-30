import Anthropic from '@anthropic-ai/sdk';

// Singleton Anthropic client — constructed once, reused across requests.
// The API key is read from env at construction time, so this is safe to
// import in server components and route handlers.
export function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  return new Anthropic({ apiKey });
}
