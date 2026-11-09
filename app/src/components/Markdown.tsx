import { Children, isValidElement, memo, useMemo, type ReactElement, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { Link } from 'react-router-dom'
import rehypeRaw from 'rehype-raw'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import { resolveDocLink } from '../docs'
import { CodeBlock } from './CodeBlock'

function MarkdownImpl({ source, dir }: { source: string; dir: string }) {
  // Must keep a stable identity: a new `pre` component on each render would remount (and reset) every code block.
  const components = useMemo<Components>(() => ({
    pre({ children }) {
      const child = Children.toArray(children)[0] as ReactNode
      if (!isValidElement(child)) return <pre>{children}</pre>
      const { className, children: text } = (child as ReactElement<{ className?: string; children?: ReactNode }>).props
      const lang = /language-([\w-]+)/.exec(className ?? '')?.[1] ?? ''
      return <CodeBlock code={String(text ?? '').replace(/\n$/, '')} lang={lang} />
    },
    a({ href = '', children }) {
      const route = resolveDocLink(href, dir)
      if (route) return <Link to={route}>{children}</Link>
      if (href.startsWith('#')) return <a href={href}>{children}</a>
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      )
    },
    table({ children }) {
      return (
        <div className="table-wrap">
          <table>{children}</table>
        </div>
      )
    },
  }), [dir])

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSlug]} components={components}>
      {source}
    </ReactMarkdown>
  )
}

// The source never changes while the page is open, so skip re-rendering when the page's other state (outline, scroll spy) changes.
export const Markdown = memo(MarkdownImpl)
