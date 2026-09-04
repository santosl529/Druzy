import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AssistantMarkdown } from '../../components/assistant/assistant-markdown'
import {
  sanitizeAssistantText,
  selectAssistantParts,
} from '../ai/chat-presentation'

describe('assistant message presentation', () => {
  it('renders completed bold and italic Markdown without literal markers', () => {
    const html = renderToStaticMarkup(
      createElement(AssistantMarkdown, {
        text: 'A **bold** and *italic* answer.',
      })
    )

    expect(html).toContain('>bold</strong>')
    expect(html).toContain('>italic</em>')
    expect(html).not.toContain('**')
  })

  it('does not interpret raw HTML from the model', () => {
    const html = renderToStaticMarkup(
      createElement(AssistantMarkdown, {
        text: '<script>alert("no")</script>',
      })
    )

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('shows structured tool UI without adjacent model narration', () => {
    const parts = [
      { type: 'text', text: 'I will call createModule now.' },
      { type: 'tool-createModule', toolCallId: 'first' },
    ]

    expect(selectAssistantParts(parts)).toEqual([parts[1]])
  })

  it('keeps only the first invocation of the same tool in one message', () => {
    const parts = [
      { type: 'tool-createModule', toolCallId: 'first' },
      { type: 'tool-createModule', toolCallId: 'duplicate' },
      { type: 'tool-proposeChart', toolCallId: 'different-tool' },
    ]

    expect(selectAssistantParts(parts)).toEqual([parts[0], parts[2]])
  })

  it('removes textual tool-call syntax when no structured call arrived', () => {
    const leaked =
      '<tool_call>{"name":"queryAnalytics","arguments":{}}</tool_call>\nYour average is 7.'

    expect(sanitizeAssistantText(leaked)).toBe('Your average is 7.')
  })

  it('removes a multiline JSON tool call without leaving its arguments behind', () => {
    const leaked = [
      'Here is the result:',
      '{',
      '  "name": "createModule",',
      '  "arguments": { "name": "Sleep" }',
      '}',
      'Review the proposal below.',
    ].join('\n')

    expect(sanitizeAssistantText(leaked)).toBe(
      'Here is the result:\nReview the proposal below.'
    )
  })
})
