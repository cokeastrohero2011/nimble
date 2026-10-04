import { calculateReport } from '@/lib/report';
import { getHistoricalResponses, getSession } from '@/lib/server-sessions';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(id))
    return Response.json({ error: 'Invalid session ID.' }, { status: 400 });
  try {
    const session = await getSession(id);
    if (!session)
      return Response.json({ error: 'Session not found.' }, { status: 404 });
    const historical = await getHistoricalResponses(id);
    return Response.json({ report: calculateReport(session, historical) });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'nimble',
        operation: 'get_session',
        sessionId: id,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
    return Response.json(
      { error: 'The report could not be loaded.' },
      { status: 500 },
    );
  }
}
