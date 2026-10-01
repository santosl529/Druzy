import { Nav } from '@/components/nav'
import { BootSplash } from '@/components/boot-splash'
import { requireUser } from '@/lib/supabase/auth'

/** Most tracker shards the boot splash shows under the wordmark. */
const SPLASH_SHARDS = 8

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser()
  // The splash shows one shard per tracker (in its crystal) and opens the
  // first tracker's geode. Deterministic, so SSR and hydration agree.
  const { data: trackers } = await supabase
    .from('modules')
    .select('crystal_type')
    .eq('user_id', user.id)
    .order('name')
    .limit(SPLASH_SHARDS)
  const shardCrystals = (trackers ?? []).map((t) => t.crystal_type as string)
  const splashCrystal = shardCrystals[0] ?? 'amethyst'
  return (
    <div className="flex flex-col min-h-screen">
      <noscript>
        <style>{'.boot-splash{display:none}'}</style>
      </noscript>
      <BootSplash crystalType={splashCrystal} shardCrystals={shardCrystals} />
      <Nav email={user.email ?? ''} />
      {children}
    </div>
  )
}
