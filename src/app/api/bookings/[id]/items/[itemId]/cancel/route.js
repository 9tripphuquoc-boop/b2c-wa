import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

/**
 * POST /api/bookings/[id]/items/[itemId]/cancel
 * Cancel a specific item within a booking.
 * @param {Request} request
 * @param {{ params: Promise<{ id: string, itemId: string }> }} context
 * @returns {Promise<NextResponse>}
 * @updated 2026-05-23
 */
export async function POST(request, { params }) {
  try {
    const { id, itemId } = await params;

    const bookingRef = adminDb.collection('bookings').doc(id);
    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const booking = bookingSnap.data();
    const items = booking.items || {};
    if (!items[itemId]) {
      return NextResponse.json({ error: 'Item not found in booking' }, { status: 404 });
    }

    items[itemId].status = 'cancelled';
    items[itemId].cancelledAt = new Date().toISOString();

    await bookingRef.update({
      items,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, message: 'Item cancelled successfully' });
  } catch (err) {
    console.error('[ItemCancel] Error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
