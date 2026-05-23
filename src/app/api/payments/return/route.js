import { NextResponse } from 'next/server';

/**
 * GET /api/payments/return
 * Redirect payment return requests to the webhook endpoint with all query params preserved.
 * @param {Request} request
 * @returns {Promise<NextResponse>}
 * @updated 2026-05-23
 */
export async function GET(request) {
  const { searchParams } = request.nextUrl;
  const params = new URLSearchParams(searchParams).toString();
  const redirectUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://9tripphuquoc.com'}/webhooks/payment${params ? '?' + params : ''}`;
  return NextResponse.redirect(redirectUrl, 307);
}
