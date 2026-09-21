'use client'

import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Клавиша-чип в стиле кэпа */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-[#5A4F3F] bg-[#4A4033] px-1.5 font-sans text-[10px] font-bold leading-none text-[#F7F1E6] shadow-[inset_0_-1px_0_rgba(0,0,0,0.35)]">
      {children}
    </kbd>
  )
}

/** Блок альтернативных сочетаний: [[Ctrl,Z]] → Ctrl+Z;  [[1],[V]] → 1 или V */
function Keys({ keys }: { keys: string[][] }) {
  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      {keys.map((combo, i) => (
        <span key={i} className="flex items-center gap-0.5">
          {i > 0 && <span className="text-[10px] font-medium text-[#9C8F7C]">или</span>}
          {combo.map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </span>
      ))}
    </span>
  )
}

/**
 * Тултип для кнопок тулбара: название + горячие клавиши + краткая подсказка.
 * Сам содержит TooltipProvider — работает в любом месте.
 */
export function Tip({
  label,
  hint,
  keys,
  children,
  side = 'bottom',
}: {
  label: ReactNode
  hint?: string
  keys?: string[][]
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={7} className="border-[#3D3428] bg-[#2E2820] px-2.5 py-1.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#FBF7EF]">
          <span>{label}</span>
          {keys && <Keys keys={keys} />}
        </div>
        {hint && <div className="mt-0.5 text-[10.5px] font-medium leading-snug text-[#B8AB97]">{hint}</div>}
      </TooltipContent>
    </Tooltip>
  )
}
