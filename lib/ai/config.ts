import { createOpenAI } from '@ai-sdk/openai'
import { google } from '@ai-sdk/google'

// OpenRouter — swap the model string to any model on openrouter.ai/models
// e.g. 'anthropic/claude-sonnet-4-5', 'openai/gpt-4o', 'google/gemini-2.5-pro'
const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
})

export const chatModel = openrouter('openrouter/free')

// Vision-capable model used for food photo calorie estimation.
// Google AI Studio (Gemini) — reads GOOGLE_GENERATIVE_AI_API_KEY (server-only).
// Swap the model string to any id on ai.google.dev/gemini-api/docs/models.
export const visionModel = google('gemini-3.8-flash')
