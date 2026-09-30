import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from './server'
import { userFromClaims, type AuthUser } from './claims'

/**
 * Auth context without a redirect — for API routes that answer 401 themselves.
 * getClaims verifies the access token locally against the project's
 * asymmetric signing key (JWKS cached in-process), so this costs no Auth
 * round trip. React-cached so a layout and its page share one check.
 */
export const getAuthContext = cache(
  async (): Promise<{ supabase: SupabaseClient; user: AuthUser | null }> => {
    const supabase = await createClient()
    const { data } = await supabase.auth.getClaims()
    return { supabase, user: userFromClaims(data?.claims) }
  },
)

/** Auth for pages and server actions: redirects to /login when signed out. */
export async function requireUser(): Promise<{ supabase: SupabaseClient; user: AuthUser }> {
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
