import type { PlannerObject } from './types'

/** Лестница — объект, который на своём этаже рисуется пунктиром, а на этажах выше — целиком */
export function isStairs(o: PlannerObject): boolean {
  return o.showNext === true || o.presetId.startsWith('stairs')
}
