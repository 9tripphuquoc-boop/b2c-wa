import { NextResponse } from 'next/server';
import { createInventoryHoldAdmin } from '@/lib/firestore-admin';

/**
 * POST /api/availability/hold
 * Creates an inventory hold for a service during checkout.
 * @param {Request} request
 * @returns {Promise<NextResponse>}
 * @updated 2026-05-23
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { serviceId, serviceType, startDate, endDate, quantity, userId, roomId } = body;

    if (!serviceId || !serviceType || !startDate || !quantity || !userId) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields: serviceId, serviceType, startDate, quantity, userId' },
        { status: 400 }
      );
    }

    const holdId = await createInventoryHoldAdmin(
      serviceId,
      serviceType,
      startDate,
      endDate || null,
      quantity,
      userId,
      roomId
    );

    if (!holdId) {
      return NextResponse.json(
        { success: false, message: 'Không thể giữ chỗ. Vui lòng thử lại.' },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, holdId });
  } catch (error) {
    console.error('[API availability/hold] Error:', error.message);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
