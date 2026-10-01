import { Skeleton } from '@/components/ui/skeleton'

/** Module detail skeleton — header, log bar, glance tiles, charts, and history rows. */
export default function ModuleLoading() {
  return (
    <main className="max-w-6xl mx-auto w-full px-4 py-8 flex flex-col gap-[22px]" aria-busy="true" data-app-loading="">
      <span className="sr-only" role="status">Loading tracker…</span>

      <Skeleton className="h-4 w-36" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-[18px] flex-1">
          <Skeleton className="size-[60px] rounded-xl" />
          <div>
            <Skeleton className="h-9 w-56 max-w-full" />
            <Skeleton className="h-4 w-40 mt-2" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="size-9" />
        </div>
      </div>

      <div className="rounded-2xl border bg-card px-[22px] py-5 flex flex-col gap-4">
        <Skeleton className="h-5 w-28" />
        <div className="flex gap-3.5">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[52px] flex-1 rounded-[10px]" />
          ))}
          <Skeleton className="h-[52px] w-28 rounded-[10px]" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[172px] rounded-xl" />
        ))}
      </div>

      <Skeleton className="h-72 w-full rounded-2xl" />

      <div className="rounded-2xl border bg-card divide-y">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-[22px] py-3">
            <Skeleton className="h-4 w-16 shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-12 shrink-0" />
          </div>
        ))}
      </div>
    </main>
  )
}
