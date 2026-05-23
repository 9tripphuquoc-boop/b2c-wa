import { NextResponse } from 'next/server';
import {
  sendBookingConfirmation,
  sendPaymentConfirmation,
  sendPaymentFailed,
  sendCancellationConfirmation,
  sendContactNotification,
  sendPasswordReset,
  sendPasswordChangedEmail,
} from '@9trip/shared/email/service';

/**
 * Map of template names to handler functions.
 * Each handler receives `data` from the request body.
 * @type {Record<string, Function>}
 */
const TEMPLATE_HANDLERS = {
  'booking-confirmation': (data) => sendBookingConfirmation(data.booking),
  'payment-confirmation': (data) => sendPaymentConfirmation(data.booking),
  'payment-failed': (data) => sendPaymentFailed(data.booking),
  cancellation: (data) => sendCancellationConfirmation(data.booking, data.reason),
  'contact-form': (data) => sendContactNotification(data),
  'password-reset': (data) => sendPasswordReset(data.to, data.resetLink),
  'password-changed': (data) => sendPasswordChangedEmail(data.to, data.userName),
};

/**
 * POST /api/email/send
 * Dispatches email sending to the appropriate template handler.
 * @param {Request} request
 * @returns {Promise<NextResponse>}
 * @updated 2026-05-23
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { template, data } = body;

    if (!template || !data) {
      return NextResponse.json({ error: 'Missing template or data' }, { status: 400 });
    }

    const handler = TEMPLATE_HANDLERS[template];
    if (!handler) {
      return NextResponse.json(
        {
          error: `Unknown template: ${template}. Available: ${Object.keys(TEMPLATE_HANDLERS).join(', ')}`,
        },
        { status: 400 }
      );
    }

    const result = await handler(data);

    if (result.success) {
      return NextResponse.json({ success: true, messageId: result.messageId });
    } else {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
  } catch (err) {
    console.error('[Email Send] Error:', err.message);
    return NextResponse.json({ error: 'Không thể gửi email. Vui lòng thử lại sau.' }, { status: 500 });
  }
}
