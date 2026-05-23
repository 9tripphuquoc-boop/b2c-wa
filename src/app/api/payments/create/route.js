import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { PaymentService } from '@/lib/payments/payment';
import { generateNextId } from '@9trip/shared/firebase/admin-helpers';
import { sendBookingConfirmation } from '@9trip/shared/email/service';

// Simple in-memory rate limiter (max 5 requests per 60s window)
const rateLimitMap = new Map();

/**
 * Check rate limit for a given key.
 * @param {string} key - Identifier (IP)
 * @param {number} windowMs - Time window in ms
 * @param {number} maxRequests - Max requests allowed in window
 * @returns {boolean} - true if allowed, false if rate limited
 */
function checkRateLimit(key, windowMs, maxRequests) {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.start > windowMs) {
    rateLimitMap.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= maxRequests;
}

/**
 * POST /api/payments/create
 * Create a booking and generate a payment URL for the selected gateway.
 * @param {Request} request
 * @returns {Promise<NextResponse>}
 * @updated 2026-05-23
 */
export async function POST(request) {
  try {
    // Rate limit check
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    if (!checkRateLimit(ip, 60000, 5)) {
      return NextResponse.json(
        { success: false, message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { gateway, amount, bookingData } = body;

    if (!amount || !gateway || !bookingData) {
      return NextResponse.json(
        { success: false, message: 'Thiếu thông tin bắt buộc' },
        { status: 400 }
      );
    }

    const orderId = await generateNextId(adminDb, 'bookings');
    const bookingRef = adminDb.collection('bookings').doc(orderId);

    const rawItems = bookingData.items || [];
    const items = Array.isArray(rawItems) ? rawItems : Object.values(rawItems);

    const total = items.reduce((sum, item) => sum + (item.total || 0), 0);

    const deposit = items.reduce((sum, item) => {
      const prepaidPct = item.prepaid || 0;
      return sum + (item.total || 0) * prepaidPct / 100;
    }, 0);

    const balance = total - deposit;

    const allOrder = items.length > 0 && items.every(item => (item.prepaid || 0) === 0);
    const prepaidType = allOrder ? 'order' : (deposit >= total ? 'full' : 'deposit');
    const status = allOrder ? 'ordered' : 'pending';

    let dueDate = null;
    if (allOrder) {
      dueDate = items[0]?.startDate || null;
    } else {
      dueDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    }

    const cleanContactInfo = {
      fullName: bookingData.contactInfo?.fullName || '',
      email: bookingData.contactInfo?.email || '',
      phone: bookingData.contactInfo?.phone || '',
      specialRequests: bookingData.contactInfo?.specialRequests || '',
    };

    const bookingDoc = {
      id: orderId,
      userId: bookingData.userId || '',
      bookingCode: bookingData.bookingCode || `9T-${orderId}`,
      items,
      startDate: items[0]?.startDate || null,
      endDate: items[0]?.endDate || null,
      adults: items[0]?.adults || 0,
      children: items[0]?.children || 0,
      payment: {
        prepaid: prepaidType,
        total: Math.round(total),
        deposit: Math.round(deposit),
        balance: Math.round(balance),
        gate: gateway.toUpperCase(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
      contactInfo: cleanContactInfo,
      status,
      dueDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await bookingRef.set(bookingDoc);

    let paymentUrl = '';
    const paymentPayload = { amount: Math.round(deposit || total), orderId };

    switch (gateway.toUpperCase()) {
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

    await bookingRef.update({ 'payment.paymentUrl': paymentUrl });

    sendBookingConfirmation(bookingDoc).catch(err => {
      console.error('[PaymentCreate] Email failed:', err.message);
    });

    return NextResponse.json({
      success: true,
      bookingId: orderId,
      bookingCode: bookingDoc.bookingCode,
      paymentUrl,
      total: Math.round(total),
      deposit: Math.round(deposit),
      balance: Math.round(balance),
      status,
    });
  } catch (error) {
    console.error('[API_PAYMENT_CREATE_ERROR]:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi hệ thống khi tạo đơn hàng' },
      { status: 500 }
    );
  }
}
