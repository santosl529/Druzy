'use client'

import { useActionState, useState } from 'react'
import { login, signup } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { GeodeIcon } from '@/components/geode-icon'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [loginState, loginAction, loginPending] = useActionState(login, null)
  const [signupState, signupAction, signupPending] = useActionState(signup, null)

  const isLogin = mode === 'login'
  const action = isLogin ? loginAction : signupAction
  const pending = isLogin ? loginPending : signupPending
  const error = isLogin ? loginState?.error : signupState?.error

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <GeodeIcon crystalType="amethyst" openness={0.9} className="size-16 mb-2" />
      <h1 className="font-heading text-3xl font-bold tracking-tight">Druzy</h1>
      <p className="mb-6 text-muted-foreground">Log the shape of your days.</p>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{isLogin ? 'Sign in' : 'Create account'}</CardTitle>
          <CardDescription>
            {isLogin ? 'Enter your credentials to continue.' : 'Pick an email and password.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                minLength={6}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? (isLogin ? 'Signing in…' : 'Creating account…') : (isLogin ? 'Sign in' : 'Create account')}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              type="button"
              className="underline underline-offset-4 hover:text-foreground"
              onClick={() => setMode(isLogin ? 'signup' : 'login')}
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
