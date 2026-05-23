import { NextResponse } from 'next/server';

const NEW_BASE = '/api/webhooks/erp';
const validEvents = ['new-customer', 'cancel-booking', 'update-booking', 'new-booking', 'update-account'];

/**
 * POST /api/webhooks/erp/[...eventPath]
 * Catch-all handler for legacy ERP webhook event paths.
 * Validates the event type and forwards to the canonical ERP endpoint.
 * @param {Request} request
 * @param {{ params: Promise<{ eventPath: string[] }> }} context
 * @returns {Promise<NextResponse>}
 * @updated 2026-05-23
 */
export async function POST(request, { params }) {
  try {
    const { eventPath } = await params;
    const eventType = eventPath.join('/').replace(/\/$/, '');

    if (!validEvents.includes(eventType)) {
      return NextResponse.json(
        { error: `Invalid event type: ${eventType}`, validEvents },
        { status: 400 }
      );
    }

    const body = await request.json();
    if (!body || !body.id) {
      return NextResponse.json(
        { error: "Payload must include 'id' (document key)" },
        { status: 400 }
      );
    }

    const url = request.nextUrl;
    // Build forward URL using the request's origin
    const forwardUrl = new URL(NEW_BASE, url.origin);
    forwardUrl.searchParams.set('action', 'forward');
    forwardUrl.searchParams.set('event', eventType);

    const { searchParams } = url;
    const secret = searchParams.get('secret') || process.env.ERP_WEBHOOK_SECRET || '';
    if (!searchParams.has('secret')) {
      forwardUrl.searchParams.set('secret', secret);
    }

    const response = await fetch(forwardUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-erp-secret': secret },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error('[Legacy ERP Webhook] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
