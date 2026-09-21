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
  BrickWall,
  FilePlus2,
  FileUp,
  FileDown,
  ImageDown,
  ImagePlus,
  Hand,
  Maximize,
  MousePointer2,
  PencilLine,
  Redo2,
  Undo2,
  ZoomIn,
  ZoomOut,
  CloudCheck,
  Sofa,
} from 'lucide-react'
import type { Tool } from '@/lib/planner/tools'
import { cn } from '@/lib/utils'

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
  onExportJSON: () => void
}

const TOOLS: { id: Tool; label: string; icon: typeof MousePointer2; key: string }[] = [
  { id: 'select', label: 'Выбор', icon: MousePointer2, key: '1' },
  { id: 'wall', label: 'Стены', icon: PencilLine, key: '2' },
  { id: 'partition', label: 'Перегородки', icon: BrickWall, key: '3' },
  { id: 'pan', label: 'Рука', icon: Hand, key: '4' },
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
  onExportJSON,
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

      {/* Инструменты */}
      <div className="flex items-center gap-1 rounded-xl bg-[#F1E9DA] p-1">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            title={`${t.label} (${t.key})`}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all',
              tool === t.id ? 'bg-[#E8730C] text-white shadow-sm' : 'text-[#6B5D4F] hover:bg-[#E9DECB]',
            )}
          >
            <t.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* История и вид */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6B5D4F] hover:bg-[#F1E9DA]" onClick={onUndo} disabled={!canUndo} title="Отменить (Ctrl+Z)">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6B5D4F] hover:bg-[#F1E9DA]" onClick={onRedo} disabled={!canRedo} title="Повторить (Ctrl+Shift+Z)">
          <Redo2 className="h-4 w-4" />
        </Button>
        <div className="mx-0.5 h-6 w-px bg-[#E7DECF]" />
        <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6B5D4F] hover:bg-[#F1E9DA]" onClick={onZoomOut} title="Уменьшить">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6B5D4F] hover:bg-[#F1E9DA]" onClick={onZoomIn} title="Увеличить">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6B5D4F] hover:bg-[#F1E9DA]" onClick={onFit} title="Вписать в экран">
          <Maximize className="h-4 w-4" />
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {/* Автосохранение */}
        <div className="mr-1 hidden items-center gap-1.5 rounded-full bg-[#EFF5EC] px-3 py-1.5 md:flex" title="Проект автоматически сохраняется в браузере">
          <CloudCheck className="h-3.5 w-3.5 text-[#5D8A4E]" />
          <span className="text-[11px] font-semibold text-[#5D8A4E]">{savedAt ? `Сохранено ${savedAt}` : 'Автосохранение'}</span>
        </div>

        <Button variant="outline" size="sm" className="h-8 border-[#E4DAC8] bg-white text-xs text-[#6B5D4F] hover:bg-[#F7F1E6]" onClick={onUnderlayClick} title={hasUnderlay ? 'Заменить план-подложку' : 'Загрузить план-подложку (скан/фото) для обводки'}>
          <ImagePlus className="mr-1 h-3.5 w-3.5" />
          <span className="hidden md:inline">Подложка</span>
        </Button>
        <Button variant="outline" size="sm" className="h-8 border-[#E4DAC8] bg-white text-xs text-[#6B5D4F] hover:bg-[#F7F1E6]" onClick={onImportClick} title="Импорт из JSON">
          <FileUp className="mr-1 h-3.5 w-3.5" />
          <span className="hidden md:inline">Импорт</span>
        </Button>
        <Button variant="outline" size="sm" className="h-8 border-[#E4DAC8] bg-white text-xs text-[#6B5D4F] hover:bg-[#F7F1E6]" onClick={onExportJSON} title="Скачать проект JSON">
          <FileDown className="mr-1 h-3.5 w-3.5" />
          <span className="hidden md:inline">JSON</span>
        </Button>
        <Button size="sm" className="h-8 bg-[#E8730C] text-xs text-white shadow-sm hover:bg-[#D4660A]" onClick={onExportPNG} title="Скачать план картинкой PNG">
          <ImageDown className="mr-1 h-3.5 w-3.5" />
          <span className="hidden md:inline">PNG</span>
        </Button>

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
                Текущий план (стены и объекты) будет очищен. Действие можно отменить клавишами Ctrl+Z.
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
