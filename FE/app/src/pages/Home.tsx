import { Link } from 'react-router-dom'
import { folders } from '../docs'

export function Home() {
  return (
    <div className="page">
      <h1>React Interview Prep</h1>
      <p className="lead">
        Read the notes, then run and edit every JavaScript snippet right on the page. Pick a folder to start.
      </p>
      <div className="cards">
        {folders.map((folder) => {
          const inner = (
            <>
              <div className="card-title">
                {folder.title}
                {!folder.enabled && <span className="tag">soon</span>}
              </div>
              <p>{folder.blurb.replace(/`/g, '')}</p>
              <div className="muted small">
                {folder.docs.length} {folder.docs.length === 1 ? 'document' : 'documents'}
              </div>
            </>
          )
          return folder.enabled ? (
            <Link key={folder.slug} to={`/${folder.slug}`} className="card">
              {inner}
            </Link>
          ) : (
            <div key={folder.slug} className="card disabled">
              {inner}
            </div>
          )
        })}
      </div>
    </div>
  )
}
