import type { Dimension, Floor, LayerVis, MaterialSpec, OpeningSpec, PlannerDoc, PlannerObject, Partition, Pt, StairsSpec, Underlay } from './types'
import { DEFAULT_LAYERS, DEFAULT_GRID_STEP, ENG_COLORS, MAX_FLOORS, emptyFloor, uid } from './types'

/** Старая палитра инженерии (до цветового разделения по слоям) — при загрузке заменяется на цвет слоя */
const OLD_ENG_COLORS = new Set(['#e3e6e8', '#cbdde8', '#d8cbb6', '#f0e8c8', '#f5efd8'])

const MATERIAL_KIND_SET = new Set([
  'paint', 'tile', 'porcelain', 'wood', 'laminate', 'metal', 'concrete', 'brick', 'stone', 'plaster', 'carpet', 'fabric', 'glass', 'other',
])
const DOOR_OPEN_SET = new Set(['swing-left', 'swing-right', 'double', 'sliding', 'folding', 'fixed'])
const STAIRS_KIND_SET = new Set(['straight', 'l-shaped', 'spiral'])
const STAIRS_ASCENT_SET = new Set(['top', 'right', 'bottom', 'left'])

function hexColor(v: unknown): string | null {
  const s = str(v)
  return s && /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null
}

function materialOf(v: unknown): MaterialSpec | undefined {
  if (!isObj(v)) return undefined
  const kind = str(v.kind)
  if (!kind || !MATERIAL_KIND_SET.has(kind)) return undefined
  const out: MaterialSpec = { kind: kind as MaterialSpec['kind'] }
  const desc = str(v.desc)
  if (desc) out.desc = desc
  const color = hexColor(v.color)
  if (color) out.color = color
  return out
}

function openingOf(v: unknown): OpeningSpec | undefined {
  if (!isObj(v)) return undefined
  const out: OpeningSpec = {}
  const sill = num(v.sillCm)
  if (sill !== null) out.sillCm = Math.max(0, Math.min(sill, 300))
  const openType = str(v.openType)
  if (openType && DOOR_OPEN_SET.has(openType)) out.openType = openType as OpeningSpec['openType']
  const desc = str(v.desc)
  if (desc) out.desc = desc
  return out.sillCm !== undefined || out.openType !== undefined || out.desc !== undefined ? out : undefined
}

function stairsOf(v: unknown): StairsSpec | undefined {
  if (!isObj(v)) return undefined
  const kind = str(v.kind)
  const steps = num(v.steps)
  const ascent = str(v.ascent)
  if (!kind || !STAIRS_KIND_SET.has(kind) || steps === null || !ascent || !STAIRS_ASCENT_SET.has(ascent)) return undefined
  const out: StairsSpec = {
    kind: kind as StairsSpec['kind'],
    steps: Math.max(1, Math.min(Math.round(steps), 100)),
    ascent: ascent as StairsSpec['ascent'],
  }
  const material = str(v.material)
  if (material) out.material = material
  const desc = str(v.desc)
  if (desc) out.desc = desc
  return out
}

/**
 * Универсальная миграция сохранений.
 * Принимает все форматы, которые когда-либо писало приложение:
 *  - v2: {version, doc: {floors, currentFloorId, gridStep, layers}, showGrid}
 *  - v1 многоэтажный: {version, doc: {floors: [...], currentFloorId, ...}, showGrid}
 *  - v1 одноэтажный:  {version, doc: {room, objects, partitions, underlay, gridStep}, showGrid}
 *  - «сырой» документ без обёртки SaveFile
 * Неизвестные поля объектов сохраняются (без потери данных при круговом импорте).
 */

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function ptOf(v: unknown): Pt | null {
  if (!isObj(v)) return null
  const x = num(v.x)
  const y = num(v.y)
  return x === null || y === null ? null : { x, y }
}

function ptsOf(v: unknown): Pt[] | null {
  if (!Array.isArray(v)) return null
  const pts = v.map(ptOf)
  if (pts.some((p) => p === null)) return null
  return pts as Pt[]
}

function objOf(v: unknown): PlannerObject | null {
  if (!isObj(v)) return null
  const x = num(v.x)
  const y = num(v.y)
  const w = num(v.w)
  const h = num(v.h)
  if (x === null || y === null || w === null || h === null) return null
  const layerRaw = str(v.layer)
  const layer: PlannerObject['layer'] =
    layerRaw === 'vent' || layerRaw === 'water' || layerRaw === 'electric' || layerRaw === 'furniture' ? layerRaw : 'furniture'
  // сохраняем и неизвестные поля (совместимость с будущими/старыми версиями)
  const out: Record<string, unknown> = { ...v }
  out.id = str(v.id) ?? uid()
  out.presetId = str(v.presetId) ?? 'custom'
  out.name = str(v.name) ?? 'Объект'
  out.x = x
  out.y = y
  out.w = Math.max(1, Math.min(w, 100000))
  out.h = Math.max(1, Math.min(h, 100000))
  out.angle = num(v.angle) ?? 0
  const colorStr = (str(v.color) ?? '#EDE3D3').toLowerCase()
  // инженерные объекты из старых сохранений перекрашиваем в цвет их слоя
  out.color = layer !== 'furniture' && OLD_ENG_COLORS.has(colorStr) ? ENG_COLORS[layer].fill : colorStr
  out.layer = layer
  if (typeof v.flip === 'boolean') out.flip = v.flip
  if (typeof v.showNext === 'boolean') out.showNext = v.showNext
  // спецификация для 3D-рендера (v3): высота, модель, материал, проёмы, лестницы
  const hCm = num(v.heightCm)
  if (hCm !== null) out.heightCm = Math.max(1, Math.min(hCm, 1200))
  const model = str(v.model)
  if (model) out.model = model
  const mat = materialOf(v.material)
  if (mat) out.material = mat
  const opening = openingOf(v.opening)
  if (opening) out.opening = opening
  const stairs = stairsOf(v.stairs)
  if (stairs) out.stairs = stairs
  return out as unknown as PlannerObject
}

