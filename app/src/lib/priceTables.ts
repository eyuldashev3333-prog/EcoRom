// Таблицы «Все прайсы» (как в WinStudio): какие колонки есть у каждого раздела каталога и где они хранятся.
// where: 'price' — поле catalog_items.price, 'param' — ключ в catalog_items.params. Те же ключи читает quote.ts.
// Колонки шпросов, штульпа, направляющих и механики «раздвижной вертикальный/штульповый» не заведены: в ECOROM нет таких типов окон.

export type Unit = 'm' | 'm2' | 'pcs'
export interface Col {
  key: string
  label: string
  unit: Unit
  where: 'price' | 'param'
  type?: 'num' | 'basis' | 'hex'
}
export interface PriceTable {
  kind: string
  title: string
  nameLabel: string
  unit: Unit // единица новой строки
  cols: Col[]
}

const p = (key: string, label: string, unit: Unit): Col => ({ key, label, unit, where: 'param' })

export const BASIS: [string, string][] = [
  ['', 'birlik bo‘yicha'],
  ['pcs', 'dona'],
  ['m2', 'm²'],
  ['perimeter', 'perimetr'],
  ['width', 'kenglik'],
  ['height', 'balandlik'],
]

export const TABLES: PriceTable[] = [
  {
    kind: 'system',
    title: 'Oyna tizimlari',
    nameLabel: 'Tizim',
    unit: 'm',
    cols: [
      p('frame', 'Karkas profili', 'm'),
      p('impost', 'Impost profili', 'm'),
      p('sash', 'Tavaqa profili', 'm'),
      p('door_sash', 'Eshik tavaqasi profili', 'm'),
      p('sandwich', 'Sendvich panel', 'm2'),
      p('bead', 'Shtapik', 'm'),
      p('gasket', 'Zichlagich (rezina)', 'm'),
      p('armor_frame', 'Armatura karkas', 'm'),
      p('armor_impost', 'Armatura impost', 'm'),
      p('armor_sash', 'Armatura tavaqa', 'm'),
      p('armor_door', 'Armatura eshik', 'm'),
      p('mech_tt', 'Mexanika: ochiladi + qiya', 'pcs'),
      p('mech_h', 'Mexanika: ochiladi (gorizontal)', 'pcs'),
      p('mech_v', 'Mexanika: qiya (vertikal)', 'pcs'),
      p('mech_slide', 'Mexanika: suriladigan', 'pcs'),
      p('corner_frame', 'Burchak kuchaytirgich: rama', 'pcs'),
      p('corner_sash', 'Burchak kuchaytirgich: tavaqa', 'pcs'),
      p('connector', 'Impost konnektori', 'pcs'),
      p('support', 'Tayanch profil', 'm'),
      p('threshold', 'Bo‘sag‘a', 'm'),
      p('corner', 'Burchak peshtoq', 'm'),
      p('connect', 'Ulovchi profil', 'm'),
      p('connect90', 'Ulovchi profil 90°', 'm'),
      p('connect135', 'Ulovchi profil 135°', 'm'),
      p('nashelnik', 'Nashelnik', 'm'),
      p('dobor15', 'Dobor 15 mm', 'm'),
      p('dobor20', 'Dobor 20 mm', 'm'),
      p('dobor40', 'Dobor 40 mm', 'm'),
      p('dobor60', 'Dobor 60 mm', 'm'),
      p('dobor80', 'Dobor 80 mm', 'm'),
      p('dobor100', 'Dobor 100 mm', 'm'),
    ],
  },
  {
    kind: 'glass',
    title: 'Oynapaketlar',
    nameLabel: 'Turi',
    unit: 'm2',
    cols: [
      { key: 'price', label: 'Narx (tarkib bo‘sh bo‘lsa)', unit: 'm2', where: 'price' },
      p('glass1', 'Oyna 1', 'm2'),
      p('glass2', 'Oyna 2', 'm2'),
      p('glass3', 'Oyna 3', 'm2'),
      p('film', 'Plyonka', 'm2'),
      p('spacer', 'Spreyser', 'm'),
      p('desiccant', 'Quritgich', 'm'),
      p('butyl', 'Butil lenta', 'm'),
      p('sealant', 'Germetik', 'm'),
      p('gas', 'Gaz', 'm2'),
    ],
  },
  { kind: 'ebb', title: 'Otlivlar', nameLabel: 'Turi', unit: 'm', cols: [{ key: 'price', label: 'Otliv', unit: 'm', where: 'price' }, p('side_cap', 'Yon zaglushka', 'pcs')] },
  { kind: 'sill', title: 'Podokonniklar', nameLabel: 'Turi', unit: 'm', cols: [{ key: 'price', label: 'Podokonnik', unit: 'm', where: 'price' }, p('side_cap', 'Yon zaglushka', 'pcs')] },
  {
    kind: 'hardware',
    title: 'Furnitura',
    nameLabel: 'Marka',
    unit: 'pcs',
    cols: [{ key: 'price', label: 'Komplekt (1 tavaqa)', unit: 'pcs', where: 'price' }, p('handle_simple', 'Oddiy ruchka', 'pcs'), p('handle_balcony', 'Balkon ruchkasi', 'pcs')],
  },
  { kind: 'misc', title: 'Boshqa', nameLabel: 'Qo‘shimcha', unit: 'pcs', cols: [{ key: 'price', label: 'Narx', unit: 'pcs', where: 'price' }, { key: 'basis', label: 'Hisoblash', unit: 'pcs', where: 'param', type: 'basis' }] },
  { kind: 'work', title: 'Ishlar', nameLabel: 'Ish', unit: 'pcs', cols: [{ key: 'price', label: 'Narx', unit: 'pcs', where: 'price' }, { key: 'basis', label: 'Hisoblash', unit: 'pcs', where: 'param', type: 'basis' }] },
  {
    kind: 'net',
    title: "Pashsha to'rlari",
    nameLabel: "To'r tizimi",
    unit: 'm2',
    cols: [{ key: 'price', label: "To'r", unit: 'm2', where: 'price' }, p('profile', 'Profil', 'm'), p('gasket', 'Zichlagich', 'm'), p('corner', 'Burchak', 'pcs'), p('holder', 'Ushlagich', 'pcs'), p('pull', 'Ruchka-petelka', 'pcs')],
  },
  { kind: 'lamination', title: 'Laminatsiya', nameLabel: 'Turi', unit: 'm2', cols: [{ key: 'price', label: 'Laminatsiya', unit: 'm2', where: 'price' }] },
  { kind: 'color', title: 'Ranglar', nameLabel: 'Rang nomi', unit: 'pcs', cols: [{ key: 'hex', label: 'Rang', unit: 'pcs', where: 'param', type: 'hex' }, { key: 'price', label: 'Narx', unit: 'pcs', where: 'price' }] },
]

/** название новой строки; пока оно не изменено, добавлять ещё строки нельзя (как «new_… переименуйте» в WinStudio) */
export const newName = (kind: string) => `new_${kind}`
export const isPlaceholder = (name: string) => /^new_[a-z]+$/.test(name.trim())
