export interface Pt {
  x: number
  y: number
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

export interface PlannerDoc {
  room: Pt[] | null
  objects: PlannerObject[]
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
  objects: [],
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
