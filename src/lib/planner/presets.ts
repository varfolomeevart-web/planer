import { ENG_COLORS, type ObjLayer, type OpeningSpec, type StairsSpec } from './types'
import { KLEN_PRESETS } from './klen-presets'

export interface Preset {
  id: string
  name: string
  category: string
  /** размеры по умолчанию, см */
  w: number
  h: number
  color: string
  /** инженерный слой */
  layer?: ObjLayer
  /** лестница: пунктир на своём этаже, целиком — выше */
  showNext?: boolean
  /** картинка-схема вместо векторного глифа (раздел «Клён») */
  img?: string
  /** высота по умолчанию, см (для спецификации рендера) */
  heightCm?: number
  /** дефолтная спецификация проёма (двери/окна) */
  opening?: OpeningSpec
  /** дефолтная спецификация лестницы */
  stairs?: StairsSpec
}

export const CATEGORIES = [
  { id: 'living', name: 'Гостиная' },
  { id: 'bedroom', name: 'Спальня' },
  { id: 'kitchen', name: 'Кухня' },
  { id: 'bath', name: 'Санузел' },
  { id: 'cafe', name: 'Кафе' },
  { id: 'klen', name: 'Клён' },
  { id: 'stairs', name: 'Лестницы' },
  { id: 'doors', name: 'Двери' },
  { id: 'windows', name: 'Окна' },
  { id: 'eng', name: 'Инженерия' },
  { id: 'misc', name: 'Разное' },
] as const

