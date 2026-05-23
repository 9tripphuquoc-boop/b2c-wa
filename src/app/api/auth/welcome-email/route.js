import { NextResponse } from 'next/server';
import { sendWelcomeEmail } from '@9trip/shared/email/service';

/**
 * POST /api/auth/welcome-email
 * Sends a welcome email to a newly registered user.
 * @param {Request} request
 * @returns {Promise<NextResponse>}
 * @updated 2026-05-23
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { email, userName } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const result = await sendWelcomeEmail(email, userName);

    if (result.success) {
      console.log(`[Welcome Email] Sent to ${email}`);
      return NextResponse.json({ success: true, messageId: result.messageId });
    } else {
      console.error(`[Welcome Email] Failed to send to ${email}:`, result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
  } catch (err) {
    console.error('[Welcome Email] Error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
