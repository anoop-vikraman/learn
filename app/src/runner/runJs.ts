// Runs a JavaScript snippet in a throwaway Web Worker so that:
//  - the page can never freeze (an infinite loop is killed by terminate() after a timeout),
//  - the snippet cannot touch the app's DOM or variables,
//  - the real event loop is used, so puzzle output (microtasks vs timers) is genuine.

export type LogLevel = 'log' | 'warn' | 'error'
export interface LogLine {
  level: LogLevel
  text: string
}
export interface RunHandlers {
  onLine: (line: LogLine) => void
  onClear: () => void
  onDone: (info: { ms: number; timedOut: boolean }) => void
}

/* oxlint-disable no-eval */
// IMPORTANT: this function is stringified and executed inside the worker, so it must be self-contained.
function workerMain() {
  const g = self as any
  g.window = g
  g.global = g
  const post = (level: string, text: string) => g.postMessage({ type: 'log', level, text })

  // ---------- value formatting (a small version of Node's util.inspect) ----------
  const isIdent = (k: string) => /^[A-Za-z_$][\w$]*$/.test(k)
  function inspect(v: any, depth: number, seen: any[], nested: boolean): string {
    if (v === null) return 'null'
    const t = typeof v
    if (t === 'undefined') return 'undefined'
    if (t === 'string') return nested ? "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'" : v
    if (t === 'number') return Object.is(v, -0) ? '-0' : String(v)
    if (t === 'bigint') return v + 'n'
    if (t === 'symbol') return v.toString()
    if (t === 'function') {
      const isClass = /^class[\s{]/.test(Function.prototype.toString.call(v))
      const name = v.name
      if (isClass) return `[class ${name || '(anonymous)'}]`
      return name ? `[Function: ${name}]` : '[Function (anonymous)]'
    }
    if (t !== 'object') return String(v)
    if (seen.includes(v)) return '[Circular]'
    if (v instanceof Error) return nested ? `[${v.name}: ${v.message}]` : `${v.name}: ${v.message}`
    if (v instanceof Date) return isNaN(+v) ? 'Invalid Date' : v.toISOString()
    if (v instanceof RegExp) return String(v)
    if (v instanceof Promise) return 'Promise { <state unknown> }'
    if (v instanceof WeakMap) return 'WeakMap { <items unknown> }'
    if (v instanceof WeakSet) return 'WeakSet { <items unknown> }'

    const ctorName: string = (() => {
      try {
        const proto = Object.getPrototypeOf(v)
        return proto === null ? 'null' : proto.constructor && proto.constructor.name
      } catch {
        return 'Object'
      }
    })()
    const next = seen.concat([v])
    const items: string[] = []
    let open = '{'
    let close = '}'
    let prefix = ''

    if (Array.isArray(v)) {
      open = '['
      close = ']'
      if (ctorName !== 'Array') prefix = `${ctorName}(${v.length}) `
      if (depth > 2) return '[Array]'
      for (let i = 0; i < Math.min(v.length, 100); i++) items.push(inspect(v[i], depth + 1, next, true))
      if (v.length > 100) items.push(`... ${v.length - 100} more items`)
    } else if (v instanceof Map) {
      prefix = `Map(${v.size}) `
      if (depth > 2) return '[Map]'
      v.forEach((val, key) => items.push(`${inspect(key, depth + 1, next, true)} => ${inspect(val, depth + 1, next, true)}`))
    } else if (v instanceof Set) {
      prefix = `Set(${v.size}) `
      if (depth > 2) return '[Set]'
      v.forEach((val) => items.push(inspect(val, depth + 1, next, true)))
    } else {
      if (ctorName === 'null') prefix = '[Object: null prototype] '
      else if (ctorName && ctorName !== 'Object') prefix = ctorName + ' '
      if (depth > 2) return `[${ctorName && ctorName !== 'null' ? ctorName : 'Object'}]`
    }

    if (!(v instanceof Map) && !(v instanceof Set)) {
      const keys = Object.keys(v).filter((k) => !(Array.isArray(v) && /^\d+$/.test(k)))
      for (const k of keys) {
        const desc = Object.getOwnPropertyDescriptor(v, k)!
        const shown = desc.get ? (desc.set ? '[Getter/Setter]' : '[Getter]') : inspect(desc.value, depth + 1, next, true)
        items.push(`${isIdent(k) ? k : "'" + k + "'"}: ${shown}`)
      }
    }
    if (items.length === 0) return `${prefix}${open}${close}`
    const oneLine = `${prefix}${open} ${items.join(', ')} ${close}`
    if (oneLine.length <= 72 && !oneLine.includes('\n')) return oneLine
    const pad = '  '
    return `${prefix}${open}\n${items.map((i) => pad + i.replace(/\n/g, '\n' + pad)).join(',\n')}\n${close}`
  }

  function format(args: any[]): string {
    const first = args[0]
    let rest = args
    let out = ''
    if (typeof first === 'string' && first.includes('%') && args.length > 1) {
      let i = 1
      out = first.replace(/%[sdifjoOc%]/g, (m) => {
        if (m === '%%') return '%'
        if (i >= args.length) return m
        const a = args[i++]
        switch (m) {
          case '%s': return typeof a === 'string' ? a : inspect(a, 1, [], typeof a === 'object' && a !== null)
          case '%d': case '%i': return typeof a === 'object' ? 'NaN' : String(m === '%i' ? parseInt(a) : Number(a))
          case '%f': return String(parseFloat(a))
          case '%j': try { return JSON.stringify(a) } catch { return '[Circular]' }
          case '%c': return ''
          default: return inspect(a, 0, [], true)
        }
      })
      rest = args.slice(i)
      if (rest.length) out += ' '
    }
    return out + rest.map((a) => inspect(a, 0, [], false)).join(' ')
  }

  // ---------- console ----------
  let indent = ''
  const counts: Record<string, number> = {}
  const timers: Record<string, number> = {}
  const emit = (level: string, text: string) => post(level, text.split('\n').map((l) => indent + l).join('\n'))
  const table = (data: any) => {
    if (data === null || typeof data !== 'object') return emit('log', format([data]))
    const rows = Array.isArray(data) ? data.map((v, i) => [String(i), v]) : Object.entries(data)
    const cols: string[] = []
    let hasValues = false
    for (const [, v] of rows) {
      if (v !== null && typeof v === 'object') Object.keys(v).forEach((k) => cols.indexOf(k) < 0 && cols.push(k))
      else hasValues = true
    }
    const header = ['(index)', ...cols, ...(hasValues ? ['Values'] : [])]
    const body = rows.map(([k, v]) => [
      k,
      ...cols.map((c) => (v !== null && typeof v === 'object' && c in v ? inspect(v[c], 1, [], true) : '')),
      ...(hasValues ? [v !== null && typeof v === 'object' ? '' : inspect(v, 1, [], true)] : []),
    ])
    const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => r[i].length)))
    const line = (cells: string[]) => '│ ' + cells.map((c, i) => c.padEnd(widths[i])).join(' │ ') + ' │'
    const bar = (l: string, m: string, r: string) => l + widths.map((w) => '─'.repeat(w + 2)).join(m) + r
    emit('log', [bar('┌', '┬', '┐'), line(header), bar('├', '┼', '┤'), ...body.map(line), bar('└', '┴', '┘')].join('\n'))
  }
  g.console = {
    log: (...a: any[]) => emit('log', format(a)),
    info: (...a: any[]) => emit('log', format(a)),
    debug: (...a: any[]) => emit('log', format(a)),
    warn: (...a: any[]) => emit('warn', format(a)),
    error: (...a: any[]) => emit('error', format(a)),
    trace: (...a: any[]) => emit('log', 'Trace: ' + format(a)),
    dir: (a: any) => emit('log', inspect(a, 0, [], true)),
    table,
    assert: (cond: any, ...a: any[]) => { if (!cond) emit('error', 'Assertion failed' + (a.length ? ': ' + format(a) : '')) },
    group: (...a: any[]) => { if (a.length) emit('log', format(a)); indent += '  ' },
    groupCollapsed: (...a: any[]) => { if (a.length) emit('log', format(a)); indent += '  ' },
    groupEnd: () => { indent = indent.slice(2) },
    count: (label = 'default') => { counts[label] = (counts[label] || 0) + 1; emit('log', `${label}: ${counts[label]}`) },
    countReset: (label = 'default') => { counts[label] = 0 },
    time: (label = 'default') => { timers[label] = performance.now() },
    timeEnd: (label = 'default') => { emit('log', `${label}: ${(performance.now() - timers[label]).toFixed(3)}ms`) },
    timeLog: (label = 'default') => { emit('log', `${label}: ${(performance.now() - timers[label]).toFixed(3)}ms`) },
    clear: () => g.postMessage({ type: 'clear' }),
  }

  // ---------- timers: track what is still pending so we know when the snippet has finished ----------
  const active = new Set<number>()
  const _setTimeout = g.setTimeout.bind(g)
  const _clearTimeout = g.clearTimeout.bind(g)
  const _setInterval = g.setInterval.bind(g)
  const _clearInterval = g.clearInterval.bind(g)
  g.setTimeout = (fn: any, ms?: number, ...args: any[]) => {
    const id: number = _setTimeout(() => { active.delete(id); fn(...args) }, ms)
    active.add(id)
    return id
  }
  g.setInterval = (fn: any, ms?: number, ...args: any[]) => {
    const id: number = _setInterval(() => fn(...args), ms)
    active.add(id)
    return id
  }
  g.clearTimeout = (id: number) => { active.delete(id); _clearTimeout(id) }
  g.clearInterval = (id: number) => { active.delete(id); _clearInterval(id) }
  g.setImmediate = (fn: any, ...args: any[]) => g.setTimeout(fn, 0, ...args)

  // ---------- errors ----------
  const describe = (e: any) => (e instanceof Error ? `${e.name}: ${e.message}` : inspect(e, 0, [], true))
  g.addEventListener('error', (e: any) => { e.preventDefault(); post('error', 'Uncaught ' + describe(e.error ?? e.message)) })
  g.addEventListener('unhandledrejection', (e: any) => { e.preventDefault(); post('error', 'Uncaught (in promise) ' + describe(e.reason)) })

  // ---------- run ----------
  const finish = () => g.postMessage({ type: 'done' })
  const waitForTimers = () => {
    if (active.size > 0) return _setTimeout(waitForTimers, 20)
    _setTimeout(() => (active.size > 0 ? waitForTimers() : finish()), 15) // let late rejections surface first
  }
  const indirectEval = eval
  g.onmessage = (event: MessageEvent) => {
    const code: string = event.data
    try {
      indirectEval(code)
    } catch (err: any) {
      if (err instanceof SyntaxError && /await|async/i.test(err.message)) {
        // Top-level await: run the snippet inside an async function instead.
        try {
          indirectEval(`(async () => {\n${code}\n})().catch((e) => { throw e })`)
        } catch {
          post('error', describe(err))
        }
      } else {
        post('error', 'Uncaught ' + describe(err))
      }
    }
    _setTimeout(waitForTimers, 0)
  }
}

const WORKER_URL = () =>
  URL.createObjectURL(new Blob([`(${workerMain.toString()})()`], { type: 'text/javascript' }))

export const RUN_TIMEOUT_MS = 8000

/** Starts a run. Returns a function that cancels it. */
export function runJs(code: string, handlers: RunHandlers): () => void {
  const url = WORKER_URL()
  const worker = new Worker(url)
  const started = performance.now()
  let finished = false

  const end = (timedOut: boolean) => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    worker.terminate()
    URL.revokeObjectURL(url)
    handlers.onDone({ ms: Math.round(performance.now() - started), timedOut })
  }

  const timer = setTimeout(() => end(true), RUN_TIMEOUT_MS)

  worker.onmessage = (event: MessageEvent) => {
    const data = event.data
    if (data.type === 'log') handlers.onLine({ level: data.level, text: data.text })
    else if (data.type === 'clear') handlers.onClear()
    else if (data.type === 'done') end(false)
  }
  worker.onerror = (event) => {
    handlers.onLine({ level: 'error', text: 'Uncaught ' + event.message })
    end(false)
  }
  worker.postMessage(code)

  return () => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    worker.terminate()
    URL.revokeObjectURL(url)
  }
}
