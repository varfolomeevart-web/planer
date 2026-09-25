/**
 * Индивидуальные курсоры для каждого инструмента планировщика.
 *
 * Принципы:
 * - чёрный глиф с толстой белой окантовкой — видно на любом фоне (светлом и тёмном);
 * - оранжевый (#E8730C) акцент бренда;
 * - у каждого курсора правильная горячая точка (центр перекрестья, кончик стрелки и т.д.);
 * - SVG нарисованы по путям lucide-иконок — единый стиль с тулбаром;
 * - в конце строки — fallback на системный курсор для старых браузеров.
 */

const INK = '%231F1913' // почти чёрный, тёплый
const ORANGE = '%23E8730C'

/** Кончик стрелки (выбор, наведение на сегменты) */
const ARROW_PATH =
  'M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z'

/** Перекрестье с разрывом в центре (точность CAD) */
const CROSSHAIR_HALO =
  "<g fill='none' stroke='white' stroke-width='5' stroke-linecap='round'><circle cx='12' cy='12' r='9'/><path d='M21 12h-3.5M6.5 12H3M12 21v-3.5M12 6.5V3'/></g>"
const CROSSHAIR_INK =
  "<g fill='none' stroke='" + INK + "' stroke-width='2' stroke-linecap='round'><circle cx='12' cy='12' r='9'/><path d='M21 12h-3.5M6.5 12H3M12 21v-3.5M12 6.5V3'/></g>"

/** Выбор и перемещение — классическая стрелка */
export const CURSOR_ARROW =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='" +
  ARROW_PATH +
  "' fill='white' stroke='white' stroke-width='3' stroke-linejoin='round'/><path d='" +
  ARROW_PATH +
  "' fill='" + INK + "' stroke='" + INK + "' stroke-width='1.2' stroke-linejoin='round'/></svg>\") 3 3, default"

/** Размещение пресета из каталога — стрелка с оранжевым плюсом */
export const CURSOR_PLACE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='" +
  ARROW_PATH +
  "' fill='white' stroke='white' stroke-width='3' stroke-linejoin='round'/><path d='" +
  ARROW_PATH +
  "' fill='" + INK + "' stroke='" + INK + "' stroke-width='1.2' stroke-linejoin='round'/><circle cx='17' cy='17' r='5.6' fill='" + ORANGE + "' stroke='white' stroke-width='2'/><path d='M17 14.6v4.8M14.6 17h4.8' stroke='white' stroke-width='1.8' stroke-linecap='round'/></svg>\") 3 3, crosshair"

/** Стены — перекрестье с квадратным центром (кирпич) */
export const CURSOR_WALL =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>" +
  CROSSHAIR_HALO +
  CROSSHAIR_INK +
  "<rect x='9.9' y='9.9' width='4.2' height='4.2' fill='white' stroke='" + INK + "' stroke-width='1.4'/></svg>\") 12 12, crosshair"

/** Перегородки — перекрестье с оранжевым центром */
export const CURSOR_PARTITION =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>" +
  CROSSHAIR_HALO +
  CROSSHAIR_INK +
  "<circle cx='12' cy='12' r='2.6' fill='" + ORANGE + "' stroke='white' stroke-width='1.6'/></svg>\") 12 12, crosshair"

/** Ластик — глиф стирания с оранжевой подошвой; горячая точка — нижний край */
export const CURSOR_ERASE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><g fill='none' stroke='white' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'><path d='m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21'/><path d='M22 21H7'/><path d='m5 11 9 9'/></g><g fill='none' stroke='" + INK + "' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21'/><path d='m5 11 9 9'/></g><path d='M22 21H7' stroke='" + ORANGE + "' stroke-width='2.4' stroke-linecap='round'/></svg>\") 6 20, default"

/** Рулетка — диагональная лента с оранжевыми делениями; горячая точка — угол замера */
export const CURSOR_RULER =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><g fill='none' stroke='white' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'><path d='M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.3 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z'/><path d='m14.5 12.5 2-2'/><path d='m11.5 9.5 2-2'/><path d='m8.5 6.5 2-2'/><path d='m17.5 15.5 2-2'/></g><g fill='none' stroke='" + INK + "' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.3 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z'/></g><g stroke='" + ORANGE + "' stroke-width='2' stroke-linecap='round'><path d='m14.5 12.5 2-2'/><path d='m11.5 9.5 2-2'/><path d='m8.5 6.5 2-2'/><path d='m17.5 15.5 2-2'/></g><circle cx='20.6' cy='20.6' r='1.5' fill='" + INK + "'/></svg>\") 20 20, crosshair"

