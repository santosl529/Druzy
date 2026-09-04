const TOOL_PART_PREFIX = 'tool-'

const INTERNAL_TOOL_NAMES = [
  'createModule',
  'createFormulaModule',
  'proposeChart',
  'queryAnalytics',
] as const

type MessagePart = {
  type: string
  toolName?: string
}

function getPartToolName(part: MessagePart): string | null {
  if (part.type.startsWith(TOOL_PART_PREFIX)) {
    return part.type.slice(TOOL_PART_PREFIX.length)
  }
  if (part.type === 'dynamic-tool' && part.toolName) {
    return part.toolName
  }
  return null
}

export function selectAssistantParts<T extends MessagePart>(parts: T[]): T[] {
  const hasToolPart = parts.some((part) => getPartToolName(part) !== null)
  if (!hasToolPart) return parts

  const seenTools = new Set<string>()
  return parts.filter((part) => {
    const toolName = getPartToolName(part)
    if (!toolName || seenTools.has(toolName)) return false
    seenTools.add(toolName)
    return true
  })
}

function removeToolJsonBlocks(text: string, toolReference: RegExp): string {
  const lines = text.split('\n')
  const removed = new Set<number>()

  for (let toolLine = 0; toolLine < lines.length; toolLine += 1) {
    if (!toolReference.test(lines[toolLine])) continue

    let start = toolLine
    while (start >= 0 && !lines[start].includes('{')) start -= 1
    if (start < 0) continue

    let depth = 0
    let inString = false
    let escaped = false
    let foundOpeningBrace = false

    for (let end = start; end < lines.length; end += 1) {
      for (const character of lines[end]) {
        if (escaped) {
          escaped = false
          continue
        }
        if (character === '\\' && inString) {
          escaped = true
          continue
        }
        if (character === '"') {
          inString = !inString
          continue
        }
        if (inString) continue
        if (character === '{') {
          foundOpeningBrace = true
          depth += 1
        } else if (character === '}') {
          depth -= 1
        }
      }

      if (foundOpeningBrace && depth === 0) {
        for (let index = start; index <= end; index += 1) removed.add(index)
        break
      }
    }
  }

  return lines.filter((_, index) => !removed.has(index)).join('\n')
}

export function sanitizeAssistantText(text: string): string {
  const toolNames = INTERNAL_TOOL_NAMES.join('|')
  const toolReference = new RegExp(toolNames, 'i')

  const withoutWrappedCalls = text
    .replace(/<tool_call\b[^>]*>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/```[\s\S]*?```/g, (block) =>
      toolReference.test(block) ? '' : block
    )

  return removeToolJsonBlocks(withoutWrappedCalls, toolReference)
    .split('\n')
    .filter((line) => {
      if (!toolReference.test(line)) return true
      return !/\b(tool|call|function|arguments?|name)\b/i.test(line)
    })
    .join('\n')
    .trim()
}
