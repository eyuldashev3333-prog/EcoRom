// Кладёт ключи из .env.local в зашифрованные секреты GitHub Actions (значения в репозиторий не попадают).
// Запуск: node set-secrets.mjs KEY1 KEY2 ...
import sodium from 'libsodium-wrappers'
import { env } from './env.mjs'

await sodium.ready
const repo = env('GITHUB_REPO')
const headers = { Authorization: `Bearer ${env('GITHUB_TOKEN')}`, 'User-Agent': 'ecorom', Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }
const pk = await (await fetch(`https://api.github.com/repos/${repo}/actions/secrets/public-key`, { headers })).json()

for (const name of process.argv.slice(2)) {
  const value = env(name)
  if (!value) {
    console.log(`skip ${name}: пусто`)
    continue
  }
  const sealed = sodium.crypto_box_seal(sodium.from_string(value), sodium.from_base64(pk.key, sodium.base64_variants.ORIGINAL))
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/secrets/${name}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ encrypted_value: sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL), key_id: pk.key_id }),
  })
  console.log(`${name}: ${r.status === 201 || r.status === 204 ? 'OK' : r.status}`)
}
