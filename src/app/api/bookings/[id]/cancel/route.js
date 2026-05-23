import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { sendCancellationConfirmation } from '@9trip/shared/email/service';

/**
 * POST /api/bookings/[id]/cancel
 * Cancel an entire booking.
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 * @returns {Promise<NextResponse>}
 * @updated 2026-05-23
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    let reason;
    try {
      const body = await request.json();
      reason = body.reason;
    } catch {
      reason = undefined;
    }

    const bookingRef = adminDb.collection('bookings').doc(id);
    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const booking = bookingSnap.data();
    if (booking.status === 'canceled') {
      return NextResponse.json({ error: 'Booking already cancelled' }, { status: 400 });
    }

    await bookingRef.update({
      status: 'canceled',
      cancelledAt: new Date().toISOString(),
      cancellationReason: reason || 'Không có lý do',
      updatedAt: new Date().toISOString(),
    });

    const fullBooking = { id, ...booking, status: 'canceled', cancellationReason: reason || 'Không có lý do' };
    sendCancellationConfirmation(fullBooking, reason || 'Không có lý do').catch(err =>
      console.error('[Cancel] Cancellation email failed:', err.message)
    );

    return NextResponse.json({ success: true, message: 'Booking cancelled successfully' });
  } catch (err) {
    console.error('[Cancel] Error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
