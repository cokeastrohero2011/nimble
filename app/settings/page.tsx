import type { Metadata } from 'next';
import { SettingsRoute } from '@/components/nimble-routes';

export const metadata: Metadata = { title: 'Settings — Nimble' };

export default function SettingsPage() {
  return <SettingsRoute />;
}
