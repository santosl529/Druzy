import { requireUser } from '@/lib/supabase/auth'
import { Nav } from '@/components/nav'
import { Separator } from '@/components/ui/separator'
import { SettingsColorScheme } from '@/components/settings-color-scheme'
import { SettingsTimezone } from '@/components/settings-timezone'
import { getProfile } from '@/app/actions/profile'

export default async function SettingsPage() {
  const { user } = await requireUser()

  const profile = await getProfile()

  return (
    <div className="flex flex-col min-h-screen">
      <Nav email={user.email ?? ''} />
      <main className="max-w-2xl mx-auto w-full px-4 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">{user.email}</p>
        </div>

        <Separator />

        {/* Appearance */}
        <section className="space-y-4">
          <h2 className="font-medium">Appearance</h2>
          <SettingsColorScheme />
        </section>

        <Separator />

        {/* Date & time */}
        <section className="space-y-4">
          <h2 className="font-medium">Date &amp; time</h2>
          <SettingsTimezone savedTimezone={profile?.day_boundary_tz ?? null} />
        </section>

        <Separator />

        {/* Data transparency */}
        <section className="space-y-3">
          <h2 className="font-medium">Data &amp; privacy</h2>
          <div className="text-sm text-muted-foreground space-y-2">
            <p><strong className="text-foreground">What stays on your device:</strong> Journal photos and transcription. The local model runs entirely on your machine — nothing is sent to any server.</p>
            <p><strong className="text-foreground">What goes to the cloud:</strong> Module schemas, logged entries, and charts are stored in your Supabase database. Food photos are sent to a cloud vision API for calorie estimation (this is the one accepted third-party data flow).</p>
            <p><strong className="text-foreground">Who can see your data:</strong> Only you. Row-level security scopes every table to your user ID. No social or sharing features are active.</p>
            <p><strong className="text-foreground">AI providers:</strong> We use API-tier providers that do not train on user inputs. Verify the current terms of your chosen provider before logging sensitive data.</p>
          </div>
        </section>
      </main>
    </div>
  )
}
