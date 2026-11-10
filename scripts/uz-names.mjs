// Перевод русских названий каталога на узбекскую латиницу.
// Запуск: node scripts/uz-names.mjs         — печатает таблицу «было → стало»
//         node scripts/uz-names.mjs --sql   — пишет supabase/migrations/036_uz_names.sql
import { writeFileSync } from 'node:fs'
import { ROOT } from './env.mjs'
import { runSql } from './run-sql.mjs'

// целые названия (если слово-в-слово не подходит)
const WHOLE = {
  'Демонтаж': 'Demontaj', 'Доставка': 'Yetkazib berish', 'Монтаж в бетон': 'Betonga montaj', 'Монтаж отлива': 'Otliv montaji',
  'Монтаж подоконника': 'Podokonnik montaji', 'Монтаж порога': 'Ostona montaji', 'Отделка откосов': 'Qiyaliklarni bezash',
  'Зол-Дуб': 'Oltin eman', 'Пена монтажная': "Montaj ko'pigi", 'Комплект шурупов': 'Shuruplar komplekti', 'Подставочный профиль': 'Tayanch profil',
  'Саморез-Пена': "Samorez-ko'pik", 'Красное дерево': 'Qizil daraxt', 'Темный дуб': "To'q eman",
}
// отдельные слова
const WORD = {
  'белый': 'oq', 'белая': 'oq', 'серый': 'kulrang', 'серая': 'kulrang', 'красный': 'qizil', 'зеленый': 'yashil', 'желтый': 'sariq', 'коричневая': 'jigarrang',
  'береза': 'qayin', 'вишня': 'olcha', 'дуб': 'eman', 'клен': 'zarang', 'синий': "ko'k", 'сетка': "to'r", 'отлив': 'otliv',
  'оконный': 'deraza', 'дверной': 'eshik', 'оддий': 'oddiy', 'канотлик': 'qanotli', 'кават': 'qavat', 'один': 'bir', 'очилиш': 'ochilish',
  'сберегающий': 'tejovchi', 'все': 'barcha', 'цвета': 'ranglar', 'см': 'sm', 'монтаж': 'montaj', 'добор': 'dobor', 'откидной': 'otkidnoy', 'откид': 'otkid',
}
const T = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: "'", ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: "o'", қ: 'q', ғ: "g'", ҳ: 'h' }
const VOWELS = 'аеёиоуыэюяaeiouy'
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

function translit(word) {
  const low = word.toLowerCase()
  let out = ''
  for (let i = 0; i < low.length; i++) {
    const ch = low[i]
    if (ch === 'е' && (i === 0 || VOWELS.includes(low[i - 1]) || low[i - 1] === 'ь' || low[i - 1] === 'ъ')) { out += 'ye'; continue }
    out += T[ch] ?? ch
  }
  if (word === word.toUpperCase() && word.length > 1) return out.toUpperCase()
  return word[0] === word[0].toUpperCase() ? cap(out) : out
}
const hasCyr = (s) => /[А-Яа-яЁёЎўҚқҒғҲҳ]/.test(s)

export function uz(name) {
  if (WHOLE[name]) return WHOLE[name]
  return name.replace(/[А-Яа-яЁёЎўҚқҒғҲҳ]+/g, (w) => {
    const d = WORD[w.toLowerCase()]
    if (d) return w[0] === w[0].toUpperCase() ? cap(d) : d
    return translit(w)
  })
}

const rows = await runSql("select id, kind, name from catalog_items where name ~ '[А-Яа-яЁёЎўҚқҒғҲҳ]' order by kind, name")
const map = rows.map((r) => ({ ...r, to: uz(r.name) }))
if (map.some((m) => hasCyr(m.to))) throw new Error('осталась кириллица')
const names = new Map()
for (const m of map) { const k = m.kind + '|' + m.to; if (names.has(k)) throw new Error('дубль имени: ' + m.to); names.set(k, 1) }

