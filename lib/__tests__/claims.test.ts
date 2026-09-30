import { describe, it, expect } from 'vitest'
import { userFromClaims } from '../supabase/claims'

describe('userFromClaims', () => {
  it('maps sub and email to the auth user', () => {
    expect(userFromClaims({ sub: 'u1', email: 'a@b.co' })).toEqual({ id: 'u1', email: 'a@b.co' })
  })

  it('leaves email undefined when the token has none', () => {
    expect(userFromClaims({ sub: 'u1' })).toEqual({ id: 'u1', email: undefined })
  })

  it('returns null without claims or a subject', () => {
    expect(userFromClaims(null)).toBeNull()
    expect(userFromClaims(undefined)).toBeNull()
    expect(userFromClaims({ sub: '' })).toBeNull()
  })
})
