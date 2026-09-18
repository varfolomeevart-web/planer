'use client'

import { useState } from 'react'
import { CATEGORIES, PRESETS, type Preset } from '@/lib/planner/presets'
import { FurnitureIcon } from './FurnitureIcon'
import { cn } from '@/lib/utils'
import { PlusSquare } from 'lucide-react'

interface Props {
  placePreset: Preset | null
  onPlace: (p: Preset) => void
}

export function Catalog({ placePreset, onPlace }: Props) {
  const [cat, setCat] = useState<string>('living')
  const items = PRESETS.filter((p) => p.category === cat)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[#EAE2D5] px-4 py-3">
        <h2 className="text-sm font-bold tracking-wide text-[#3D3428] uppercase">Каталог объектов</h2>
        <p className="mt-0.5 text-xs text-[#8B7D6B]">Нажмите, затем кликните на плане</p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-[#EAE2D5] px-3 py-2.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              cat === c.id
                ? 'bg-[#E8730C] text-white shadow-sm'
                : 'bg-[#F4EDE1] text-[#6B5D4F] hover:bg-[#EDE3D3]',
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 planner-scroll">
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-1 2xl:grid-cols-2">
          {items.map((p) => (
            <button
              key={p.id}
              onClick={() => onPlace(p)}
              className={cn(
                'group flex flex-col items-center gap-1 rounded-xl border-2 bg-white p-2.5 text-center transition-all hover:border-[#E8730C]/60 hover:shadow-md',
                placePreset?.id === p.id ? 'border-[#E8730C] bg-[#FDF3E7] shadow-sm' : 'border-[#EFE8DB]',
              )}
              title={`Добавить: ${p.name} (${p.w}×${p.h} см)`}
            >
              <FurnitureIcon presetId={p.id} color={p.color} w={p.w} h={p.h} size={52} />
              <span className="text-xs leading-tight font-semibold text-[#3D3428]">{p.name}</span>
              <span className="text-[10px] text-[#8B7D6B]">
                {p.w}×{p.h} см
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-[#EAE2D5] p-3">
        <button
          onClick={() => onPlace(PRESETS[PRESETS.length - 1])}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-2.5 text-sm font-semibold transition-colors',
            placePreset?.id === 'custom'
              ? 'border-[#E8730C] bg-[#FDF3E7] text-[#C55F05]'
              : 'border-[#D8CBB6] text-[#6B5D4F] hover:border-[#E8730C]/60 hover:bg-[#FDF6EC]',
          )}
        >
          <PlusSquare className="h-4 w-4" />
          Свой объект (любой размер)
        </button>
      </div>
    </div>
  )
}
