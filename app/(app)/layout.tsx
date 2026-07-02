import { Nav } from '@/components/nav'
import { requireUser } from '@/lib/supabase/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser()
  return (
    <div className="flex flex-col min-h-screen">
      <Nav email={user.email ?? ''} />
      {children}
    </div>
  )
}
