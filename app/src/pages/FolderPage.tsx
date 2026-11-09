import { Link, useParams } from 'react-router-dom'
import { findFolder } from '../docs'
import { NotFound } from './NotFound'

export function FolderPage() {
  const { folder: folderSlug } = useParams()
  const folder = findFolder(folderSlug)
  if (!folder) return <NotFound />

  if (!folder.enabled) {
    return (
      <div className="page">
        <h1>{folder.title}</h1>
        <p className="lead">These pages haven't been added yet. Ask for this folder next and its documents will appear here.</p>
        <Link to="/">← All folders</Link>
      </div>
    )
  }

  return (
    <div className="page">
      <h1>{folder.title}</h1>
      <p className="lead">{folder.blurb.replace(/`/g, '')}</p>
      <ol className="doc-list">
        {folder.docs.map((doc, i) => (
          <li key={doc.slug}>
            <Link to={`/${folder.slug}/${doc.slug}`}>
              <span className="doc-num">{String(i + 1).padStart(2, '0')}</span>
              <span>{doc.title}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
