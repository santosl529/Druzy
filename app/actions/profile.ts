'use server'

import { revalidatePath } from 'next/cache'
import { requireUser, getAuthContext } from '@/lib/supabase/auth'
import type { Profile } from '@/lib/types'

export async function getProfile(): Promise<Profile | null> {
  const { supabase, user } = await getAuthContext()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (data as Profile | null)
}

export async function updateDayBoundaryTz(timezone: string): Promise<{ error: string } | void> {
  const { supabase, user } = await requireUser()

  // Basic IANA timezone validation — the real check happens in the browser's Intl API.
  if (!timezone || timezone.length > 60 || !/^[A-Za-z_]+(?:\/[A-Za-z_]+)*$/.test(timezone)) {
    return { error: 'Invalid timezone format.' }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ day_boundary_tz: timezone })
    .eq('id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/settings')
}
