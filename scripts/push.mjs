// Публикация проекта в GitHub одним коммитом через API (Git не нужен).
// Запуск: node scripts/push.mjs "сообщение коммита"
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' ')
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.local'), 'utf8').split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const repo = env.GITHUB_REPO
const headers = { Authorization: `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'ecorom-push', Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }
const api = async (method, path, body) => {
  const r = await fetch(`https://api.github.com/repos/${repo}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text()
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t}`)
  return t ? JSON.parse(t) : {}
}

// что публикуем (остальное — секреты, материалы клиента, план — остаётся локально)
const INCLUDE = ['.github', 'app', 'supabase', 'scripts', '.gitignore', 'README.md']
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'out']) // out = бэкапы с данными, никогда не публиковать
const SKIP_FILES = new Set(['config.local.ts'])

const files = []
const walk = (p) => {
  const st = statSync(p)
  if (st.isDirectory()) {
    for (const n of readdirSync(p)) if (!SKIP_DIRS.has(n)) walk(join(p, n))
  } else if (!SKIP_FILES.has(p.split(sep).pop())) files.push(p)
}
for (const i of INCLUDE) {
  try { walk(join(ROOT, i)) } catch { /* нет такого пути */ }
}

const message = process.argv[2] || 'update'
const ref = await api('GET', '/git/ref/heads/main')
const headSha = ref.object.sha
const head = await api('GET', `/git/commits/${headSha}`)

const tree = []
for (const f of files) {
  const buf = readFileSync(f)
  const blob = await api('POST', '/git/blobs', { content: buf.toString('base64'), encoding: 'base64' })
  tree.push({ path: relative(ROOT, f).split(sep).join('/'), mode: '100644', type: 'blob', sha: blob.sha })
}
// синхронизация удалений: что есть в репозитории (в публикуемых путях или старая заглушка), но нет локально — удалить
const base = await api('GET', `/git/trees/${head.tree.sha}?recursive=1`)
const local = new Set(tree.map((t) => t.path))
const published = (p) => INCLUDE.some((i) => p === i || p.startsWith(`${i}/`)) || p === 'index.html'
for (const entry of base.tree) {
  if (entry.type === 'blob' && published(entry.path) && !local.has(entry.path)) tree.push({ path: entry.path, mode: '100644', type: 'blob', sha: null })
}

const newTree = await api('POST', '/git/trees', { base_tree: head.tree.sha, tree })
const commit = await api('POST', '/git/commits', { message, tree: newTree.sha, parents: [headSha] })
await api('PATCH', '/git/refs/heads/main', { sha: commit.sha, force: false })
console.log(`OK ${commit.sha.slice(0, 7)} · файлов: ${files.length}`)
