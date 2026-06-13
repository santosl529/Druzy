import { anthropic } from '@ai-sdk/anthropic'
// To switch provider, replace this line:
//   OpenAI:  import { openai } from '@ai-sdk/openai'
//            export const chatModel = openai('gpt-4o')
export const chatModel = anthropic('claude-sonnet-4-5')
