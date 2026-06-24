// condition 节点表达式求值 —— 见 Docs/contract-reference-syntax.md
// 不使用裸 eval。先把 {{ref}} 解析为值并以 JSON 字面量代入，
// 再用一个仅支持比较/逻辑运算的最小递归下降求值器对表达式求值。
import type { RefScope } from '../types'
import { resolveValue } from './reference'

// ---- 1. 把表达式中的 {{ref}} 替换为 JSON 字面量 ----
const REF_RE = /\{\{\s*([^}]+?)\s*\}\}/g

function substituteRefs(expr: string, ctx: RefScope): string {
  return expr.replace(REF_RE, (_m, inner: string) => {
    const v = resolveValue(`{{${inner.trim()}}}`, ctx)
    return JSON.stringify(v ?? null)
  })
}

// ---- 2. 最小表达式求值器 ----
// 文法（优先级低→高）：or → and → equality → comparison → unary → primary
type Token = { t: string; v?: unknown }

function tokenize(s: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const ops = ['===', '!==', '==', '!=', '>=', '<=', '&&', '||', '>', '<', '!', '(', ')']
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) { i++; continue }
    // string literal
    if (c === '"' || c === "'") {
      let j = i + 1
      let str = ''
      while (j < s.length && s[j] !== c) {
        if (s[j] === '\\') { str += s[j + 1]; j += 2; continue }
        str += s[j]; j++
      }
      tokens.push({ t: 'lit', v: str })
      i = j + 1
      continue
    }
    // number
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < s.length && /[0-9.]/.test(s[j])) j++
      tokens.push({ t: 'lit', v: Number(s.slice(i, j)) })
      i = j
      continue
    }
    // keyword literals
    if (/[a-zA-Z]/.test(c)) {
      let j = i
      while (j < s.length && /[a-zA-Z]/.test(s[j])) j++
      const word = s.slice(i, j)
      if (word === 'true') tokens.push({ t: 'lit', v: true })
      else if (word === 'false') tokens.push({ t: 'lit', v: false })
      else if (word === 'null') tokens.push({ t: 'lit', v: null })
      else throw new Error(`非法标识符: ${word}（引用须用 {{...}}）`)
      i = j
      continue
    }
    // operator
    const op = ops.find((o) => s.startsWith(o, i))
    if (op) { tokens.push({ t: op }); i += op.length; continue }
    throw new Error(`无法解析字符: ${c}`)
  }
  return tokens
}

class Parser {
  pos = 0
  constructor(private tokens: Token[]) {}
  peek() { return this.tokens[this.pos] }
  next() { return this.tokens[this.pos++] }
  expect(t: string) {
    const tok = this.next()
    if (!tok || tok.t !== t) throw new Error(`期望 ${t}`)
  }

  parse(): unknown {
    const v = this.or()
    if (this.pos !== this.tokens.length) throw new Error('表达式有多余内容')
    return v
  }
  or(): unknown {
    let left = this.and()
    while (this.peek()?.t === '||') { this.next(); const r = this.and(); left = left || r }
    return left
  }
  and(): unknown {
    let left = this.equality()
    while (this.peek()?.t === '&&') { this.next(); const r = this.equality(); left = left && r }
    return left
  }
  equality(): unknown {
    let left = this.comparison()
    while (['===', '!==', '==', '!='].includes(this.peek()?.t)) {
      const op = this.next().t
      const r = this.comparison()
      // eslint-disable-next-line eqeqeq
      if (op === '===' || op === '==') left = left === r
      else left = left !== r
    }
    return left
  }
  comparison(): unknown {
    let left = this.unary()
    while (['>', '<', '>=', '<='].includes(this.peek()?.t)) {
      const op = this.next().t
      const r = this.unary() as number
      const l = left as number
      if (op === '>') left = l > r
      else if (op === '<') left = l < r
      else if (op === '>=') left = l >= r
      else left = l <= r
    }
    return left
  }
  unary(): unknown {
    if (this.peek()?.t === '!') { this.next(); return !this.unary() }
    return this.primary()
  }
  primary(): unknown {
    const tok = this.peek()
    if (tok?.t === '(') { this.next(); const v = this.or(); this.expect(')'); return v }
    if (tok?.t === 'lit') { this.next(); return tok.v }
    throw new Error('期望字面量或 (')
  }
}

export function evaluateCondition(
  expression: string,
  ctx: RefScope
): boolean {
  const substituted = substituteRefs(expression, ctx)
  const tokens = tokenize(substituted)
  const result = new Parser(tokens).parse()
  return Boolean(result)
}
