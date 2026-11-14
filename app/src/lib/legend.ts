import { DOBOR, SIDES, selList, type CatalogItem, type ItemOptions, type Side } from './quote'

const SIDE_LABEL: Record<Side, string> = { l: 'chap', t: 'yuqori', r: "o'ng", b: 'past' }
const sidesText = (s?: Side[]) => SIDES.filter((x) => s?.includes(x)).map((x) => SIDE_LABEL[x]).join(', ')

// Список выбранных опций позиции — подпись на чертеже в режиме «Nazorat» (контроль) и в PDF «с подробностями».
export function optionLegend(o: ItemOptions, byId: Map<string, CatalogItem>, schemeName?: (id: string) => string | undefined): string[] {
  const name = (id?: string) => (id ? byId.get(id)?.name : undefined)
  const out: string[] = []
  const add = (label: string, v?: string) => v && out.push(`${label}: ${v}`)
  if (o.own_price) out.push(`O'z narxi: ${o.own_price}`)
  if (o.scheme) out.push(`Sxema: ${schemeName?.(o.scheme) ?? o.scheme}`)
  add('Tizim', name(o.system))
  add('Oyna paket', name(o.glass))
  add('Rang', name(o.color))
  add('Laminatsiya', name(o.lamination))
  add('Laminatsiya ichki', name(o.lamination_in))
  add('Laminatsiya tashqi', name(o.lamination_out))
  add('Furnitura', name(o.hardware))
  add('Eshik furn.', name(o.door_hardware))
  add('Pashsha to‘ri', name(o.net))
  for (const e of selList(o, 'ebb')) add('Quyma', name(e.id))
  for (const s of selList(o, 'sill')) add('Deraza tokchasi', name(s.id))
  for (const id of o.misc ?? []) add('Boshqa', name(id))
  for (const id of o.works ?? []) add('Ish', name(id))
  for (const e of o.extras ?? []) add('Qo‘shimcha', name(e.id))
  const sd = o.sides
  if (sd) {
    if (sd.support) out.push('Tayanch profil')
    if (sd.threshold) out.push("Bo'sag'a")
    if (sd.corner) out.push('Burchak peshtoq')
    for (const [k, label] of [['connect', 'Ulovchi'], ['connect90', 'Ulovchi 90°'], ['connect135', 'Ulovchi 135°'], ['nashelnik', 'Nashelnik']] as const) {
      const t = sidesText(sd[k])
      if (t) out.push(`${label}: ${t}`)
    }
    for (const d of DOBOR) {
      const t = sidesText(sd.dobor?.[d])
      if (t) out.push(`Dobor ${d}: ${t}`)
    }
  }
  return out
}
