// 数据引用语法解析 —— 见 Docs/contract-reference-syntax.md
import type { RefScope } from '../types'

const REF_RE = /\{\{\s*([^}]+?)\s*\}\}/g
const FULL_REF_RE = /^\{\{\s*([^}]+?)\s*\}\}$/

// 按点路径取值，支持数组下标。任一级缺失返回 undefined。
function getByPath(root: unknown, path: string[]): unknown {
  let cur: unknown = root
  for (const key of path) {
    if (cur == null) return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

// 解析单个引用表达式（如 "n1.output.label" 或 "inputs.x"）的值。
function resolveRef(
  expr: string,
  ctx: RefScope,
  warnings: string[]
): unknown {
  const parts = expr.split('.')
  const head = parts[0]
  if (head === 'inputs') {
    return getByPath(ctx.inputs, parts.slice(1))
  }
  // nodeId.output[.path...]
  const result = ctx.results[head]
  if (!result) {
    warnings.push(`引用了未执行/不存在的节点: ${head}`)
    return undefined
  }
  if (parts[1] !== 'output') {
    warnings.push(`引用须形如 ${head}.output[.path]: 收到 ${expr}`)
    return undefined
  }
  return getByPath(result.output, parts.slice(2))
}

// 解析一个值：字符串里可能含引用。
// - 整串恰为单引用时，保留原始类型；
// - 引用嵌在文本中时，按 String() 插值。
// 对象/数组递归解析。
export function resolveValue(
  value: unknown,
  ctx: RefScope,
  warnings: string[] = []
): unknown {
  if (typeof value === 'string') {
    const full = value.match(FULL_REF_RE)
    if (full) {
      return resolveRef(full[1], ctx, warnings)
    }
    return value.replace(REF_RE, (_m, expr: string) => {
      const v = resolveRef(expr.trim(), ctx, warnings)
      return v === undefined ? '' : String(v)
    })
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveValue(v, ctx, warnings))
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = resolveValue(v, ctx, warnings)
    }
    return out
  }
  return value
}

// 解析整个 data 对象，返回解析后的副本与 warnings。
export function resolveData(
  data: Record<string, unknown>,
  ctx: RefScope
): { resolved: Record<string, unknown>; warnings: string[] } {
  const warnings: string[] = []
  const resolved = resolveValue(data, ctx, warnings) as Record<string, unknown>
  return { resolved, warnings }
}
