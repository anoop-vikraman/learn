import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Markdown } from '../components/Markdown'
import { findDoc, findFolder } from '../docs'
import { NotFound } from './NotFound'

interface Heading {
  id: string
  text: string
  level: number
}

export function DocPage() {
  const { folder: folderSlug, doc: docSlug } = useParams()
  const { hash } = useLocation()
  const folder = findFolder(folderSlug)
  const doc = findDoc(folder, docSlug)

  const [loaded, setLoaded] = useState<{ slug: string; text: string } | null>(null)
  const [errorKey, setErrorKey] = useState('')
  const [headings, setHeadings] = useState<Heading[]>([])
  const [activeId, setActiveId] = useState('')
  const articleRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!doc) return
    let cancelled = false
    doc.load().then(
      (text) => !cancelled && setLoaded({ slug: `${folderSlug}/${doc.slug}`, text }),
      () => !cancelled && setErrorKey(`${folderSlug}/${doc.slug}`),
    )
    return () => {
      cancelled = true
    }
  }, [doc, folderSlug])

  const error = !!doc && errorKey === `${folderSlug}/${doc.slug}`
  const ready = loaded && doc && loaded.slug === `${folderSlug}/${doc.slug}`

  // After the markdown is rendered: collect headings for the outline, then scroll to a #hash or to the top.
  useEffect(() => {
    if (!ready || !articleRef.current) return
    const nodes = [...articleRef.current.querySelectorAll<HTMLHeadingElement>('h2[id], h3[id]')]
    setHeadings(nodes.map((n) => ({ id: n.id, text: n.textContent ?? '', level: Number(n.tagName[1]) })))
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [ready, hash])

  // Highlight the heading currently in view.
  useEffect(() => {
    if (!headings.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActiveId(visible[0].target.id)
      },
      { rootMargin: '-60px 0px -70% 0px' },
    )
    headings.forEach((h) => {
      const el = document.getElementById(h.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [headings])

  if (!folder || !doc) return <NotFound />
  if (!folder.enabled) {
    return (
      <div className="page">
        <h1>{folder.title}</h1>
        <p className="lead">This folder hasn't been added yet.</p>
        <Link to="/">← All folders</Link>
      </div>
    )
  }

  const index = folder.docs.indexOf(doc)
  const prev = folder.docs[index - 1]
  const next = folder.docs[index + 1]

  return (
    <div className="doc-layout">
      <article className="page doc" ref={articleRef}>
        <div className="crumbs">
          <Link to="/">Home</Link> / <Link to={`/${folder.slug}`}>{folder.title}</Link>
        </div>
        {error && <p className="warn-text">Couldn't load this document.</p>}
        {!ready && !error && <p className="muted">Loading…</p>}
        {ready && <Markdown key={loaded.slug} source={loaded.text} dir={folder.dir} />}
        {ready && (
          <nav className="pager">
            {prev ? <Link to={`/${folder.slug}/${prev.slug}`}>← {prev.title}</Link> : <span />}
            {next ? <Link to={`/${folder.slug}/${next.slug}`}>{next.title} →</Link> : <span />}
          </nav>
        )}
      </article>
      {headings.length > 1 && (
        <aside className="toc" aria-label="On this page">
          <div className="toc-title">On this page</div>
          {headings.map((h) => (
            <a key={h.id} href={`#${h.id}`} className={`lvl${h.level} ${activeId === h.id ? 'active' : ''}`}>
              {h.text}
            </a>
          ))}
        </aside>
      )}
    </div>
  )
}
