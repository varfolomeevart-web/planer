'use client'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Box,
  BrickWall,
  ClipboardList,
  CopyPlus,
  Eraser,
  FilePlus2,
  FileUp,
  FileDown,
  FileText,
  Hand,
  ImageDown,
  ImagePlus,
  Layers,
  Maximize,
  MoveHorizontal,
  MousePointer2,
  PencilLine,
  Plus,
  Redo2,
  Ruler,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
  CloudCheck,
  Sofa,
} from 'lucide-react'
import type { Floor, LayerVis, ObjLayer } from '@/lib/planner/types'
import { ENG_COLORS, LAYERS } from '@/lib/planner/types'
import type { Tool } from '@/lib/planner/tools'
import { cn } from '@/lib/utils'
import { Tip } from './Tip'
import { ShortcutsDialog } from './ShortcutsDialog'

interface Props {
  tool: Tool
  setTool: (t: Tool) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onFit: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  savedAt: string | null
  onNew: () => void
  onImportClick: () => void
  onUnderlayClick: () => void
  hasUnderlay: boolean
  onExportPNG: () => void
  onExportPDF: () => void
  onExportJSON: () => void
  onCopyBrief: () => void
  onOpen3d: () => void
  floors: Floor[]
  currentFloorId: string
  onSwitchFloor: (id: string) => void
  onAddFloor: () => void
  onCopyFloor: () => void
  onDeleteFloor: () => void
  layers: LayerVis
  onToggleLayer: (id: ObjLayer) => void
}

const TOOLS: { id: Tool; label: string; icon: typeof MousePointer2; keys: string[][]; hint: string }[] = [
  { id: 'select', label: 'Выбор', icon: MousePointer2, keys: [['1'], ['V']], hint: 'клик — выбрать, потянуть — переместить' },
  { id: 'wall', label: 'Стены', icon: PencilLine, keys: [['2'], ['W']], hint: 'клик — точка, Enter — завершить' },
  { id: 'partition', label: 'Перегородки', icon: BrickWall, keys: [['3'], ['P']], hint: 'прилипают к стенам, сетке и друг другу' },
  { id: 'erase', label: 'Ластик', icon: Eraser, keys: [['5'], ['E']], hint: 'клик по сегменту или вершине — стереть' },
  { id: 'ruler', label: 'Рулетка', icon: Ruler, keys: [['6']], hint: 'зажми и протяни вдоль расстояния' },
  { id: 'dimension', label: 'Размер', icon: MoveHorizontal, keys: [['7']], hint: 'клик — начало, клик — конец' },
  { id: 'pan', label: 'Рука', icon: Hand, keys: [['4'], ['H']], hint: 'тяни вид · пробел или стрелки — панорама' },
]

