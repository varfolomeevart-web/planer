import { Planner } from '@/components/planner/Planner'
import { Toaster } from '@/components/ui/sonner'

export default function Home() {
  return (
    <>
      <Planner />
      <Toaster position="bottom-center" richColors />
    </>
  )
}
