import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from './server'

/**
 * Auth context without a redirect — for API routes that answer 401 themselves.
 * React-cached so a layout and its page share one Supabase auth round trip.
 */
export const getAuthContext = cache(
  async (): Promise<{ supabase: SupabaseClient; user: User | null }> => {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return { supabase, user }
  },
)

/** Auth for pages and server actions: redirects to /login when signed out. */
export async function requireUser(): Promise<{ supabase: SupabaseClient; user: User }> {
  const { supabase, user } = await getAuthContext()
  if (!user) redirect('/login')
  return { supabase, user }
}

/** The user's saved day-boundary timezone (profiles.day_boundary_tz), or null when unset. */
export async function getUserTimezone(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('day_boundary_tz')
    .eq('id', userId)
    .single()
  return (profile?.day_boundary_tz as string | null) || null
}
