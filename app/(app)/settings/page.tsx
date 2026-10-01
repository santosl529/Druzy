import { requireUser, getUserTimezone } from '@/lib/supabase/auth'
import { logout } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { SettingsColorScheme } from '@/components/settings-color-scheme'
import { SettingsTimezone } from '@/components/settings-timezone'
import { SettingsRail } from '@/components/settings-rail'

const SECTIONS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'day-boundary', label: 'Day boundary' },
  { id: 'privacy', label: 'Data & privacy' },
  { id: 'account', label: 'Account' },
]

type Destination = 'account' | 'cloud' | 'local'

const DATA_FLOWS: { feature: string; to: string; kind: Destination; sent: string }[] = [
  {
    feature: 'Trackers & entries',
    to: 'Your Druzy account',
    kind: 'account',
    sent: 'Everything you log, stored in your Supabase database. Row-level security limits every table to your account.',
  },
  {
    feature: 'Assistant',
    to: 'AI model (cloud)',
    kind: 'cloud',
    sent: 'Your messages, tracker names and fields, plus the results Druzy computes when you ask a question or a chart (averages, trends, chart points). Not your raw log.',
  },
  {
    feature: 'Food photos',
    to: 'Vision model (cloud)',
    kind: 'cloud',
    sent: 'The photo and your optional context note, so it can estimate macros. Only the numbers you save are stored.',
  },
  {
    feature: 'Journal',
    to: 'This device only',
    kind: 'local',
    sent: 'Nothing. Photos and transcription stay on your machine (local Ollama). Only the text and fields you save are stored.',
  },
]

const PILL: Record<Destination, string> = {
  account: 'bg-primary/20 text-accent-text',
  cloud: 'bg-[#F0CC6A]/15 text-[#8F7426] dark:text-[#F0CC6A]',
  local: 'bg-[#3A9B6F]/18 text-[#2D7A57] dark:text-[#72D4A8]',
}

export default async function SettingsPage() {
  const { supabase, user } = await requireUser()
  const savedTimezone = await getUserTimezone(supabase, user.id)

  const card = 'rounded-2xl border bg-card px-[22px] py-5 flex flex-col gap-3.5 scroll-mt-6'
  const heading = (title: string, sub?: string) => (
    <div>
      <h2 className="font-heading text-base font-semibold">{title}</h2>
      {sub && <p className="text-[0.8rem] text-muted-foreground mt-1">{sub}</p>}
    </div>
  )

  return (
    <main className="max-w-6xl mx-auto w-full px-4 py-8 grid gap-8 md:grid-cols-[200px_minmax(0,1fr)] md:items-start">
      <div className="flex flex-col gap-4 md:sticky md:top-6">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Settings</h1>
        <SettingsRail sections={SECTIONS} />
      </div>

      <div className="flex flex-col gap-[18px] md:pt-[52px]">
        <section id="appearance" className={card}>
          {heading('Appearance', 'System follows your device’s light or dark setting.')}
          <SettingsColorScheme />
        </section>

        <section id="day-boundary" className={card}>
          {heading(
            'Day boundary',
            'Sets which calendar day an entry counts for. Used everywhere: logging, streaks, charts.',
          )}
          <SettingsTimezone savedTimezone={savedTimezone} />
        </section>

        <section id="privacy" className="rounded-2xl border bg-card overflow-hidden scroll-mt-6">
          <div className="px-[22px] pt-5 pb-3.5">
            {heading('What data goes where', 'A plain list of every place your data goes.')}
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-[170px_170px_minmax(0,1fr)] gap-4 border-t bg-muted/40 px-[22px] py-2 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                <span>Feature</span>
                <span>Goes to</span>
                <span>What&apos;s sent</span>
              </div>
              {DATA_FLOWS.map((d) => (
                <div key={d.feature} className="grid grid-cols-[170px_170px_minmax(0,1fr)] gap-4 border-t px-[22px] py-3 text-sm items-start">
                  <span className="font-medium">{d.feature}</span>
                  <span className={`justify-self-start rounded-full px-2.5 py-0.5 text-xs font-medium ${PILL[d.kind]}`}>{d.to}</span>
                  <span className="text-foreground/80">{d.sent}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="border-t px-[22px] py-3 text-xs text-muted-foreground">
            Druzy uses API-tier AI providers that don&apos;t train on inputs. Check your provider&apos;s current terms
            before logging anything sensitive.
          </p>
        </section>

        <section id="account" className={`${card} sm:flex-row sm:items-center`}>
          <div className="flex-1">
            {heading('Account', user.email ?? undefined)}
          </div>
          <form action={logout}>
            <Button type="submit" variant="outline" size="lg">
              Sign out
            </Button>
          </form>
        </section>
      </div>
    </main>
  )
}
