import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import 'lenis/dist/lenis.css';
import './globals.css';
import { Motion } from '@/components/Motion';

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' });

export const metadata: Metadata = {
  title: 'Datowl — IDE base de données',
  description: "Datowl, l'IDE base de données rapide pour PostgreSQL et ClickHouse. Gratuit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={outfit.variable}>
      <body>
        {children}
        <Motion />
      </body>
    </html>
  );
}
