import type { Metadata } from 'next';
import { AppHeader } from '@/components/AppHeader';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fraud Review Queue',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-sm text-slate-900 antialiased">
        <AppHeader />
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