export function TopBar({
  tool,
  setTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onFit,
  onZoomIn,
  onZoomOut,
  savedAt,
  onNew,
  onImportClick,
  onUnderlayClick,
  hasUnderlay,
  onExportPNG,
  onExportPDF,
  onExportJSON,
  onCopyBrief,
  onOpen3d,
  floors,
  currentFloorId,
  onSwitchFloor,
  onAddFloor,
  onCopyFloor,
  onDeleteFloor,
  layers,
  onToggleLayer,
}: Props) {
  return (
    <header className="z-20 flex shrink-0 flex-wrap items-center gap-2 border-b border-[#E7DECF] bg-[#FBF7EF]/95 px-3 py-2 sm:px-4">
      {/* Логотип */}
      <div className="mr-1 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E8730C] shadow-sm">
          <Sofa className="h-5 w-5 text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-extrabold tracking-tight text-[#3D3428]">Планировщик</div>
          <div className="text-[10px] font-medium text-[#8B7D6B]">помещения · вид сверху</div>
        </div>
      </div>

      <div className="hidden h-7 w-px bg-[#E7DECF] md:block" />

      {/* Этажи */}
      <div className="flex items-center gap-1 rounded-xl bg-[#F1E9DA] p-1">
        {floors.map((f, i) => (
          <button
            key={f.id}
            onClick={() => onSwitchFloor(f.id)}
            title={`Перейти на «${f.name}»`}
            className={cn(
              'max-w-28 truncate rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all',
              f.id === currentFloorId
                ? 'bg-[#E8730C] text-white shadow-sm'
                : 'text-[#6B5D4F] hover:bg-[#E9DECB]',
            )}
          >
            <span className="sm:hidden">{i + 1}</span>
            <span className="hidden sm:inline">{f.name}</span>
          </button>
        ))}
        <Tip label="Добавить этаж" hint="максимум 20 этажей">
          <button
            onClick={onAddFloor}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#6B5D4F] transition-all hover:bg-[#E9DECB]"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden md:inline">Этаж</span>
          </button>
        </Tip>
        <Tip label="Копия этажа" hint="всё содержимое — на новый этаж">
          <button
            onClick={onCopyFloor}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#6B5D4F] transition-all hover:bg-[#E9DECB]"
          >
            <CopyPlus className="h-4 w-4" />
            <span className="hidden xl:inline">Копия</span>
          </button>
        </Tip>
        {floors.length > 1 && (
          <Tip label="Удалить этаж" hint="текущий этаж и его объекты">
            <button
              onClick={onDeleteFloor}
              className="flex items-center rounded-lg px-2 py-1.5 text-xs font-semibold text-[#B3401E] transition-all hover:bg-[#F3DFD6]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </Tip>
        )}
      </div>

      {/* Инструменты */}
      <div className="flex items-center gap-1 rounded-xl bg-[#F1E9DA] p-1">
        {TOOLS.map((t) => (
          <Tip key={t.id} label={t.label} keys={t.keys} hint={t.hint}>
            <button
              onClick={() => setTool(t.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all',
                tool === t.id ? 'bg-[#E8730C] text-white shadow-sm' : 'text-[#6B5D4F] hover:bg-[#E9DECB]',
              )}
            >
              <t.icon className="h-4 w-4" />
              <span className="hidden lg:inline">{t.label}</span>
            </button>
          </Tip>
        ))}
      </div>

      {/* Слои */}
      <Tip label="Слои" hint="вытяжка · вода · электрика">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-1.5 rounded-xl bg-[#F1E9DA] px-2.5 py-2 text-xs font-semibold text-[#6B5D4F] transition-all hover:bg-[#E9DECB]"
          >
            <Layers className="h-4 w-4" />
            <span className="hidden lg:inline">Слои</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="border-[#E7DECF] bg-[#FBF7EF]">
          <DropdownMenuLabel className="text-xs text-[#8B7D6B]">Показывать на плане</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-[#E7DECF]" />
          {LAYERS.map((l) => (
            <DropdownMenuCheckboxItem
              key={l.id}
              checked={layers[l.id]}
              onCheckedChange={() => onToggleLayer(l.id)}
              onSelect={(e) => e.preventDefault()}
              className="text-xs text-[#3D3428] data-[highlighted]:bg-[#F1E9DA]"
            >
              <span className="flex items-center gap-2">
                {l.id !== 'furniture' && (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: ENG_COLORS[l.id].fill,
                      boxShadow: `inset 0 0 0 1.5px ${ENG_COLORS[l.id].stroke}`,
                    }}
                  />
                )}
                {l.name}
              </span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      </Tip>

      {/* История и вид */}
      <div className="flex items-center gap-1">
        <Tip label="Отменить" keys={[['Ctrl', 'Z']]}>
          <span className="inline-flex">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6B5D4F] hover:bg-[#F1E9DA]" onClick={onUndo} disabled={!canUndo}>
              <Undo2 className="h-4 w-4" />
            </Button>
          </span>
        </Tip>
        <Tip label="Повторить" keys={[['Ctrl', 'Shift', 'Z'], ['Ctrl', 'Y']]}>
          <span className="inline-flex">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6B5D4F] hover:bg-[#F1E9DA]" onClick={onRedo} disabled={!canRedo}>
              <Redo2 className="h-4 w-4" />
            </Button>
          </span>
        </Tip>
        <div className="mx-0.5 h-6 w-px bg-[#E7DECF]" />
        <Tip label="Уменьшить" keys={[['Колесо мыши']]}>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6B5D4F] hover:bg-[#F1E9DA]" onClick={onZoomOut}>
            <ZoomOut className="h-4 w-4" />
          </Button>
        </Tip>
        <Tip label="Увеличить" keys={[['Колесо мыши']]}>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6B5D4F] hover:bg-[#F1E9DA]" onClick={onZoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
        </Tip>
        <Tip label="Вписать в экран">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6B5D4F] hover:bg-[#F1E9DA]" onClick={onFit}>
            <Maximize className="h-4 w-4" />
          </Button>
        </Tip>
        <div className="mx-0.5 h-6 w-px bg-[#E7DECF]" />
        <ShortcutsDialog />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {/* Автосохранение */}
        <div className="mr-1 hidden items-center gap-1.5 rounded-full bg-[#EFF5EC] px-3 py-1.5 md:flex" title="Проект автоматически сохраняется в браузере">
          <CloudCheck className="h-3.5 w-3.5 text-[#5D8A4E]" />
          <span className="text-[11px] font-semibold text-[#5D8A4E]">{savedAt ? `Сохранено ${savedAt}` : 'Автосохранение'}</span>
        </div>

        <Tip label="Подложка" hint={hasUnderlay ? 'заменить скан или фото плана' : 'скан или фото плана — рисуйте поверх'}>
          <Button variant="outline" size="sm" className="h-8 border-[#E4DAC8] bg-white text-xs text-[#6B5D4F] hover:bg-[#F7F1E6]" onClick={onUnderlayClick}>
            <ImagePlus className="mr-1 h-3.5 w-3.5" />
            <span className="hidden md:inline">Подложка</span>
          </Button>
        </Tip>
        <Tip label="Импорт" hint="загрузить проект из JSON-файла">
          <Button variant="outline" size="sm" className="h-8 border-[#E4DAC8] bg-white text-xs text-[#6B5D4F] hover:bg-[#F7F1E6]" onClick={onImportClick}>
            <FileUp className="mr-1 h-3.5 w-3.5" />
            <span className="hidden md:inline">Импорт</span>
          </Button>
        </Tip>
        <Tip label="JSON" hint="сохранить проект в файл">
          <Button variant="outline" size="sm" className="h-8 border-[#E4DAC8] bg-white text-xs text-[#6B5D4F] hover:bg-[#F7F1E6]" onClick={onExportJSON}>
            <FileDown className="mr-1 h-3.5 w-3.5" />
            <span className="hidden md:inline">JSON</span>
          </Button>
        </Tip>
        <Tip label="ТЗ для 3D" hint="скопировать текстовое техзадание (материалы, освещение, ракурсы) в буфер">
          <Button variant="outline" size="sm" className="h-8 border-[#E4DAC8] bg-white text-xs text-[#6B5D4F] hover:bg-[#F7F1E6]" onClick={onCopyBrief}>
            <ClipboardList className="mr-1 h-3.5 w-3.5" />
            <span className="hidden md:inline">ТЗ</span>
          </Button>
        </Tip>
        <Tip label="PDF" hint="скачать план в PDF · все этажи — по страницам">
          <Button variant="outline" size="sm" className="h-8 border-[#E4DAC8] bg-white text-xs text-[#6B5D4F] hover:bg-[#F7F1E6]" onClick={onExportPDF}>
            <FileText className="mr-1 h-3.5 w-3.5" />
            <span className="hidden md:inline">PDF</span>
          </Button>
        </Tip>
        <Tip label="3D-визуализация" hint="объёмный вид этажа · тяните мышью, колесо — масштаб">
          <Button variant="outline" size="sm" className="h-8 border-[#E4DAC8] bg-white text-xs text-[#6B5D4F] hover:bg-[#F7F1E6]" onClick={onOpen3d}>
            <Box className="mr-1 h-3.5 w-3.5" />
            <span className="hidden md:inline">3D</span>
          </Button>
        </Tip>
        <Tip label="PNG" hint="скачать план картинкой">
          <Button size="sm" className="h-8 bg-[#E8730C] text-xs text-white shadow-sm hover:bg-[#D4660A]" onClick={onExportPNG}>
            <ImageDown className="mr-1 h-3.5 w-3.5" />
            <span className="hidden md:inline">PNG</span>
          </Button>
        </Tip>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 border-[#E4DAC8] bg-white text-xs text-[#6B5D4F] hover:bg-[#F7F1E6]" title="Новый проект">
              <FilePlus2 className="mr-1 h-3.5 w-3.5" />
              <span className="hidden md:inline">Новый</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="border-[#E7DECF] bg-[#FBF7EF]">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-[#3D3428]">Начать новый проект?</AlertDialogTitle>
              <AlertDialogDescription className="text-[#8B7D6B]">
                Текущий план (все этажи, стены и объекты) будет очищен. Действие можно отменить клавишами Ctrl+Z.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-[#E4DAC8] bg-white hover:bg-[#F7F1E6]">Отмена</AlertDialogCancel>
              <AlertDialogAction className="bg-[#E8730C] text-white hover:bg-[#D4660A]" onClick={onNew}>
                Очистить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </header>
  )
}
