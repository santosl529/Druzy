import { Nav } from '@/components/nav'
import { BootSplash } from '@/components/boot-splash'
import { requireUser } from '@/lib/supabase/auth'
import { CRYSTAL_KEYS } from '@/lib/crystals'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser()
  // A random crystal per load, chosen server-side so SSR and hydration agree.
  const splashCrystal = CRYSTAL_KEYS[Math.floor(Math.random() * CRYSTAL_KEYS.length)]
  return (
    <div className="flex flex-col min-h-screen">
      <noscript>
        <style>{'.boot-splash{display:none}'}</style>
      </noscript>
      <BootSplash crystalType={splashCrystal} />
      <Nav email={user.email ?? ''} />
      {children}
    </div>
  )
}
