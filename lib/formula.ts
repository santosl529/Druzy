// ----------------------------------------------------------------
// Safe formula evaluation for formula modules.
//
// SECURITY: expressions are parsed into an AST by a hand-rolled
// tokenizer + recursive-descent parser and evaluated by walking the
// AST. Only numbers, named aliases, + - * / % ^, unary minus, and
// parentheses are accepted; every other character is rejected at
// tokenize time. There is NO eval, NO Function constructor, NO
// member access, NO function calls — nothing that can reach
// JavaScript. (The expr-eval npm package was deliberately avoided:
// it is unmaintained and has open code-execution CVEs, 2025-12735
// and 2025-13204.)
//
// This module is pure and runs both server-side (compute on read)
// and client-side (live preview in the builder).
// ----------------------------------------------------------------

import type { Entry, FormulaConfig, Module, ModuleField } from './types'

// ----------------------------------------------------------------
// Tokenizer
// ----------------------------------------------------------------

type Token =
  | { type: 'number'; value: number }
  | { type: 'ident'; name: string }
  | { type: 'op'; op: '+' | '-' | '*' | '/' | '%' | '^' }
  | { type: 'lparen' }
  | { type: 'rparen' }

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*/
const NUMBER_RE = /^(\d+\.?\d*|\.\d+)/

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue }
    if (ch === '(') { tokens.push({ type: 'lparen' }); i++; continue }
    if (ch === ')') { tokens.push({ type: 'rparen' }); i++; continue }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '%' || ch === '^') {
      tokens.push({ type: 'op', op: ch }); i++; continue
    }
    const rest = input.slice(i)
    const num = NUMBER_RE.exec(rest)
    if (num) { tokens.push({ type: 'number', value: Number(num[0]) }); i += num[0].length; continue }
    const ident = IDENT_RE.exec(rest)
    if (ident) { tokens.push({ type: 'ident', name: ident[0] }); i += ident[0].length; continue }
    throw new FormulaError(`Unexpected character "${ch}" at position ${i + 1}`)
  }
  return tokens
}

// ----------------------------------------------------------------
// Parser (recursive descent)
//
//   expr   := add
//   add    := mul (('+'|'-') mul)*
//   mul    := unary (('*'|'/'|'%') unary)*
//   unary  := '-' unary | power
//   power  := primary ('^' unary)?          (right-associative)
//   primary := NUMBER | IDENT | '(' expr ')'
// ----------------------------------------------------------------

export type AstNode =
  | { type: 'num'; value: number }
  | { type: 'var'; name: string }
  | { type: 'neg'; operand: AstNode }
  | { type: 'bin'; op: '+' | '-' | '*' | '/' | '%' | '^'; left: AstNode; right: AstNode }

export class FormulaError extends Error {}

class Parser {
  private pos = 0
  constructor(private tokens: Token[]) {}

  parse(): AstNode {
    if (this.tokens.length === 0) throw new FormulaError('Expression is empty')
    const node = this.parseAdd()
    if (this.pos < this.tokens.length) throw new FormulaError('Unexpected trailing input')
    return node
  }

  private peek(): Token | undefined { return this.tokens[this.pos] }
  private next(): Token | undefined { return this.tokens[this.pos++] }

  private parseAdd(): AstNode {
    let left = this.parseMul()
    for (;;) {
      const t = this.peek()
      if (t?.type === 'op' && (t.op === '+' || t.op === '-')) {
        this.next()
        left = { type: 'bin', op: t.op, left, right: this.parseMul() }
      } else return left
    }
  }

  private parseMul(): AstNode {
    let left = this.parseUnary()
    for (;;) {
      const t = this.peek()
      if (t?.type === 'op' && (t.op === '*' || t.op === '/' || t.op === '%')) {
        this.next()
        left = { type: 'bin', op: t.op, left, right: this.parseUnary() }
      } else return left
    }
  }

  private parseUnary(): AstNode {
    const t = this.peek()
    if (t?.type === 'op' && t.op === '-') {
      this.next()
      return { type: 'neg', operand: this.parseUnary() }
    }
    if (t?.type === 'op' && t.op === '+') { // tolerate unary plus
      this.next()
      return this.parseUnary()
    }
    return this.parsePower()
  }

  private parsePower(): AstNode {
    const base = this.parsePrimary()
    const t = this.peek()
    if (t?.type === 'op' && t.op === '^') {
      this.next()
      return { type: 'bin', op: '^', left: base, right: this.parseUnary() }
    }
    return base
  }

  private parsePrimary(): AstNode {
    const t = this.next()
    if (!t) throw new FormulaError('Unexpected end of expression')
    if (t.type === 'number') return { type: 'num', value: t.value }
    if (t.type === 'ident') return { type: 'var', name: t.name }
    if (t.type === 'lparen') {
      const inner = this.parseAdd()
      const close = this.next()
      if (close?.type !== 'rparen') throw new FormulaError('Missing closing parenthesis')
      return inner
    }
    throw new FormulaError(`Unexpected "${t.type === 'op' ? t.op : ')'}"`)
  }
}

function parseExpression(expression: string): AstNode {
  return new Parser(tokenize(expression)).parse()
}

function extractVariables(node: AstNode, out = new Set<string>()): Set<string> {
  switch (node.type) {
    case 'var': out.add(node.name); break
    case 'neg': extractVariables(node.operand, out); break
    case 'bin':
      extractVariables(node.left, out)
      extractVariables(node.right, out)
      break
  }
  return out
}

