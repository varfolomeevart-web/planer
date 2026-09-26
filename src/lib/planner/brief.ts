import type { Floor, MaterialSpec, PlannerDoc, PlannerObject } from './types'
import { DOOR_OPEN_TYPES, MATERIAL_KINDS, STAIRS_KINDS, ascentWorldName, ceilingH } from './types'
import { isDoorWindowPreset } from './presets'
import { objectHeightCm } from './view3d'

/**
 * Автотекстовый бриф для 3D-визуализатора: генерируется из структурированных
 * данных проекта при экспорте JSON (поле brief в SaveFile) и кнопкой «ТЗ».
 * Разделы: геометрия этажа (потолки/проёмы/перепады уровней),
 * мебель с размерами и высотами, МАТЕРИАЛЫ И ТЕКСТУРЫ, ОСВЕЩЕНИЕ, РАКУРСЫ.
 */

const MAT = (k: string): string => MATERIAL_KINDS.find((m) => m.id === k)?.name ?? 'другое'

/** «Покраска — матовая, HEX: #E0E0E0» */
function matStr(m?: MaterialSpec): string | null {
  if (!m) return null
  const parts: string[] = [MAT(m.kind)]
  if (m.desc) parts.push(m.desc)
  if (m.color) parts.push(`HEX: ${m.color.toUpperCase()}`)
  return parts.join(', ')
}

/** Каталожные названия «Клён» содержат цену — срезаем её для ТЗ: «Стол … · HICOLD … · 96 752 ₽» → «Стол … · HICOLD …» */
function cleanName(name: string): string {
  return name.replace(/\s*·\s*[\d\s]+\s*₽[^·]*$/, '').trim()
}

function isWindow(o: PlannerObject): boolean {
  return o.presetId.startsWith('window')
}

function isDoor(o: PlannerObject): boolean {
  return isDoorWindowPreset(o.presetId) && !isWindow(o)
}

function isStairs(o: PlannerObject): boolean {
  return o.presetId.startsWith('stairs') || o.showNext === true
}

function objLine(o: PlannerObject): string {
  const parts: string[] = []
  const name = cleanName(o.model ? `${o.name} (${o.model})` : o.name)
  parts.push(name)
  parts.push(`${Math.round(o.w)}×${Math.round(o.h)}×${Math.round(objectHeightCm(o))} см`)
  parts.push(`позиция (${Math.round(o.x)}; ${Math.round(o.y)}) см, поворот ${Math.round(o.angle)}°`)
  if (o.material) parts.push(`материал: ${matStr(o.material)}`)
  return `    — ${parts.join(', ')}`
}

/* ---------- Раздел «МАТЕРИАЛЫ И ТЕКСТУРЫ» ---------- */

function materialsBrief(f: Floor): string[] {
  const lines: string[] = []
  const push = (label: string, m?: MaterialSpec) => {
    const s = matStr(m)
    if (s) lines.push(`    — ${label}: ${s}.`)
  }
  push('Пол', f.floorMaterial)
  push('Стены', f.wallMaterial)
  push('Потолок', f.ceilingMaterial)

  // Мебель и оборудование: группируем одинаковые материалы, чтобы не повторять «нержавейка» 10 раз
  const furniture = f.objects.filter((o) => !isDoorWindowPreset(o.presetId) && !isStairs(o))
  const byMat = new Map<string, string[]>()
  for (const o of furniture) {
    if (!o.material) continue
    const key = matStr(o.material) ?? ''
    if (!key) continue
    const list = byMat.get(key) ?? []
    list.push(cleanName(o.name))
    byMat.set(key, list)
  }
  for (const [mat, names] of byMat) {
    const shown = names.slice(0, 4).join(', ')
    const more = names.length > 4 ? ` и ещё ${names.length - 4}` : ''
    lines.push(`    — Оборудование/мебель — ${mat} (${shown}${more}).`)
  }

  // Лестница: ступени и перила
  for (const o of f.objects) {
    if (!isStairs(o)) continue
    const st = o.stairs
    if (!st) continue
    const parts: string[] = []
    if (st.material) parts.push(`ступени — ${st.material}`)
    if (st.desc) parts.push(st.desc)
    if (parts.length > 0) lines.push(`    — Лестница: ${parts.join(', ')}.`)
  }
  return lines
}

/* ---------- Раздел «ОСВЕЩЕНИЕ» ---------- */

function lightingBrief(f: Floor): string[] {
  const notes = (f.lightingNotes ?? '').trim()
  if (!notes) return []
  return notes
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `    — ${l.replace(/^[-—•]\s*/, '')}`)
}

/* ---------- Раздел «РАКУРСЫ» ---------- */

