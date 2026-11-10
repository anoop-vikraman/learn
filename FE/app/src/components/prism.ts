import Prism from 'prismjs'
import 'prismjs/components/prism-clike'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-scss'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-docker'
import 'prismjs/components/prism-nginx'
import 'prismjs/components/prism-diff'

const ALIASES: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  sh: 'bash',
  shell: 'bash',
  html: 'markup',
  xml: 'markup',
  dockerfile: 'docker',
  yml: 'yaml',
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function highlight(code: string, lang: string): string {
  const grammarName = ALIASES[lang] ?? lang
  const grammar = Prism.languages[grammarName]
  return grammar ? Prism.highlight(code, grammar, grammarName) : escapeHtml(code)
}
