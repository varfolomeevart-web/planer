'use client'

import { useEffect, useRef } from 'react'
import { drawGlyph } from '@/lib/planner/draw'

interface Props {
  presetId: string
  color: string
  w: number
  h: number
  size?: number
}

/** Мини-превью мебели на canvas — тот же глиф, что и на плане */
export function FurnitureIcon({ presetId, color, w, h, size = 56 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    const scale = Math.min((size - 10) / w, (size - 10) / h)
    ctx.save()
    ctx.translate(size / 2, size / 2)
    drawGlyph(ctx, presetId, color, w, h, scale)
    ctx.restore()
  }, [presetId, color, w, h, size])

  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden className="shrink-0" />
}
