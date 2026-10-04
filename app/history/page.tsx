import type { Metadata } from 'next';
import { HistoryRoute } from '@/components/nimble-routes';

export const metadata: Metadata = { title: 'History — Nimble' };

export default function HistoryPage() {
  return <HistoryRoute />;
}
