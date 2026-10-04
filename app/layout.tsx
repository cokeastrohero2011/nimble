import type { Metadata } from 'next';
import './globals.css';
import './route-links.css';
import './amendment.css';

export const metadata: Metadata = {
  title: 'Nimble — 10 minutes of mental math',
  description: 'A focused daily mental-math speed training instrument.',
  applicationName: 'Nimble',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