/**
 * Validate an expression against the declared aliases.
 * Returns an error message, or null if valid.
 */
export function validateExpression(expression: string, aliases: string[]): string | null {
  let ast: AstNode
  try {
    ast = parseExpression(expression)
  } catch (e) {
    return e instanceof FormulaError ? e.message : 'Invalid expression'
  }
  const known = new Set(aliases)
  const unknown = [...extractVariables(ast)].filter((v) => !known.has(v))
  if (unknown.length > 0) {
    return `Unknown alias${unknown.length > 1 ? 'es' : ''}: ${unknown.join(', ')}`
  }
  return null
}

/** Evaluate an AST with a numeric scope. All variables must be present. */
function evaluateAst(node: AstNode, scope: Record<string, number>): number {
  switch (node.type) {
    case 'num': return node.value
    case 'var': {
      // Own-property lookup only — never the prototype chain.
      if (!Object.prototype.hasOwnProperty.call(scope, node.name)) {
        throw new FormulaError(`Missing value for "${node.name}"`)
      }
      return scope[node.name]
    }
    case 'neg': return -evaluateAst(node.operand, scope)
    case 'bin': {
      const l = evaluateAst(node.left, scope)
      const r = evaluateAst(node.right, scope)
      switch (node.op) {
        case '+': return l + r
        case '-': return l - r
        case '*': return l * r
        case '/': return l / r
        case '%': return l % r
        case '^': return Math.pow(l, r)
      }
    }
  }
}

// ----------------------------------------------------------------
// Compute-on-read daily series
// ----------------------------------------------------------------

export interface FormulaPoint {
  date: string
  value: number
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

/**
 * Compute the formula's daily values from current source data.
 * For each input, multiple entries on the same day are averaged.
 * A day is computed when every input has a logged value that day, or
 * a configured defaultValue for inputs with no entry. Values are never
 * fabricated beyond those explicit defaults.
 */
export function computeFormulaSeries(
  config: FormulaConfig,
  entriesByModule: Map<string, Entry[]>
): FormulaPoint[] {
  let ast: AstNode
  try {
    ast = parseExpression(config.expression)
  } catch {
    return []
  }

  // alias → (date → average value)
  const perInput: { alias: string; byDate: Map<string, number> }[] = []
  for (const input of config.inputs) {
    const sums = new Map<string, { sum: number; count: number }>()
    for (const e of entriesByModule.get(input.moduleId) ?? []) {
      const v = toNumber((e.values as Record<string, unknown>)[input.field])
      if (v === null) continue
      const acc = sums.get(e.entry_date) ?? { sum: 0, count: 0 }
      acc.sum += v
      acc.count += 1
      sums.set(e.entry_date, acc)
    }
    const byDate = new Map<string, number>()
    for (const [date, { sum, count }] of sums) byDate.set(date, sum / count)
    perInput.push({ alias: input.alias, byDate })
  }
  if (perInput.length === 0) return []

  const allDates = new Set<string>()
  for (const inp of perInput) for (const d of inp.byDate.keys()) allDates.add(d)

  const points: FormulaPoint[] = []
  for (const date of [...allDates].sort()) {
    const scope: Record<string, number> = Object.create(null)
    let canCompute = true
    for (let i = 0; i < config.inputs.length; i++) {
      const input = config.inputs[i]
      const inp = perInput[i]
      const logged = inp.byDate.get(date)
      if (logged !== undefined) {
        scope[inp.alias] = logged
      } else if (input.defaultValue !== undefined) {
        scope[inp.alias] = input.defaultValue
      } else {
        canCompute = false
        break
      }
    }
    if (!canCompute) continue
    try {
      const value = evaluateAst(ast, scope)
      if (Number.isFinite(value)) points.push({ date, value: round6(value) })
    } catch {
      // skip days that fail to evaluate
    }
  }
  return points
}

// ----------------------------------------------------------------
// Synthetic entries — let formula modules flow through the existing
// entry-based chart pipeline without storing anything.
// ----------------------------------------------------------------

/** The single read-only field every formula module exposes. */
export const FORMULA_VALUE_FIELD: ModuleField = {
  key: 'value',
  label: 'Value',
  type: 'number',
  required: false,
}

function buildFormulaEntries(
  module: Module,
  entriesByModule: Map<string, Entry[]>
): Entry[] {
  if (module.kind !== 'formula' || !module.formula_config) return []
  return computeFormulaSeries(module.formula_config, entriesByModule).map((p) => ({
    id: `formula:${module.id}:${p.date}`,
    module_id: module.id,
    user_id: module.user_id,
    values: { value: p.value },
    entry_date: p.date,
    created_at: `${p.date}T00:00:00Z`,
  }))
}

/**
 * Append computed entries for every formula module in `modules`.
 * Source entries for the formula inputs must already be in `entries`.
 */
export function withFormulaEntries(modules: Module[], entries: Entry[]): Entry[] {
  const formulaModules = modules.filter((m) => m.kind === 'formula' && m.formula_config)
  if (formulaModules.length === 0) return entries

  const byModule = new Map<string, Entry[]>()
  for (const e of entries) {
    const list = byModule.get(e.module_id) ?? []
    list.push(e)
    byModule.set(e.module_id, list)
  }
  return [...entries, ...formulaModules.flatMap((m) => buildFormulaEntries(m, byModule))]
}