if (!process.argv.includes('--sql')) {
  for (const m of map) console.log(`${m.kind.padEnd(8)} ${m.name}  →  ${m.to}`)
} else {
  const q = (s) => "'" + s.replace(/'/g, "''") + "'"
  let sql = `-- ECOROM 036: весь сайт на узбекском (латиница). Названия каталога, реквизиты компании, снимки в заказах.\n-- Сгенерировано scripts/uz-names.mjs (таблица «было → стало» — в комментариях).\n`
  for (const m of map) sql += `-- ${m.kind}: ${m.name} → ${m.to}\n`
  sql += `\n`
  for (const m of map) sql += `update public.catalog_items set name = ${q(m.to)} where id = ${q(m.id)};\n`
  // снимки: названия в расчёте позиций заказов и цвет заказа (длинные названия первыми, чтобы «Темный дуб» не сломался «Дубом»)
  const byLen = [...map].sort((a, b) => b.name.length - a.name.length)
  sql += `\n-- снимки в заказах\ndo $$ begin\n`
  for (const m of byLen) {
    sql += `  update public.order_items set calc = replace(calc::text, ${q(JSON.stringify(m.name).slice(1, -1))}, ${q(m.to)})::jsonb where calc::text like ${q('%' + JSON.stringify(m.name).slice(1, -1) + '%')};\n`
    sql += `  update public.order_items set materials = replace(materials::text, ${q(JSON.stringify(m.name).slice(1, -1))}, ${q(m.to)})::jsonb where materials::text like ${q('%' + JSON.stringify(m.name).slice(1, -1) + '%')};\n`
    sql += `  update public.orders set color = ${q(m.to)} where color = ${q(m.name)};\n`
  }
  sql += `end $$;\n`
  sql += `
-- примечания к категориям расходов
update public.expense_categories set note = case name
  when 'ISH HAQI (tarix)' then 'SAVDO jadvalidagi oylik (tizimdan oldin)'
  when 'KOCHA KIRA' then 'Yo''l kira / rejadan tashqari'
  when 'KREDIT' then 'Kredit'
  when 'KUT-HARAJAT' then 'Boshqa xarajatlar'
  when 'LABO' then 'Kichik yuk mashinasi (yuk tashish)'
  when 'MAHSULOT' then 'Mayda-chuyda: ruchka, sarf materiallari'
  when 'OFIS ARENDA' then 'Ofis / bino ijarasi'
  when 'OYNA' then 'Do''kondan shisha (SAVDO jadvalidan, tizimdan oldin)'
  when 'OYNA SINISHI' then 'Shisha sinishi, zavod to''laydi (kassadan)'
  when 'PITANIYA' then 'Ovqat (tushlik, choy)'
  when 'REKLAMA' then 'Reklama, media, mobilografiya (SAVDO jadvalidan)'
  when 'SERVIS' then 'Kafolat servisi, zavod to''laydi (kassadan)'
  when 'SOLIQ' then 'Soliqlar'
  when 'SVET' then 'Svet / kommunal'
  when 'TRANSPORT' then 'Mashina benzini/gazi, yetkazib berish'
  else note end
 where note ~ '[А-Яа-яЁё]';
-- слова для бота: на экране остаются узбекские (русские «обед», «бензин»… бот по-прежнему понимает сам, они встроены в код)
update public.expense_categories set keywords = array(select k from unnest(keywords) k where k !~ '[А-Яа-яЁё]') where keywords::text ~ '[А-Яа-яЁё]';
`
  sql += `\n-- реквизиты компании (идут в договор)\nupdate public.app_settings set value = jsonb_set(jsonb_set(value, '{address}', '"Shahrixon, Chinobod ko''chasi"'), '{executor}', '"Mahmud Muxtorjonov"') where key = 'company';\n`
  writeFileSync(ROOT + 'supabase/migrations/036_uz_names.sql', sql)
  // таблица цветов для чертежа: старое имя (нижний регистр) → новое
  console.log('COLORS ' + JSON.stringify(Object.fromEntries(map.filter((m) => m.kind === 'color').map((m) => [m.name.toLowerCase(), m.to.toLowerCase()]))))
  console.log('migration written, rows:', map.length)
}
