import { useEffect, useRef, useState } from 'react'
import EditorModule from 'react-simple-code-editor'
import { runJs, RUN_TIMEOUT_MS, type LogLine } from '../runner/runJs'
import { highlight } from './prism'

// The package ships CommonJS; depending on the bundler the component is on `.default`.
const Editor = ((EditorModule as unknown as { default?: typeof EditorModule }).default ?? EditorModule) as typeof EditorModule

const RUNNABLE = new Set(['js', 'javascript'])

const LABELS: Record<string, string> = { js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', tsx: 'TSX', jsx: 'JSX' }

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="btn"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        })
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

/** Many snippets in the notes are fragments that lean on helpers defined elsewhere; explain the resulting error. */
function hintFor(lines: LogLine[]): string | null {
  for (const { level, text } of lines) {
    if (level !== 'error') continue
    const name = /ReferenceError: (\w+) is not defined/.exec(text)?.[1]
    if (!name) continue
    if (['document', 'window', 'localStorage', 'navigator', 'location', 'alert'].includes(name)) {
      return `"${name}" isn't available: snippets run in a Web Worker, which has no page or DOM. Read this one instead of running it.`
    }
    return `"${name}" is used here but defined elsewhere in the notes. Add a quick stub above (for example "const ${name} = ...") to run it.`
  }
  return null
}

type RunState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; ms: number; timedOut: boolean }

function RunnableCode({ initial, lang }: { initial: string; lang: string }) {
  const [code, setCode] = useState(initial)
  const [lines, setLines] = useState<LogLine[]>([])
  const [run, setRun] = useState<RunState>({ status: 'idle' })
  const cancelRef = useRef<(() => void) | null>(null)

  useEffect(() => () => cancelRef.current?.(), [])

  const execute = () => {
    cancelRef.current?.()
    setLines([])
    setRun({ status: 'running' })
    cancelRef.current = runJs(code, {
      onLine: (line) => setLines((prev) => [...prev, line]),
      onClear: () => setLines([]),
      onDone: ({ ms, timedOut }) => setRun({ status: 'done', ms, timedOut }),
    })
  }

  const stop = () => {
    cancelRef.current?.()
    cancelRef.current = null
    setRun({ status: 'idle' })
  }

  const modified = code !== initial
  const running = run.status === 'running'

  return (
    <div className="codeblock runnable">
      <div className="codeblock-bar">
        <span className="lang">{LABELS[lang] ?? lang} · editable</span>
        <span className="spacer" />
        {modified && (
          <button type="button" className="btn" onClick={() => setCode(initial)}>
            Reset
          </button>
        )}
        <CopyButton text={code} />
        {running ? (
          <button type="button" className="btn stop" onClick={stop}>
            ■ Stop
          </button>
        ) : (
          <button type="button" className="btn run" onClick={execute} title="Ctrl/Cmd + Enter">
            ▶ Run
          </button>
        )}
      </div>
      <div
        className="editor-wrap"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            execute()
          }
        }}
      >
        <Editor
          value={code}
          onValueChange={setCode}
          highlight={(c) => highlight(c, lang)}
          padding={14}
          tabSize={2}
          textareaClassName="editor-textarea"
          aria-label="Code editor"
          className="editor"
        />
      </div>
      {run.status !== 'idle' && (
        <div className="output" aria-live="polite">
          <div className="output-head">
            <span>Output</span>
            {run.status === 'running' && <span className="muted">running…</span>}
            {run.status === 'done' && !run.timedOut && <span className="muted">finished in {run.ms} ms</span>}
            {run.status === 'done' && run.timedOut && (
              <span className="warn-text">stopped after {RUN_TIMEOUT_MS / 1000}s (infinite loop or interval?)</span>
            )}
          </div>
          {run.status === 'done' && hintFor(lines) && <div className="hint">💡 {hintFor(lines)}</div>}
          {lines.length === 0 && run.status === 'done' ? (
            <div className="muted line">(no console output)</div>
          ) : (
            lines.map((l, i) => (
              <pre key={i} className={`line ${l.level}`}>
                {l.text}
              </pre>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function StaticCode({ code, lang }: { code: string; lang: string }) {
  return (
    <div className="codeblock">
      <div className="codeblock-bar">
        <span className="lang">{LABELS[lang] ?? (lang || 'text')}</span>
        <span className="spacer" />
        <CopyButton text={code} />
      </div>
      <pre className="static-pre">
        <code dangerouslySetInnerHTML={{ __html: highlight(code, lang) }} />
      </pre>
    </div>
  )
}

export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  return RUNNABLE.has(lang) ? <RunnableCode initial={code} lang={lang} /> : <StaticCode code={code} lang={lang} />
}
