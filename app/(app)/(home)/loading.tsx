import { Skeleton } from '@/components/ui/skeleton'

/** Trackers page skeleton — mirrors the header and the 1/2/3-column card grid. */
export default function TrackersLoading() {
  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-10" aria-busy="true" data-app-loading="">
      <span className="sr-only" role="status">Loading trackers…</span>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-72 max-w-full mt-2" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[1.2rem]">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="flex flex-col gap-[1.2rem] rounded-xl p-[1.2rem] ring-1 ring-foreground/10"
          >
            <div className="flex items-start gap-3.5">
              <Skeleton className="size-12 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2 pt-1">
                <Skeleton className="h-6 w-3/5" />
                <Skeleton className="h-4 w-1/4" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4">
              <div className="space-y-1.5">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-6 w-14" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    </main>
  )
}
