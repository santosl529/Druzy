import { createServerClient } from '@supabase/ssr'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the session and verify it. getClaims (not getSession, which trusts
  // the cookie unverified) checks the JWT signature locally against the
  // project's asymmetric signing key — no Auth round trip unless it refreshes.
  let user = null
  let authCheckFailed = false
  try {
    const { data, error } = await supabase.auth.getClaims()
    if (isAuthRetryableFetchError(error)) throw error
    user = data?.claims.sub ? data.claims : null
  } catch (error) {
    // Transient network blips during token refresh (AuthRetryableFetchError, status 0)
    // should not log the user out — let the request through with existing cookies.
    authCheckFailed = true
    console.warn('[proxy] Supabase auth refresh failed:', error)
  }

  const { pathname } = request.nextUrl

  const isAuthPath = pathname === '/login' || pathname === '/signup'

  if (authCheckFailed) {
    return supabaseResponse
  }

  if (!user && !isAuthPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isAuthPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
