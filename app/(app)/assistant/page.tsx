import { requireUser } from '@/lib/supabase/auth'
import { AssistantChat } from '@/components/assistant/chat'

export default async function AssistantPage() {
  await requireUser()

  return <AssistantChat />
}
