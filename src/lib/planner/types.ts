export interface Pt {
  x: number
  y: number
}

/** Слой объекта: мебель или инженерные сети */
export type ObjLayer = 'furniture' | 'vent' | 'water' | 'electric'

export interface PlannerObject {
  id: string
  presetId: string
  name: string
  /** координаты центра, см */
  x: number
  y: number
  /** размеры, см */
  w: number
  h: number
  /** угол поворота, градусы (по часовой) */
  angle: number
  color: string
  /** инженерный слой (по умолчанию furniture) */
  layer?: ObjLayer
  /** объект отзеркален */
  flip?: boolean
  /** лестница: на своём этаже рисуется пунктиром, на этажах выше — целиком */
  showNext?: boolean
}

/** Внутренняя стена-перегородка: полилиния в сантиметрах */
export interface Partition {
  id: string
  /** точки полилинии, см (минимум 2) */
  pts: Pt[]
}

/** Выноска-размер: отрезок с подписью длины */
export interface Dimension {
  id: string
  a: Pt
  b: Pt
}

/** Изображение-подложка (скан/фото плана) для обводки поверх него */
export interface Underlay {
  /** data URL изображения */
  src: string
  /** исходные размеры картинки в пикселях (для пропорций) */
  imgW: number
  imgH: number
  /** координаты центра на плане, см */
  x: number
  y: number
  /** размер на плане, см */
  w: number
  h: number
  /** поворот вокруг центра, градусы (по часовой) */
  angle: number
  /** прозрачность 0..1 */
  opacity: number
  visible: boolean
}

/** Этаж: стены, перегородки, объекты, размеры и подложка */
export interface Floor {
  id: string
  name: string
  room: Pt[] | null
  partitions: Partition[]
  objects: PlannerObject[]
  dimensions: Dimension[]
  underlay: Underlay | null
}

/** Видимость инженерных слоёв */
export interface LayerVis {
  furniture: boolean
  vent: boolean
  water: boolean
  electric: boolean
}

export interface PlannerDoc {
  floors: Floor[]
  currentFloorId: string
  gridStep: number
  layers: LayerVis
}

export interface View {
  /** пикселей на см */
  scale: number
  ox: number
  oy: number
}

export const MAX_FLOORS = 20

export const DEFAULT_GRID_STEP = 25

export const GRID_STEPS = [5, 10, 25, 50, 100]

export const OBJECT_COLORS = [
  '#EDE3D3',
  '#DDBB8B',
  '#E5B49B',
  '#C7D2BB',
  '#D8D5D0',
  '#C9A87E',
]

/** Цвета инженерных слоёв: вентиляция — серый, вода — синий, электрика — красный */
export const ENG_COLORS: Record<Exclude<ObjLayer, 'furniture'>, { fill: string; stroke: string }> = {
  vent: { fill: '#C6CBD1', stroke: '#6B7280' },
  water: { fill: '#A9CDEA', stroke: '#2F6DA4' },
  electric: { fill: '#EFA9A2', stroke: '#C0392B' },
}

export const LAYERS: { id: ObjLayer; name: string }[] = [
  { id: 'furniture', name: 'Мебель и стены' },
  { id: 'vent', name: 'Вытяжка и вентиляция' },
  { id: 'water', name: 'Вода и канализация' },
  { id: 'electric', name: 'Электрика' },
]

export const DEFAULT_LAYERS: LayerVis = { furniture: true, vent: true, water: true, electric: true }

let floorCounter = 0

export function emptyFloor(name?: string): Floor {
  floorCounter += 1
  return {
    id: uid(),
    name: name ?? `Этаж ${floorCounter}`,
    room: null,
    partitions: [],
    objects: [],
    dimensions: [],
    underlay: null,
  }
}

export function makeDoc(firstFloorName?: string): PlannerDoc {
  const f = emptyFloor(firstFloorName ?? 'Этаж 1')
  return { floors: [f], currentFloorId: f.id, gridStep: DEFAULT_GRID_STEP, layers: { ...DEFAULT_LAYERS } }
}

export const DEFAULT_DOC: PlannerDoc = makeDoc()

export function floorById(doc: PlannerDoc, id: string | null | undefined): Floor | null {
  return doc.floors.find((f) => f.id === id) ?? null
}

export function currentFloor(doc: PlannerDoc): Floor {
  return floorById(doc, doc.currentFloorId) ?? doc.floors[0]
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
}
