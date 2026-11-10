import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { folders } from '../docs'

type Theme = 'light' | 'dark'

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') return saved
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))] as const
}

export function Layout() {
  const [theme, toggleTheme] = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  const activeFolder = pathname.split('/')[1]

  return (
    <div className="shell">
      <header className="topbar">
        <button type="button" className="btn menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Toggle menu">
          ☰
        </button>
        <Link to="/" className="brand">
          React Interview Prep
        </Link>
        <span className="spacer" />
        <button type="button" className="btn" onClick={toggleTheme}>
          {theme === 'dark' ? '☀ Light' : '☾ Dark'}
        </button>
      </header>

      <nav className={`sidebar ${menuOpen ? 'open' : ''}`} aria-label="Documents" onClick={(e) => e.target instanceof Element && e.target.closest('a') && setMenuOpen(false)}>
        {folders.map((folder) => {
          const expanded = folder.slug === activeFolder
          return (
            <div key={folder.slug} className="nav-folder">
              <NavLink
                to={`/${folder.slug}`}
                end
                className={({ isActive }) => `nav-folder-title ${isActive ? 'active' : ''} ${folder.enabled ? '' : 'disabled'}`}
              >
                <span>{folder.title}</span>
                {!folder.enabled && <span className="tag">soon</span>}
              </NavLink>
              {expanded && folder.enabled && (
                <ul>
                  {folder.docs.map((doc) => (
                    <li key={doc.slug}>
                      <NavLink to={`/${folder.slug}/${doc.slug}`} className={({ isActive }) => (isActive ? 'active' : '')}>
                        {doc.title}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </nav>
      {menuOpen && <div className="backdrop" onClick={() => setMenuOpen(false)} />}

      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
