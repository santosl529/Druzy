'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/supabase/auth'

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
