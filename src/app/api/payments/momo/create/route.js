import { NextResponse } from 'next/server';
import { PaymentService } from '@/lib/payments/payment';

/**
 * POST /api/payments/momo/create
 * Create a MoMo payment request.
 * @param {Request} request
 * @returns {Promise<NextResponse>}
 * @updated 2026-05-23
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { bookingId, amount } = body;

    if (!bookingId || !amount) {
      return NextResponse.json(
        { error: 'Missing bookingId or amount' },
        { status: 400 }
      );
    }

    const paymentPayload = { orderId: bookingId, amount: Math.round(amount) };

    const payUrl = await PaymentService.createMoMoUrl(paymentPayload);

    return NextResponse.json({ success: true, payUrl });
  } catch (error) {
    console.error('MoMo creation error:', error);
    return NextResponse.json(
      { error: 'Không thể tạo thanh toán MoMo. Vui lòng thử lại.' },
      { status: 500 }
    );
  }
}