/** Размер-выноска — двусторонняя стрелка с оранжевым центром */
export const CURSOR_DIM =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><g fill='none' stroke='white' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'><path d='M18 8l4 4-4 4'/><path d='M6 8l-4 4 4 4'/><path d='M2 12h20'/></g><g fill='none' stroke='" + INK + "' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M18 8l4 4-4 4'/><path d='M6 8l-4 4 4 4'/><path d='M2 12h20'/></g><circle cx='12' cy='12' r='2' fill='" + ORANGE + "' stroke='white' stroke-width='1.4'/></svg>\") 12 12, crosshair"

/** Камера — перекрестье с оранжевым объективом; точка съёмки 3D-снимка */
export const CURSOR_CAMERA =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>" +
  CROSSHAIR_HALO +
  CROSSHAIR_INK +
  "<circle cx='12' cy='12' r='4.2' fill='white' stroke='" + INK + "' stroke-width='1.4'/><circle cx='12' cy='12' r='2.2' fill='" + ORANGE + "'/></svg>\") 12 12, crosshair"

/** Поворот — круговая стрелка (над ручкой поворота) */
export const CURSOR_ROTATE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><g fill='none' stroke='white' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'><path d='M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8'/><path d='M21 3v5h-5'/></g><g fill='none' stroke='" + INK + "' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8'/><path d='M21 3v5h-5'/></g></svg>\") 12 12, grab"

/** Вершина контура — ромб-мишень с насечками */
export const CURSOR_VERTEX =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><g fill='none' stroke='white' stroke-width='4.6' stroke-linecap='round'><path d='M12 2v4.5M12 17.5V22M2 12h4.5M17.5 12H22'/></g><g fill='none' stroke='" + INK + "' stroke-width='1.8' stroke-linecap='round'><path d='M12 2v4.5M12 17.5V22M2 12h4.5M17.5 12H22'/></g><path d='M12 7.6 16.4 12 12 16.4 7.6 12Z' fill='white' stroke='" + INK + "' stroke-width='1.6'/><circle cx='12' cy='12' r='1.3' fill='" + ORANGE + "'/></svg>\") 12 12, pointer"

/** Перетаскивание объектов — четырёхстороняя стрелка */
export const CURSOR_MOVE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><g fill='none' stroke='white' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'><path d='M12 2v20'/><path d='M2 12h20'/><path d='m9 5 3-3 3 3'/><path d='m9 19 3 3 3-3'/><path d='M5 9l-3 3 3 3'/><path d='m19 9 3 3-3 3'/></g><g fill='none' stroke='" + INK + "' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 2v20'/><path d='M2 12h20'/><path d='m9 5 3-3 3 3'/><path d='m9 19 3 3 3-3'/><path d='M5 9l-3 3 3 3'/><path d='m19 9 3 3-3 3'/></g><circle cx='12' cy='12' r='2' fill='white' stroke='" + INK + "' stroke-width='1.4'/></svg>\") 12 12, move"

/** Рука открытая (панорама) — по глифу lucide Hand */
export const CURSOR_GRAB =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><g fill='none' stroke='white' stroke-width='4.6' stroke-linecap='round' stroke-linejoin='round'><path d='M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2'/><path d='M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2'/><path d='M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8'/><path d='M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'/></g><g fill='none' stroke='" + INK + "' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2'/><path d='M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2'/><path d='M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8'/><path d='M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'/></g></svg>\") 12 14, grab"

/** Рука сжатая (панорамирование) — по глифу lucide Grab */
export const CURSOR_GRABBING =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><g fill='none' stroke='white' stroke-width='4.6' stroke-linecap='round' stroke-linejoin='round'><path d='M18 11.5V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1.4'/><path d='M14 10V8a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2'/><path d='M10 9.9V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v7'/><path d='M6 14a2 2 0 0 0-2-2a2 2 0 0 0-2 2'/><path d='M18 11.5a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'/></g><g fill='none' stroke='" + INK + "' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M18 11.5V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1.4'/><path d='M14 10V8a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2'/><path d='M10 9.9V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v7'/><path d='M6 14a2 2 0 0 0-2-2a2 2 0 0 0-2 2'/><path d='M18 11.5a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'/></g></svg>\") 12 14, grabbing"
