import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { PaymentService } from '@/lib/payments/payment';

/**
 * POST /api/payments/retry
 * Retry payment with a new or existing gateway.
 * @param {Request} request
 * @returns {Promise<NextResponse>}
 * @updated 2026-05-23
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { bookingId, newGateway } = body;

    if (!bookingId) {
      return NextResponse.json(
        { success: false, message: 'Thiếu mã đơn hàng' },
        { status: 400 }
      );
    }

    const bookingRef = adminDb.collection('bookings').doc(bookingId);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      return NextResponse.json(
        { success: false, message: 'Không tìm thấy đơn hàng' },
        { status: 404 }
      );
    }

    const bookingData = bookingDoc.data();

    if (bookingData.status === 'paid') {
      return NextResponse.json(
        { success: false, message: 'Đơn hàng này đã được thanh toán!' },
        { status: 400 }
      );
    }

    const paymentInfo = bookingData.payment || {};
    const gatewayToUse = newGateway || paymentInfo.gate;
    const amount = paymentInfo.total || bookingData.pricing?.total;

    if (newGateway && newGateway !== paymentInfo.gate) {
      await bookingRef.update({ 'payment.gate': newGateway.toUpperCase() });
    }

    let paymentUrl = '';
    const paymentPayload = { amount, orderId: bookingId };

    switch (gatewayToUse.toUpperCase()) {
      case 'VNPAY':
        paymentUrl = PaymentService.createVNPayUrl(request, paymentPayload);
        break;
      case 'MOMO':
        paymentUrl = await PaymentService.createMoMoUrl(paymentPayload);
        break;
      case 'PAYPAL':
        paymentUrl = await PaymentService.createPayPalUrl(paymentPayload);
        break;
      default:
        return NextResponse.json(
          { success: false, message: 'Cổng thanh toán không hợp lệ' },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true, url: paymentUrl });
  } catch (error) {
    console.error('[API_RETRY_PAYMENT_ERROR]:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi hệ thống khi tạo lại thanh toán' },
      { status: 500 }
    );
  }
}