function partitionOf(v: unknown): Partition | null {
  if (!isObj(v)) return null
  const pts = ptsOf(v.pts)
  if (!pts || pts.length < 2) return null
  return { id: str(v.id) ?? uid(), pts }
}

function dimensionOf(v: unknown): Dimension | null {
  if (!isObj(v)) return null
  const a = ptOf(v.a)
  const b = ptOf(v.b)
  return a && b ? { id: str(v.id) ?? uid(), a, b } : null
}

function underlayOf(v: unknown): Underlay | null {
  if (!isObj(v)) return null
  const src = str(v.src)
  if (!src || !src.startsWith('data:image/')) return null
  const w = num(v.w)
  const h = num(v.h)
  if (w === null || h === null || w < 1 || h < 1) return null
  const opacity = num(v.opacity)
  return {
    src,
    imgW: num(v.imgW) ?? w,
    imgH: num(v.imgH) ?? h,
    x: num(v.x) ?? 0,
    y: num(v.y) ?? 0,
    w: Math.min(w, 100000),
    h: Math.min(h, 100000),
    angle: num(v.angle) ?? 0,
    opacity: opacity === null ? 0.55 : Math.max(0.05, Math.min(1, opacity)),
    visible: v.visible !== false,
  }
}

function floorOf(v: unknown, idx: number): Floor {
  const f = emptyFloor(str(isObj(v) ? v.name : null) ?? `Этаж ${idx + 1}`)
  if (!isObj(v)) return f
  // сохраняем исходный id этажа (важно для currentFloorId)
  const id = str(v.id)
  if (id) f.id = id
  const room = ptsOf(v.room)
  f.room = room && room.length >= 3 ? room : null
  const partsRaw = Array.isArray(v.partitions) ? v.partitions : Array.isArray(v.walls) ? v.walls : []
  f.partitions = partsRaw.map(partitionOf).filter((p): p is Partition => p !== null)
  f.objects = (Array.isArray(v.objects) ? v.objects : []).map(objOf).filter((o): o is PlannerObject => o !== null)
  f.dimensions = (Array.isArray(v.dimensions) ? v.dimensions : []).map(dimensionOf).filter((d): d is Dimension => d !== null)
  f.underlay = underlayOf(v.underlay)
  // спецификация для 3D-рендера (v3): потолок, материалы, перепады уровней, описание
  const ceil = num(v.ceilingHeightCm)
  if (ceil !== null) f.ceilingHeightCm = Math.max(100, Math.min(ceil, 1000))
  const fm = materialOf(v.floorMaterial)
  if (fm) f.floorMaterial = fm
  const wm = materialOf(v.wallMaterial)
  if (wm) f.wallMaterial = wm
  const cm = materialOf(v.ceilingMaterial)
  if (cm) f.ceilingMaterial = cm
  const ln = str(v.levelNotes)
  if (ln) f.levelNotes = ln
  const rn = str(v.renderNotes)
  if (rn) f.renderNotes = rn
  return f
}

function layersOf(raw: Record<string, unknown>): LayerVis {
  const l = isObj(raw.layers) ? raw.layers : {}
  const pick = (key: string, alt: string): boolean => {
    if (typeof l[key] === 'boolean') return l[key]
    if (typeof raw[alt] === 'boolean') return raw[alt] as boolean
    return DEFAULT_LAYERS[key as keyof LayerVis]
  }
  return {
    furniture: pick('furniture', 'furnitureVisible'),
    vent: pick('vent', 'ventVisible'),
    water: pick('water', 'waterVisible'),
    electric: pick('electric', 'electricVisible'),
  }
}

/** Нормализация любого поддерживаемого формата проекта. Возвращает null, если данные вовсе не похожи на проект. */
export function normalizeDoc(raw: unknown): PlannerDoc | null {
  if (!isObj(raw)) return null

  // обёртка SaveFile {version, doc, showGrid}
  let data: Record<string, unknown> = raw
  if (isObj(raw.doc)) data = raw.doc

  const gridStep = num(data.gridStep) && (data.gridStep as number) > 0 ? (data.gridStep as number) : DEFAULT_GRID_STEP
  const layers = layersOf(data)

  let floors: Floor[] = []
  if (Array.isArray(data.floors) && data.floors.length > 0) {
    floors = data.floors.slice(0, MAX_FLOORS).map((f, i) => floorOf(f, i))
  } else if (data.room !== undefined || data.objects !== undefined || data.partitions !== undefined || data.underlay !== undefined) {
    // одноэтажный формат
    floors = [floorOf(data, 0)]
  } else {
    return null
  }

  // размеры на верхнем уровне (старые версии) — переносим на первый этаж
  if (Array.isArray(data.dimensions) && floors[0].dimensions.length === 0) {
    floors[0].dimensions = data.dimensions.map(dimensionOf).filter((d): d is Dimension => d !== null)
  }

  const cur = str(data.currentFloorId)
  const currentFloorId = cur && floors.some((f) => f.id === cur) ? cur : floors[0].id

  return { floors, currentFloorId, gridStep, layers }
}
