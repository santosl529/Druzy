import { createOpenAI } from '@ai-sdk/openai'

// OpenRouter — swap the model string to any model on openrouter.ai/models
// e.g. 'anthropic/claude-sonnet-4-5', 'openai/gpt-4o', 'google/gemini-2.5-pro'
const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
})

export const chatModel = openrouter('openrouter/free')

// Vision-capable model used for food photo calorie estimation.
// Claude Sonnet supports image inputs and structured output via OpenRouter.
export const visionModel = openrouter('openrouter/free')
