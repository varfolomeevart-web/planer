export interface Pt {
  x: number
  y: number
}

/** Внутренняя стена-перегородка: полилиния в сантиметрах */
export interface Partition {
  id: string
  /** точки полилинии, см (минимум 2) */
  pts: Pt[]
}

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

export interface PlannerDoc {
  room: Pt[] | null
  /** внутренние стены-перегородки */
  partitions: Partition[]
  objects: PlannerObject[]
  underlay: Underlay | null
  gridStep: number
}

export interface View {
  /** пикселей на см */
  scale: number
  ox: number
  oy: number
}

export const DEFAULT_DOC: PlannerDoc = {
  room: null,
  partitions: [],
  objects: [],
  underlay: null,
  gridStep: 25,
}

export const GRID_STEPS = [10, 25, 50, 100]

export const OBJECT_COLORS = [
  '#EDE3D3',
  '#DDBB8B',
  '#E5B49B',
  '#C7D2BB',
  '#D8D5D0',
  '#C9A87E',
]

export function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
}
