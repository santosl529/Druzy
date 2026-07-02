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
