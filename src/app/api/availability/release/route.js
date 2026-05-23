import { NextResponse } from 'next/server';
import { releaseInventoryHoldAdmin } from '@/lib/firestore-admin';

/**
 * POST /api/availability/release
 * Releases an inventory hold (e.g. on payment timeout or user cancel).
 * @param {Request} request
 * @returns {Promise<NextResponse>}
 * @updated 2026-05-23
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { holdId } = body;

    if (!holdId) {
      return NextResponse.json(
        { success: false, message: 'Missing required field: holdId' },
        { status: 400 }
      );
    }

    const released = await releaseInventoryHoldAdmin(holdId);

    if (!released) {
      return NextResponse.json(
        { success: false, message: 'Không thể giải phóng giữ chỗ.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API availability/release] Error:', error.message);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
