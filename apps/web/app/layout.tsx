import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Geist, Geist_Mono, Space_Grotesk } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });
const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: {
    default: 'SMSGecko — Virtual Numbers for OTP & Verification',
    template: '%s — SMSGecko',
  },
  description:
    'Buy virtual numbers for OTP & verification — fast activation, clean stock, global coverage. Use it via API or dashboard for WhatsApp, Telegram, Gmail, and more.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${geistMono.variable} ${display.variable} h-full`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <div className="page-backdrop" aria-hidden />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
