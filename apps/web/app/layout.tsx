import type { Metadata, Viewport } from 'next';
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

const SITE_URL = 'https://smsgecko.com';
const SITE_NAME = 'SMSGecko';
const DESCRIPTION =
  'Buy virtual numbers for OTP & SMS verification across 200+ countries and 1,000+ platforms — pay-per-use, instant delivery, developer-friendly API.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'SMSGecko — Virtual Numbers for OTP & Verification',
    template: '%s — SMSGecko',
  },
  description: DESCRIPTION,
  keywords: [
    'virtual number for OTP',
    'SMS verification API',
    'temporary phone number',
    'receive SMS online',
    'virtual number for WhatsApp',
    'virtual number for Telegram',
    'bulk SMS verification',
  ],
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  verification: { google: 'krc2GEwG_z_L9f1UQx-qQPidSAK3aLFGK-_1nUJX-sw' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: SITE_NAME,
    title: 'SMSGecko — Virtual Numbers for OTP & Verification',
    description: DESCRIPTION,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SMSGecko — Virtual Numbers for OTP & Verification',
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: '#07090b',
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icon`,
      description: DESCRIPTION,
    },
    {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: SITE_URL,
    },
  ],
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
        <Providers>
          {children}
          {/* <div className='text-center text-4xl'>
            Coming soon ...
          </div> */}
        </Providers>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
