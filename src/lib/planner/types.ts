export interface Pt {
  x: number
  y: number
}

/** Слой объекта: мебель или инженерные сети */
export type ObjLayer = 'furniture' | 'vent' | 'water' | 'electric'

/* ---------- Спецификация для 3D-рендера: материалы, проёмы, лестницы ---------- */

/** Тип материала поверхности */
export type MaterialKind =
  | 'paint'
  | 'tile'
  | 'porcelain'
  | 'wood'
  | 'laminate'
  | 'metal'
  | 'concrete'
  | 'brick'
  | 'stone'
  | 'plaster'
  | 'carpet'
  | 'fabric'
  | 'glass'
  | 'other'

/** Человекочитаемые названия материалов (для UI и текстового брифа) */
export const MATERIAL_KINDS: { id: MaterialKind; name: string }[] = [
  { id: 'paint', name: 'Покраска' },
  { id: 'tile', name: 'Плитка' },
  { id: 'porcelain', name: 'Керамогранит' },
  { id: 'wood', name: 'Дерево (массив)' },
  { id: 'laminate', name: 'Ламинат' },
  { id: 'metal', name: 'Металл' },
  { id: 'concrete', name: 'Бетон' },
  { id: 'brick', name: 'Кирпич' },
  { id: 'stone', name: 'Камень' },
  { id: 'plaster', name: 'Штукатурка' },
  { id: 'carpet', name: 'Ковролин' },
  { id: 'fabric', name: 'Ткань' },
  { id: 'glass', name: 'Стекло' },
  { id: 'other', name: 'Другое' },
]

/** Материал поверхности: тип + уточнение (порода, фактура, размер плитки) + цвет */
export interface MaterialSpec {
  kind: MaterialKind
  /** уточнение: «дуб», «нержавеющая сталь», «матовая», «керамогранит 60×60» */
  desc?: string
  /** hex-цвет (#RRGGBB) */
  color?: string
}

/** Тип открывания двери */
export type DoorOpenType = 'swing-left' | 'swing-right' | 'double' | 'sliding' | 'folding' | 'fixed'

export const DOOR_OPEN_TYPES: { id: DoorOpenType; name: string }[] = [
  { id: 'swing-left', name: 'Распашная влево' },
  { id: 'swing-right', name: 'Распашная вправо' },
  { id: 'double', name: 'Двустворчатая' },
  { id: 'sliding', name: 'Раздвижная' },
  { id: 'folding', name: 'Складная' },
  { id: 'fixed', name: 'Не открывается' },
]

/** Спецификация проёма (дверь/окно): высоты и тип открывания.
 *  Высота проёма хранится в heightCm самого объекта (единый источник), здесь — остальное. */
export interface OpeningSpec {
  /** подоконник: от пола до низа проёма, см (окна) */
  sillCm?: number
  /** тип открывания (двери) */
  openType?: DoorOpenType
  desc?: string
}

/** Тип лестницы */
export type StairsKind = 'straight' | 'l-shaped' | 'spiral'

/** Локальный край объекта-лестницы, в сторону которого идёт подъём (до поворота angle) */
export type StairsAscent = 'top' | 'right' | 'bottom' | 'left'

/** Спецификация лестницы: тип, ступени, материал, направление подъёма */
export interface StairsSpec {
  kind: StairsKind
  /** количество ступеней */
  steps: number
  /** направление подъёма — локальный край, к которому поднимаемся */
  ascent: StairsAscent
  /** материал: «дерево (дуб)», «бетон», «металл/дерево»… */
  material?: string
  desc?: string
}

export const STAIRS_KINDS: { id: StairsKind; name: string }[] = [
  { id: 'straight', name: 'Маршевая (прямая)' },
  { id: 'l-shaped', name: 'Г-образная' },
  { id: 'spiral', name: 'Винтовая' },
]

export const STAIRS_ASCENTS: { id: StairsAscent; name: string }[] = [
  { id: 'top', name: 'Вверх плана' },
  { id: 'right', name: 'Вправо плана' },
  { id: 'bottom', name: 'Вниз плана' },
  { id: 'left', name: 'Влево плана' },
]

