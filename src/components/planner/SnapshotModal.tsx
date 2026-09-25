'use client'

import { useEffect, useRef } from 'react'
import type { PlannerDoc } from '@/lib/planner/types'
import { currentFloor } from '@/lib/planner/types'
import { download } from '@/lib/planner/export'
import { preloadPresetImages, preloadUnderlayImage } from '@/lib/planner/draw'
import { renderSnapshot2d } from '@/lib/planner/snap2d'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Camera, ImageDown, X } from 'lucide-react'

interface Props {
  doc: PlannerDoc
  onClose: () => void
}

/**
 * Модальное окно 2D-снимка камеры: реалистичная картинка зоны обзора
 * (сектор 65° от точки камеры, отмеченной на плане инструментом «Камера»).
 * Статичный кадр + экспорт PNG в высоком разрешении (ширина 3200 px).
 */
export function SnapshotModal({ doc, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const docRef = useRef(doc)
  useEffect(() => void (docRef.current = doc), [doc])

  const floor = currentFloor(doc)
  const cam = floor.camera ?? { x: 0, y: 0, angle: 0 }

  const renderFn = () => {
    const c = canvasRef.current
    const wrap = wrapRef.current
    if (!c || !wrap) return
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    if (w < 10 || h < 10) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const pw = Math.round(w * dpr)
    const ph = Math.round(h * dpr)
    if (c.width !== pw || c.height !== ph) {
      c.width = pw
      c.height = ph
    }
    renderSnapshot2d(c, currentFloor(docRef.current), docRef.current.layers)
  }
  const renderRef = useRef<() => void>(() => {})
  useEffect(() => void (renderRef.current = renderFn), [renderFn])

  // при монтировании: предзагрузка схем пресетов и подложки, блокировка прокрутки
  useEffect(() => {
    renderFn()
    const fl = currentFloor(docRef.current)
    const jobs: Promise<void>[] = [preloadPresetImages()]
    if (fl.underlay?.visible) {
      jobs.push(preloadUnderlayImage(fl.underlay.src).catch(() => undefined))
    }
    Promise.all(jobs).then(() => renderRef.current())
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [])

  // ресайз контейнера
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => renderRef.current())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // Esc — закрыть
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const exportPng = () => {
    const c = document.createElement('canvas')
    c.width = 3200
    c.height = 2000 // предварительная высота — рендер переразмерит под сектор
    renderSnapshot2d(c, currentFloor(docRef.current), docRef.current.layers, { width: 3200 })
    c.toBlob((blob) => {
      if (blob) {
        download(blob, 'snimok-kamery.png')
        toast.success('PNG-снимок скачивается…')
      }
    }, 'image/png')
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#14110D]">
      {/* Шапка */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#3A332A] px-3 py-2 sm:px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E8730C] shadow-sm">
            <Camera className="h-4.5 w-4.5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-[#F3EDE2]">Снимок камеры</div>
            <div className="text-[11px] text-[#A99A82]">
              {floor.name} · точка {Math.round(cam.x)}×{Math.round(cam.y)} см · зона обзора 65°
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-[#57493A] bg-[#2A251E] text-xs text-[#F3EDE2] hover:bg-[#3A332A]"
            onClick={exportPng}
          >
            <ImageDown className="mr-1 h-3.5 w-3.5" />
            <span className="hidden md:inline">Скачать PNG</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[#D8CBB6] hover:bg-[#2A251E] hover:text-[#F3EDE2]"
            onClick={onClose}
            title="Закрыть (Esc)"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Кадр */}
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full select-none" />
      </div>
    </div>
  )
}
