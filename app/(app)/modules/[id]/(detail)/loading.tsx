import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

/** Module detail skeleton — header, log form, a chart, and history rows. */
export default function ModuleLoading() {
  return (
    <main className="max-w-4xl mx-auto w-full px-4 py-10 space-y-8" aria-busy="true">
      <span className="sr-only" role="status">Loading tracker…</span>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Skeleton className="h-4 w-16 mb-2" />
          <Skeleton className="h-9 w-56 max-w-full" />
          <Skeleton className="h-5 w-24 mt-2" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>

      <Separator />

      <section>
        <Skeleton className="h-7 w-28 mb-4" />
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
        <Skeleton className="h-8 w-24 mt-4" />
      </section>

      <Separator />

      <section>
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-7 w-24" />
        </div>
        <Skeleton className="h-64 sm:h-80 w-full rounded-xl" />
      </section>

      <Separator />

      <section>
        <Skeleton className="h-7 w-20 mb-4" />
        <div className="rounded-lg border divide-y">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 p-3">
              <Skeleton className="h-4 w-20 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-12 shrink-0" />
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
