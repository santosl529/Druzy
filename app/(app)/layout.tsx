import { Nav } from '@/components/nav'
import { BootSplash } from '@/components/boot-splash'
import { requireUser } from '@/lib/supabase/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser()
  return (
    <div className="flex flex-col min-h-screen">
      <noscript>
        <style>{'.boot-splash{display:none}'}</style>
      </noscript>
      <BootSplash />
      <Nav email={user.email ?? ''} />
      {children}
    </div>
  )
}