function viewsBrief(f: Floor): string[] {
  const views = f.views ?? []
  if (views.length === 0) return []
  const lines: string[] = []
  views.forEach((v, i) => {
    lines.push(`    ${i + 1}. ${v.name}${v.desc ? ` — ${v.desc}` : ''}.`)
  })
  return lines
}

/* ---------- Геометрия этажа ---------- */

function floorBrief(f: Floor, idx: number): string {
  const lines: string[] = []
  const ceil = ceilingH(f)
  lines.push(`ЭТАЖ ${idx + 1} — «${f.name}»`)

  // Потолок и перепады уровней
  lines.push(`  Высота потолка: ${ceil} см (${(ceil / 100).toFixed(2).replace('.', ',')} м).`)
  if (f.levelNotes) lines.push(`  Перепады уровней пола/потолка: ${f.levelNotes}`)

  // Проёмы
  const windows = f.objects.filter(isWindow)
  const doors = f.objects.filter(isDoor)
  if (windows.length > 0) {
    lines.push(`  Окна (${windows.length} шт.):`)
    for (const o of windows) {
      const sill = o.opening?.sillCm
      const sillStr = sill !== undefined ? `, подоконник на высоте ${Math.round(sill)} см от пола` : ''
      const od = o.opening?.desc
      lines.push(`    — ${o.name}: ${Math.round(o.w)}×${Math.round(objectHeightCm(o))} см, позиция (${Math.round(o.x)}; ${Math.round(o.y)}) см, поворот ${Math.round(o.angle)}°${sillStr}${od ? `. ${od}` : ''}`)
    }
  } else {
    lines.push('  Окна: не размещены на плане (см. примечания — если остекление есть, укажите его расположение текстом).')
  }
  if (doors.length > 0) {
    lines.push(`  Двери (${doors.length} шт.):`)
    for (const o of doors) {
      const ot = o.opening?.openType ? DOOR_OPEN_TYPES.find((t) => t.id === o.opening?.openType)?.name.toLowerCase() : null
      const od = o.opening?.desc
      lines.push(`    — ${o.name}: ${Math.round(o.w)}×${Math.round(objectHeightCm(o))} см, позиция (${Math.round(o.x)}; ${Math.round(o.y)}) см, поворот ${Math.round(o.angle)}°${ot ? `, тип открывания: ${ot}` : ''}${od ? `. ${od}` : ''}`)
    }
  }

  // Лестницы
  const stairs = f.objects.filter(isStairs)
  for (const o of stairs) {
    const st = o.stairs
    const kindName = st ? STAIRS_KINDS.find((k) => k.id === st.kind)?.name.toLowerCase() ?? 'маршевая' : 'маршевая'
    const steps = st?.steps ? `${st.steps} ступеней` : 'число ступеней не указано'
    const mat = st?.material ? `, материал ступеней: ${st.material}` : ''
    lines.push(`  Лестница: ${kindName}, ${steps}, подъём ${ascentWorldName(o)}${mat}. Габарит ${Math.round(o.w)}×${Math.round(o.h)}×${Math.round(objectHeightCm(o))} см, позиция (${Math.round(o.x)}; ${Math.round(o.y)}) см.`)
  }

  // Мебель и оборудование
  const furniture = f.objects.filter((o) => !isDoorWindowPreset(o.presetId) && !isStairs(o))
  if (furniture.length > 0) {
    lines.push(`  Мебель и оборудование (${furniture.length} шт.):`)
    for (const o of furniture) lines.push(objLine(o))
  }

  // Материалы и текстуры
  const mats = materialsBrief(f)
  if (mats.length > 0) {
    lines.push('')
    lines.push('  МАТЕРИАЛЫ И ТЕКСТУРЫ:')
    lines.push(...mats)
  }

  // Освещение
  const light = lightingBrief(f)
  if (light.length > 0) {
    lines.push('')
    lines.push('  ОСВЕЩЕНИЕ:')
    lines.push(...light)
  }

  // Ракурсы
  const views = viewsBrief(f)
  if (views.length > 0) {
    lines.push('')
    lines.push('  РАКУРСЫ (приоритетные точки обзора):')
    lines.push(...views)
  }

  if (f.renderNotes) lines.push(`  Примечания: ${f.renderNotes}`)
  return lines.join('\n')
}

/** Полный текстовый бриф по всему проекту (для передачи 3D-визуализатору) */
export function buildRenderBrief(doc: PlannerDoc): string {
  const head = [
    'ТЕХНИЧЕСКОЕ ЗАДАНИЕ ДЛЯ 3D-ВИЗУАЛИЗАЦИИ (автогенерация из планировщика)',
    `Дата: ${new Date().toLocaleDateString('ru-RU')}`,
    '',
  ]
  const floors = doc.floors.map((f, i) => floorBrief(f, i))
  return [...head, ...floors, ''].join('\n')
}
