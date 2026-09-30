import { Skeleton } from '@/components/ui/skeleton'

/**
 * Fallback skeleton for app pages without their own — most are single-column
 * forms. The trackers and module pages have dedicated skeletons.
 */
export default function AppLoading() {
  return (
    <main className="max-w-2xl mx-auto w-full px-4 py-10 space-y-8" aria-busy="true">
      <span className="sr-only" role="status">Loading…</span>
      <div>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-64 max-w-full mt-2" />
      </div>
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </main>
  )
}
