import {
  insertSession,
  listSessions,
  validateSessionPayload,
} from '@/lib/server-sessions';

function logApiError(operation: string, error: unknown) {
  console.error(
    JSON.stringify({
      level: 'error',
      service: 'nimble',
      operation,
      message: error instanceof Error ? error.message : 'Unknown error',
    }),
  );
}

export async function GET() {
  try {
    return Response.json({ sessions: await listSessions() });
  } catch (error) {
    logApiError('list_sessions', error);
    return Response.json(
      { error: 'History is temporarily unavailable.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = validateSessionPayload(await request.json());
    if (!payload)
      return Response.json(
        { error: 'Invalid session payload.' },
        { status: 400 },
      );
    const report = await insertSession(payload);
    return Response.json({ report }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('UNIQUE'))
      return Response.json(
        { error: 'Session already saved.' },
        { status: 409 },
      );
    logApiError('save_session', error);
    return Response.json(
      { error: 'The session could not be saved.' },
      { status: 500 },
    );
  }
}
