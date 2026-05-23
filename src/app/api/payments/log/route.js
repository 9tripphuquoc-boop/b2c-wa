import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

/**
 * POST /api/payments/log
 * Log a payment event to Firestore for auditing.
 * @param {Request} request
 * @returns {Promise<NextResponse>}
 * @updated 2026-05-23
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { gateway, bookingId, event, request: reqData, response: resData, error, timestamp } = body;

    if (!gateway || !event) {
      return NextResponse.json({ error: 'Missing gateway or event' }, { status: 400 });
    }

    await adminDb.collection('payment_logs').add({
      gateway,
      bookingId: bookingId || 'unknown',
      event,
      request: reqData || null,
      response: resData || null,
      error: error || null,
      timestamp: timestamp || new Date().toISOString(),
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[PaymentLog] Failed to write:', err.message);
    return NextResponse.json({ error: 'Failed to log payment event' }, { status: 500 });
  }
}
