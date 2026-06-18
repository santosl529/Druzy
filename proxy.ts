import { createServerClient } from '@supabase/ssr'
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

  // Refresh the session — must call getUser, not getSession (which is unreliable server-side)
  let user = null
  let authCheckFailed = false
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
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