/* ---------- Освещение и ракурсы для 3D-визуализатора ---------- */

/** Ракурс (точка обзора) для рендера: название и уточнение (высота камеры, что в кадре) */
export interface CameraView {
  id: string
  /** напр. «Вид от входа на барную стойку» */
  name: string
  /** напр. «камера на уровне глаз 160 см, объектив 24 мм» */
  desc?: string
}

/** Быстрые шаблоны ракурсов (кнопки в панели) */
export const VIEW_PRESETS: { name: string; desc?: string }[] = [
  { name: 'Изометрия сверху' },
  { name: 'Вид от входа', desc: 'камера на уровне глаз, ~160 см' },
  { name: 'Вид из кухни на лестницу' },
  { name: 'Вид вдоль барной стойки' },
]

/** Быстрые шаблоны освещения (чипы в панели) */
export const LIGHT_PRESETS: string[] = [
  'Яркие потолочные LED-панели (нейтральный свет)',
  'Подвесные светильники над стойкой (лофт, тёплый свет)',
  'Трековые светильники на шине',
  'Подсветка рабочей зоны (LED-лента)',
  'Приглушённый диммируемый свет в зале',
]

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

  /* --- спецификация для 3D-рендера --- */
  /** высота предмета, см (переопределяет высоту пресета) */
  heightCm?: number
  /** конкретная модель/бренд, напр. «Холодильный шкаф POLAIR ШХ-0,5 ДС» */
  model?: string
  /** материал корпуса/обивки */
  material?: MaterialSpec
  /** проём: подоконник и тип открывания (двери/окна) */
  opening?: OpeningSpec
  /** лестница: тип, ступени, материал, направление подъёма */
  stairs?: StairsSpec
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

  /* --- спецификация для 3D-рендера --- */
  /** высота потолка, см (по умолчанию 270) */
  ceilingHeightCm?: number
  /** материал пола */
  floorMaterial?: MaterialSpec
  /** материал стен */
  wallMaterial?: MaterialSpec
  /** материал потолка */
  ceilingMaterial?: MaterialSpec
  /** перепады уровней пола/потолка: текст («подиум у окна +15 см, потолок в зоне кухни 250 см»…) */
  levelNotes?: string
  /** свободное описание для рендера («окна от пола», «плинтус высокий»…) */
  renderNotes?: string
  /** освещение по зонам: по строке на зону («Кухня — яркие LED-панели…») */
  lightingNotes?: string
  /** приоритетные ракурсы для рендера (2–3 точки обзора) */
  views?: CameraView[]
}

/** Высота потолка по умолчанию, см */
export const DEFAULT_CEILING_H = 270

/** Эффективная высота потолка этажа */
export function ceilingH(floor: Floor): number {
  return floor.ceilingHeightCm ?? DEFAULT_CEILING_H
}

/** Человекочитаемое название материала или «—» */
export function materialName(m?: MaterialSpec): string {
  if (!m) return '—'
  const base = MATERIAL_KINDS.find((k) => k.id === m.kind)?.name ?? 'Другое'
  return m.desc ? `${base} (${m.desc})` : base
}

/** Направление подъёма лестницы в мировых координатах плана: «на север (вверх плана)» и т.п. */
export function ascentWorldName(obj: PlannerObject): string {
  const st = obj.stairs
  if (!st) return '—'
  const local: Record<StairsAscent, [number, number]> = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }
  const [lx, ly] = local[st.ascent]
  const rad = (obj.angle * Math.PI) / 180
  const wx = lx * Math.cos(rad) - ly * Math.sin(rad)
  const wy = lx * Math.sin(rad) + ly * Math.cos(rad)
  // «север» = верх плана (−y); сектор из 8 направлений
  const names = ['север (вверх плана)', 'северо-восток', 'восток (вправо плана)', 'юго-восток', 'юг (вниз плана)', 'юго-запад', 'запад (влево плана)', 'северо-запад']
  const a = Math.atan2(wx, -wy)
  const idx = Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8
  return names[idx]
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
