import type { Floor, PlannerDoc, PlannerObject } from './types'
import { DOOR_OPEN_TYPES, MATERIAL_KINDS, STAIRS_KINDS, ascentWorldName, ceilingH } from './types'
import { isDoorWindowPreset } from './presets'
import { objectHeightCm } from './view3d'

/**
 * Автотекстовый бриф для 3D-визуализатора: генерируется из структурированных
 * данных проекта при экспорте JSON (поле brief в SaveFile).
 * Удовлетворяет брифу рендера: потолки/проёмы/перепады уровней,
 * расположение и размеры мебели с высотами, материалы поверхностей.
 */

const MAT = (k: string): string => MATERIAL_KINDS.find((m) => m.id === k)?.name ?? 'другое'

function matStr(m?: Floor['floorMaterial']): string | null {
  if (!m) return null
  const base = MAT(m.kind)
  return m.desc ? `${base.toLowerCase()} — ${m.desc}` : base.toLowerCase()
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
  parts.push(o.model ? `${o.name} (${o.model})` : o.name)
  parts.push(`${Math.round(o.w)}×${Math.round(o.h)}×${Math.round(objectHeightCm(o))} см`)
  parts.push(`позиция (${Math.round(o.x)}; ${Math.round(o.y)}) см, поворот ${Math.round(o.angle)}°`)
  if (o.material) parts.push(`материал: ${matStr(o.material)}`)
  return `    — ${parts.join(', ')}`
}

function floorBrief(f: Floor, idx: number): string {
  const lines: string[] = []
  const ceil = ceilingH(f)
  lines.push(`ЭТАЖ ${idx + 1} — «${f.name}»`)

  // Потолок и перепады уровней
  lines.push(`  Высота потолка: ${ceil} см (${(ceil / 100).toFixed(2).replace('.', ',')} м).`)
  if (f.levelNotes) lines.push(`  Перепады уровней пола/потолка: ${f.levelNotes}`)

  // Материалы
  const fm = matStr(f.floorMaterial)
  const wm = matStr(f.wallMaterial)
  const cm = matStr(f.ceilingMaterial)
  if (fm || wm || cm) {
    const mats: string[] = []
    if (fm) mats.push(`пол — ${fm}`)
    if (wm) mats.push(`стены — ${wm}`)
    if (cm) mats.push(`потолок — ${cm}`)
    lines.push(`  Материалы: ${mats.join('; ')}.`)
  }

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
    lines.push('  Окна: не размещены на плане.')
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
    const mat = st?.material ? `, материал: ${st.material}` : ''
    lines.push(`  Лестница: ${kindName}, ${steps}, подъём ${ascentWorldName(o)}${mat}. Габарит ${Math.round(o.w)}×${Math.round(o.h)}×${Math.round(objectHeightCm(o))} см, позиция (${Math.round(o.x)}; ${Math.round(o.y)}) см.`)
  }

  // Мебель и оборудование
  const furniture = f.objects.filter((o) => !isDoorWindowPreset(o.presetId) && !isStairs(o))
  if (furniture.length > 0) {
    lines.push(`  Мебель и оборудование (${furniture.length} шт.):`)
    for (const o of furniture) lines.push(objLine(o))
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
