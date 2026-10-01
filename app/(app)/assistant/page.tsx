import { requireUser } from '@/lib/supabase/auth'
import { AssistantChat, type RailModule } from '@/components/assistant/chat'
import type { Module } from '@/lib/types'

export default async function AssistantPage() {
  const { supabase, user } = await requireUser()

  // Tracker names + fields for the "what the assistant sees" rail.
  const { data } = await supabase
    .from('modules')
    .select('id, name, crystal_type, fields, kind')
    .eq('user_id', user.id)
    .order('name')

  const modules: RailModule[] = ((data ?? []) as Pick<Module, 'id' | 'name' | 'crystal_type' | 'fields' | 'kind'>[]).map(
    (m) => ({
      id: m.id,
      name: m.name,
      crystalType: m.crystal_type,
      summary:
        m.kind === 'formula'
          ? 'formula'
          : m.fields.length <= 2
            ? m.fields.map((f) => f.unit ?? f.label.toLowerCase()).join(', ')
            : `${m.fields.length} fields`,
    }),
  )

  return <AssistantChat modules={modules} />
}
