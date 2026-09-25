'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Keyboard } from 'lucide-react'
import { Kbd } from './Tip'

interface Row {
  desc: string
  keys: string[][]
}
interface Section {
  title: string
  rows: Row[]
}

const SECTIONS: Section[] = [
  {
    title: 'Инструменты',
    rows: [
      { desc: 'Выбор и перемещение', keys: [['1'], ['V']] },
      { desc: 'Стены — наружный контур', keys: [['2'], ['W']] },
      { desc: 'Перегородки', keys: [['3'], ['P']] },
      { desc: 'Рука — панорама', keys: [['4'], ['H']] },
      { desc: 'Ластик', keys: [['5'], ['E']] },
      { desc: 'Рулетка', keys: [['6']] },
      { desc: 'Размер (выноска)', keys: [['7']] },
      { desc: 'Камера — точка и направление для 2D-снимка зоны обзора', keys: [['8'], ['C']] },
    ],
  },
  {
    title: 'Рисование',
    rows: [
      { desc: 'Завершить контур / размер', keys: [['Enter']] },
      { desc: 'Замкнуть контур комнаты', keys: [['Двойной клик']] },
      { desc: 'Убрать последнюю точку', keys: [['ПКМ']] },
      { desc: 'Отмена / снять выделение', keys: [['Esc']] },
      { desc: 'Разместить без привязки к сетке', keys: [['Shift', 'клик']] },
      { desc: 'Камера: поворот на 15° / убрать (в режиме камеры)', keys: [['R'], ['Del']] },
    ],
  },
  {
    title: 'Объекты',
    rows: [
      { desc: 'Повернуть на 90° (Shift+R — обратно)', keys: [['R']] },
      { desc: 'Отзеркалить', keys: [['M']] },
      { desc: 'Дубликат', keys: [['Ctrl', 'D']] },
      { desc: 'Удалить', keys: [['Del'], ['Backspace']] },
      { desc: 'Сдвиг выделенного объекта на шаг сетки', keys: [['Shift', 'Стрелки']] },
    ],
  },
  {
    title: 'Вид и история',
    rows: [
      { desc: 'Панорама вида стрелками (и во время рисования)', keys: [['Стрелки']] },
      { desc: 'Временная панорама (удерживать)', keys: [['Space']] },
      { desc: 'Масштаб', keys: [['Колесо мыши']] },
      { desc: 'Отменить', keys: [['Ctrl', 'Z']] },
      { desc: 'Повторить', keys: [['Ctrl', 'Shift', 'Z'], ['Ctrl', 'Y']] },
      { desc: 'Эта справка', keys: [['?'], ['Shift', '7']] },
    ],
  },
]

export function ShortcutsDialog() {
  const [open, setOpen] = useState(false)

  // Открытие по «?» (EN-раскладка) или Shift+7 (RU-раскладка)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === '?' || (e.code === 'Digit7' && e.shiftKey)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6B5D4F] hover:bg-[#F1E9DA]" title="Горячие клавиши (?)">
          <Keyboard className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-hidden border-[#E7DECF] bg-[#FBF7EF]">
        <DialogHeader>
          <DialogTitle className="text-[#3D3428]">Горячие клавиши</DialogTitle>
          <DialogDescription className="text-[#8B7D6B]">
            Работают почти всегда — кроме ввода текста в полях панели свойств.
          </DialogDescription>
        </DialogHeader>
        <div className="-mr-1 max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[#B3401E]">{s.title}</div>
              <div className="space-y-1">
                {s.rows.map((r) => (
                  <div
                    key={r.desc}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[#F0E7D6] bg-white/80 px-2.5 py-1.5"
                  >
                    <span className="text-xs font-medium text-[#3D3428]">{r.desc}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {r.keys.map((combo, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-[10px] font-medium text-[#8B7D6B]">или</span>}
                          {combo.map((k) => (
                            <Kbd key={k}>{k}</Kbd>
                          ))}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-lg bg-[#F1E9DA] px-3 py-2 text-[11px] font-medium text-[#6B5D4F]">
          Наведите курсор на любую кнопку тулбара — там тоже появляется подсказка с её клавишами.
        </div>
      </DialogContent>
    </Dialog>
  )
}
