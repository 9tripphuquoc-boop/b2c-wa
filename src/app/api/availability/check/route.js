import { NextResponse } from 'next/server';
import { getRealAvailabilityAdmin } from '@/lib/firestore-admin';

/**
 * POST /api/availability/check
 * Checks real-time availability for a service on a given date.
 * @param {Request} request
 * @returns {Promise<NextResponse>}
 * @updated 2026-05-23
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { serviceId, serviceType, startDate, roomId } = body;

    if (!serviceId || !serviceType || !startDate) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields: serviceId, serviceType, startDate' },
        { status: 400 }
      );
    }

    const availability = await getRealAvailabilityAdmin(serviceId, serviceType, startDate, roomId);
    return NextResponse.json({ success: true, availability });
  } catch (error) {
    console.error('[API availability/check] Error:', error.message);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
