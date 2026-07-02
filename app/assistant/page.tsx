import { requireUser } from '@/lib/supabase/auth'
import { Nav } from '@/components/nav'
import { AssistantChat } from '@/components/assistant/chat'

export default async function AssistantPage() {
  const { user } = await requireUser()

  return (
    <div className="flex flex-col min-h-screen">
      <Nav email={user.email ?? ''} />
      <AssistantChat />
    </div>
  )
}
