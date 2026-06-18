import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ColorSchemeProvider } from '@/components/color-scheme-provider'
import { COLOR_SCHEME_STORAGE_KEY } from '@/lib/color-scheme'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Druzy',
  description: 'Log and visualize your personal life — one tracker at a time.',
}

const colorSchemeScript = `(function(){try{var s=localStorage.getItem(${JSON.stringify(COLOR_SCHEME_STORAGE_KEY)});var r=document.documentElement;if(s==='dark')r.classList.add('dark');else if(s==='light')r.classList.add('light');}catch(e){}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: colorSchemeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ColorSchemeProvider>{children}</ColorSchemeProvider>
      </body>
    </html>
  )
}
