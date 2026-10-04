import type { Metadata } from 'next';
import { ReportRoute } from '@/components/nimble-routes';

export const metadata: Metadata = { title: 'Daily Report — Nimble' };

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReportRoute id={id} />;
}
