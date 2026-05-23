import { NextResponse } from 'next/server';

const ERP_BASE = '/api/webhooks/erp';

/**
 * POST /api/webhooks/erp
 * Forward ERP webhook payload to the canonical ERP handler.
 * @param {Request} request
 * @returns {Promise<NextResponse>}
 * @updated 2026-05-23
 */
export async function POST(request) {
  try {
    const body = await request.json();
    if (!body || !body.id) {
      return NextResponse.json(
        { error: "Payload must include 'id' (document key)" },
        { status: 400 }
      );
    }

    const { searchParams } = request.nextUrl;
    const secret = searchParams.get('secret') || process.env.ERP_WEBHOOK_SECRET || '';

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL || 'https://9tripphuquoc.com'}${ERP_BASE}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-erp-secret': secret },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error('[ERP Webhook] Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
