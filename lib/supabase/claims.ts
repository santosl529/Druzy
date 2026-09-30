/**
 * The signed-in user as the app uses it — just the fields read from the
 * verified access-token claims (getClaims), so auth needs no Supabase round trip.
 */
export interface AuthUser {
  id: string
  email: string | undefined
}

export function userFromClaims(claims: { sub?: string; email?: string } | null | undefined): AuthUser | null {
  if (!claims?.sub) return null
  return { id: claims.sub, email: claims.email }
}
