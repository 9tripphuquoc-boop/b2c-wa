import { NextResponse } from 'next/server';
import { handlePaymentWebhook } from '@/lib/payments/webhook-handler';

/**
 * GET /api/webhooks/payment
 * Handles VNPay IPN callback (GET with query params).
 * @param {Request} request
 * @returns {Promise<NextResponse>}
 * @updated 2026-05-23
 */
export async function GET(request) {
  try {
    const { searchParams } = request.nextUrl;
    const gateway = searchParams.get('gateway');

    // Convert URLSearchParams to plain object for the handler
    const data = {};
    searchParams.forEach((value, key) => {
      data[key] = value;
    });

    const result = await handlePaymentWebhook(gateway, data, request.headers);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Payment webhook GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

/**
 * POST /api/webhooks/payment
 * Handles MoMo IPN and PayPal webhook callbacks (POST with JSON body).
 * @param {Request} request
 * @returns {Promise<NextResponse>}
 * @updated 2026-05-23
 */
export async function POST(request) {
  try {
    const { searchParams } = request.nextUrl;
    const gateway = searchParams.get('gateway');
    const body = await request.json();

    const result = await handlePaymentWebhook(gateway, body, request.headers);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Payment webhook POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
