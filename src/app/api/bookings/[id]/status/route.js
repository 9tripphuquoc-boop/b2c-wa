import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

/**
 * GET /api/bookings/[id]/status
 * Fetch the status of a booking by ID.
 * @param {Request} request
 * @param {{ params: Promise<{ id: string }> }} context
 * @returns {Promise<NextResponse>}
 * @updated 2026-05-23
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Missing booking ID' }, { status: 400 });
    }

    const booking = await adminDb.collection('bookings').doc(id).get();

    if (!booking.exists) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const data = booking.data();
    return NextResponse.json({
      bookingId: id,
      status: data.status || 'pending',
      payment: data.payment || null,
    });
  } catch (err) {
    console.error('[BookingStatus] Error:', err.message);
    return NextResponse.json({ error: 'Failed to fetch booking status' }, { status: 500 });
  }
}
