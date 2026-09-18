export interface Preset {
  id: string
  name: string
  category: string
  /** размеры по умолчанию, см */
  w: number
  h: number
  color: string
}

export const CATEGORIES = [
  { id: 'living', name: 'Гостиная' },
  { id: 'bedroom', name: 'Спальня' },
  { id: 'kitchen', name: 'Кухня' },
  { id: 'bath', name: 'Санузел' },
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
  // Санузел
  { id: 'bathtub', name: 'Ванна', category: 'bath', w: 170, h: 75, color: '#F0EEE8' },
  { id: 'shower', name: 'Душевая кабина', category: 'bath', w: 90, h: 90, color: '#D8E2E0' },
  { id: 'toilet', name: 'Унитаз', category: 'bath', w: 40, h: 65, color: '#F0EEE8' },
  { id: 'washbasin', name: 'Раковина', category: 'bath', w: 60, h: 45, color: '#F0EEE8' },
  { id: 'washer', name: 'Стиральная машина', category: 'bath', w: 60, h: 60, color: '#D8D5D0' },
  // Разное
  { id: 'plant', name: 'Растение', category: 'misc', w: 40, h: 40, color: '#C7D2BB' },
  { id: 'custom', name: 'Свой объект', category: 'misc', w: 100, h: 80, color: '#EDE3D3' },
]

export function getPreset(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[PRESETS.length - 1]
}
