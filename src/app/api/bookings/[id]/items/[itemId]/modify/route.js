import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

/**
 * POST /api/bookings/[id]/items/[itemId]/modify
 * Modify an item within a booking (dates, quantity) and recalculate pricing.
 * @param {Request} request
 * @param {{ params: Promise<{ id: string, itemId: string }> }} context
 * @returns {Promise<NextResponse>}
 * @updated 2026-05-23
 */
export async function POST(request, { params }) {
  try {
    const { id, itemId } = await params;
    const body = await request.json();
    const { startDate, endDate, quantity } = body;

    const bookingRef = adminDb.collection('bookings').doc(id);
    const bookingSnap = await bookingRef.get();
    const booking = bookingSnap.data();

    if (!booking || !booking.items || !booking.items[itemId]) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const item = booking.items[itemId];

    let nights = 1;
    if (endDate && startDate) {
      const ms = new Date(endDate) - new Date(startDate);
      nights = Math.max(1, Math.round(ms / 86400000));
    } else if (item.serviceType === 'hotel_room' && item.endDate && item.startDate) {
      const ms = new Date(item.endDate) - new Date(item.startDate);
      nights = Math.max(1, Math.round(ms / 86400000));
    }

    const newQty = quantity || item.rooms || item.adults || 1;
    const newTotal = (item.basePrice || 0) * nights * newQty;

    const updatedItem = {
      ...item,
      startDate: startDate || item.startDate,
      endDate: endDate || item.endDate,
      total: newTotal,
    };

    if (item.serviceType === 'hotel_room') {
      updatedItem.rooms = newQty;
    } else {
      updatedItem.adults = newQty;
    }

    const updatedItems = { ...booking.items, [itemId]: updatedItem };

    let newSubtotal = 0;
    Object.values(updatedItems).forEach(i => {
      newSubtotal += i.total || 0;
    });

    const newTax = newSubtotal * 0.08;
    const newTotalBooking = newSubtotal + newTax - (booking.pricing?.discount || 0);

    const updatedPricing = {
      ...booking.pricing,
      subtotal: newSubtotal,
      tax: newTax,
      total: Math.max(0, newTotalBooking),
    };

    await bookingRef.update({
      items: updatedItems,
      pricing: updatedPricing,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, updatedPricing, item: updatedItem });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