export const PRESETS: Preset[] = [
  // Гостиная
  { id: 'sofa', name: 'Диван', category: 'living', w: 220, h: 90, color: '#EDE3D3' },
  { id: 'armchair', name: 'Кресло', category: 'living', w: 85, h: 85, color: '#EDE3D3' },
  { id: 'coffee_table', name: 'Журнальный столик', category: 'living', w: 110, h: 60, color: '#DDBB8B' },
  { id: 'tv_stand', name: 'ТВ-тумба', category: 'living', w: 160, h: 45, color: '#DDBB8B' },
  { id: 'bookshelf', name: 'Стеллаж', category: 'living', w: 90, h: 32, color: '#C9A87E' },
  { id: 'rug', name: 'Ковёр', category: 'living', w: 200, h: 140, color: '#E9D9C2' },
  // Спальня
  { id: 'bed_double', name: 'Кровать 2-сп.', category: 'bedroom', w: 160, h: 200, color: '#EDE3D3' },
  { id: 'bed_single', name: 'Кровать 1-сп.', category: 'bedroom', w: 90, h: 200, color: '#EDE3D3' },
  { id: 'nightstand', name: 'Тумбочка', category: 'bedroom', w: 45, h: 40, color: '#C9A87E' },
  { id: 'wardrobe', name: 'Шкаф', category: 'bedroom', w: 180, h: 60, color: '#DDBB8B' },
  { id: 'dresser', name: 'Комод', category: 'bedroom', w: 110, h: 45, color: '#C9A87E' },
  { id: 'desk', name: 'Рабочий стол', category: 'bedroom', w: 120, h: 60, color: '#DDBB8B' },
  // Кухня
  { id: 'kitchen_set', name: 'Кухонный гарнитур', category: 'kitchen', w: 240, h: 60, color: '#EDE3D3' },
  { id: 'dining_table', name: 'Обеденный стол', category: 'kitchen', w: 140, h: 80, color: '#DDBB8B' },
  { id: 'chair', name: 'Стул', category: 'kitchen', w: 45, h: 45, color: '#C9A87E' },
  { id: 'fridge', name: 'Холодильник', category: 'kitchen', w: 60, h: 65, color: '#D8D5D0' },
  { id: 'stove', name: 'Плита', category: 'kitchen', w: 60, h: 60, color: '#D8D5D0' },
  { id: 'sink_cab', name: 'Мойка', category: 'kitchen', w: 60, h: 60, color: '#D8D5D0' },
  // Кафе
  { id: 'cafe_table2', name: 'Столик на 2', category: 'cafe', w: 70, h: 70, color: '#EDE3D3' },
  { id: 'cafe_table4', name: 'Столик на 4', category: 'cafe', w: 110, h: 80, color: '#EDE3D3' },
  { id: 'bar_counter', name: 'Барная стойка', category: 'cafe', w: 220, h: 60, color: '#C9A87E' },
  { id: 'coffee_machine', name: 'Кофемашина', category: 'cafe', w: 45, h: 40, color: '#D8D5D0' },
  { id: 'cashbox', name: 'Касса', category: 'cafe', w: 80, h: 60, color: '#DDBB8B' },
  { id: 'display_fridge', name: 'Витрина', category: 'cafe', w: 120, h: 70, color: '#D8E2E0' },
  { id: 'dishwasher', name: 'Посудомоечная машина', category: 'cafe', w: 60, h: 60, color: '#D8D5D0' },
  // Лестницы
  { id: 'stairs_straight', name: 'Лестница прямая', category: 'stairs', w: 100, h: 280, color: '#EAD9B0', showNext: true, heightCm: 170, stairs: { kind: 'straight', steps: 14, ascent: 'bottom', material: 'дерево' } },
  { id: 'stairs_l', name: 'Лестница Г-обр.', category: 'stairs', w: 230, h: 250, color: '#EAD9B0', showNext: true, heightCm: 170, stairs: { kind: 'l-shaped', steps: 16, ascent: 'bottom', material: 'дерево' } },
  // Двери
  { id: 'door_single', name: 'Дверь 80 см', category: 'doors', w: 80, h: 12, color: '#F5EFE3', heightCm: 210, opening: { openType: 'swing-left' } },
  { id: 'door_double', name: 'Дверь 140 см', category: 'doors', w: 140, h: 12, color: '#F5EFE3', heightCm: 210, opening: { openType: 'double' } },
  { id: 'door_sliding', name: 'Дверь раздвижная', category: 'doors', w: 90, h: 12, color: '#F5EFE3', heightCm: 210, opening: { openType: 'sliding' } },
  // Окна
  { id: 'window_120', name: 'Окно 120 см', category: 'windows', w: 120, h: 14, color: '#D7E5EC', heightCm: 150, opening: { sillCm: 90 } },
  { id: 'window_180', name: 'Окно 180 см', category: 'windows', w: 180, h: 14, color: '#D7E5EC', heightCm: 150, opening: { sillCm: 90 } },
  // Инженерия: вентиляция — серый
  { id: 'hood', name: 'Вытяжка', category: 'eng', w: 60, h: 60, color: ENG_COLORS.vent.fill, layer: 'vent' },
  { id: 'vent_channel', name: 'Вентканал', category: 'eng', w: 40, h: 40, color: ENG_COLORS.vent.fill, layer: 'vent' },
  { id: 'vent_duct', name: 'Воздуховод', category: 'eng', w: 150, h: 25, color: ENG_COLORS.vent.fill, layer: 'vent' },
  { id: 'vent_grille', name: 'Вентрешётка', category: 'eng', w: 30, h: 12, color: ENG_COLORS.vent.fill, layer: 'vent' },
  { id: 'vent_fan', name: 'Вентилятор', category: 'eng', w: 25, h: 25, color: ENG_COLORS.vent.fill, layer: 'vent' },
  { id: 'vent_valve', name: 'Приточный клапан', category: 'eng', w: 16, h: 16, color: ENG_COLORS.vent.fill, layer: 'vent' },
  { id: 'ac_unit', name: 'Кондиционер', category: 'eng', w: 88, h: 28, color: ENG_COLORS.vent.fill, layer: 'vent' },
  // Инженерия: вода — синий
  { id: 'water_riser', name: 'Стояк воды', category: 'eng', w: 30, h: 30, color: ENG_COLORS.water.fill, layer: 'water' },
  { id: 'water_pipe', name: 'Труба воды', category: 'eng', w: 120, h: 10, color: ENG_COLORS.water.fill, layer: 'water' },
  { id: 'sewer_pipe', name: 'Канализация', category: 'eng', w: 120, h: 10, color: ENG_COLORS.water.fill, layer: 'water' },
  { id: 'water_heater', name: 'Водонагреватель', category: 'eng', w: 45, h: 45, color: ENG_COLORS.water.fill, layer: 'water' },
  { id: 'radiator', name: 'Радиатор', category: 'eng', w: 100, h: 14, color: ENG_COLORS.water.fill, layer: 'water' },
  { id: 'heated_manifold', name: 'Коллектор тёплого пола', category: 'eng', w: 35, h: 20, color: ENG_COLORS.water.fill, layer: 'water' },
  { id: 'towel_dryer', name: 'Полотенцесушитель', category: 'eng', w: 45, h: 55, color: ENG_COLORS.water.fill, layer: 'water' },
  // Инженерия: электрика — красный
  { id: 'socket', name: 'Розетка', category: 'eng', w: 16, h: 16, color: ENG_COLORS.electric.fill, layer: 'electric' },
  { id: 'socket_double', name: 'Двойная розетка', category: 'eng', w: 22, h: 16, color: ENG_COLORS.electric.fill, layer: 'electric' },
  { id: 'switch', name: 'Выключатель', category: 'eng', w: 16, h: 16, color: ENG_COLORS.electric.fill, layer: 'electric' },
  { id: 'lamp', name: 'Точечный светильник', category: 'eng', w: 36, h: 36, color: ENG_COLORS.electric.fill, layer: 'electric' },
  { id: 'chandelier', name: 'Люстра', category: 'eng', w: 60, h: 60, color: ENG_COLORS.electric.fill, layer: 'electric' },
  { id: 'wall_lamp', name: 'Бра', category: 'eng', w: 20, h: 16, color: ENG_COLORS.electric.fill, layer: 'electric' },
  { id: 'panel_el', name: 'Электрощиток', category: 'eng', w: 40, h: 60, color: ENG_COLORS.electric.fill, layer: 'electric' },
  { id: 'net_socket', name: 'ТВ/интернет-розетка', category: 'eng', w: 16, h: 16, color: ENG_COLORS.electric.fill, layer: 'electric' },
  { id: 'warm_floor', name: 'Электр. тёплый пол', category: 'eng', w: 150, h: 100, color: ENG_COLORS.electric.fill, layer: 'electric' },
  { id: 'motion_sensor', name: 'Датчик движения', category: 'eng', w: 16, h: 16, color: ENG_COLORS.electric.fill, layer: 'electric' },
  { id: 'cable_tray', name: 'Кабель-канал', category: 'eng', w: 120, h: 8, color: ENG_COLORS.electric.fill, layer: 'electric' },
  // Клён: оборудование для кафе из каталога klenmarket.ru (схемы вида сверху)
  ...KLEN_PRESETS,
  // Разное
  { id: 'plant', name: 'Растение', category: 'misc', w: 40, h: 40, color: '#C7D2BB' },
  { id: 'custom', name: 'Свой объект', category: 'misc', w: 100, h: 80, color: '#EDE3D3' },
]

/** Зелёный цвет раздела «Клён» (рамки карточек и объектов на плане) */
export const KLEN_COLOR = '#5D8A4E'

export function getPreset(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[PRESETS.length - 1]
}

/** Цветовые группы инженерных объектов (порядок совпадает с порядком в каталоге) */
export const ENG_GROUPS: { layer: Exclude<ObjLayer, 'furniture'>; name: string }[] = [
  { layer: 'vent', name: 'Вентиляция' },
  { layer: 'water', name: 'Вода' },
  { layer: 'electric', name: 'Электрика' },
]

/** Двери и окна привязываются к стенам */
export function isDoorWindowPreset(presetId: string): boolean {
  return presetId.startsWith('door') || presetId.startsWith('window')
}
