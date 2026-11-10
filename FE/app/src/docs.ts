// Builds the list of folders and documents from the markdown files in ../../<NN-Folder>/*.md.
// Content is loaded lazily (one request per document); titles come from the file names.

export interface DocEntry {
  slug: string
  file: string
  title: string
  load: () => Promise<string>
}

export interface FolderEntry {
  dir: string
  slug: string
  title: string
  blurb: string
  enabled: boolean
  docs: DocEntry[]
}

const modules = import.meta.glob('../../[0-9][0-9]-*/*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

/** Folders whose pages are switched on. Add a slug here when you ask for the next folder. */
export const ENABLED_FOLDERS = new Set<string>(['javascript'])

const FOLDER_META: Record<string, { title: string; blurb: string }> = {
  '00-Study-Plan': { title: 'Study Plan', blurb: 'Day-by-day schedule for the prep.' },
  '01-JavaScript': {
    title: 'JavaScript',
    blurb: 'Event loop, scope and `this`, output puzzles, polyfills, coding tasks and Q&A.',
  },
  '02-React': {
    title: 'React',
    blurb: 'Core concepts, hooks, custom hooks, machine coding, spot-the-bug, React 18/19, portals, HOCs.',
  },
  '03-TypeScript': { title: 'TypeScript', blurb: 'Types, advanced types, utility types, React typing patterns.' },
  '04-TanStack-Query': { title: 'TanStack Query', blurb: 'Server state, query keys, Suspense, prefetching.' },
  '05-Testing': { title: 'Testing', blurb: 'Jest/Vitest, React Testing Library, mocking, Playwright.' },
  '06-Build-Tools': { title: 'Build Tools', blurb: 'Babel, Webpack, Vite and how the toolchain fits together.' },
  '07-SASS-CSS': { title: 'SASS + CSS', blurb: 'SASS features, BEM, box model, stacking, grid.' },
  '08-Web-Components-Stencil-shadcn': {
    title: 'Web Components, Stencil, shadcn',
    blurb: 'Custom elements, Shadow DOM, Stencil, cva and cn.',
  },
  '09-Design-Patterns-SOLID': { title: 'Design Patterns + SOLID', blurb: 'Common patterns in code and SOLID.' },
  '10-Git-GitLab-CI': { title: 'Git + GitLab CI', blurb: 'Git commands and a production pipeline.' },
  '11-Docker': { title: 'Docker', blurb: 'Dockerfiles, runtime config and Compose.' },
  '12-Web-Fundamentals-Performance-Security': {
    title: 'Web Fundamentals',
    blurb: 'HTTP, caching, CORS, XSS/CSRF, Core Web Vitals, a11y, system design.',
  },
  '13-Behavioral-Final-Checklist': { title: 'Behavioral + Checklist', blurb: 'Stories, STAR examples and the interview-day plan.' },
}

function prettify(fileName: string): string {
  const words = fileName.replace(/^\d+-/, '').replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const byDir = new Map<string, DocEntry[]>()
for (const [path, load] of Object.entries(modules)) {
  const [, dir, file] = path.match(/\/([^/]+)\/([^/]+)\.md$/)!
  const docs = byDir.get(dir) ?? []
  docs.push({ slug: file, file, title: prettify(file), load })
  byDir.set(dir, docs)
}

export const folders: FolderEntry[] = [...byDir.keys()].sort().map((dir) => {
  const slug = dir.replace(/^\d+-/, '').toLowerCase()
  const meta = FOLDER_META[dir] ?? { title: prettify(dir), blurb: '' }
  return {
    dir,
    slug,
    title: meta.title,
    blurb: meta.blurb,
    enabled: ENABLED_FOLDERS.has(slug),
    docs: byDir.get(dir)!.sort((a, b) => a.file.localeCompare(b.file)),
  }
})

export const findFolder = (slug?: string) => folders.find((f) => f.slug === slug)
export const findDoc = (folder: FolderEntry | undefined, slug?: string) => folder?.docs.find((d) => d.slug === slug)

/** Turns a markdown link written inside a doc (`08-portals.md`, `../02-React/x.md`, `01-JavaScript/`) into an app route. */
export function resolveDocLink(href: string, currentDir: string): string | null {
  if (/^[a-z]+:/i.test(href) || href.startsWith('//')) return null
  const url = new URL(href, `file:///${currentDir}/current.md`)
  const parts = decodeURIComponent(url.pathname).split('/').filter(Boolean)
  const hash = url.hash
  const last = parts[parts.length - 1]
  if (last?.endsWith('.md')) {
    const dir = parts[parts.length - 2]
    const folder = folders.find((f) => f.dir === dir)
    const file = last.slice(0, -3)
    if (folder?.docs.some((d) => d.file === file)) return `/${folder.slug}/${file}${hash}`
    return null
  }
  const folder = folders.find((f) => f.dir === last)
  return folder ? `/${folder.slug}${hash}` : null
}
