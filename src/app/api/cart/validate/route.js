import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

/**
 * POST /api/cart/validate
 * Validates cart items against Firestore, applies coupon discounts,
 * and returns calculated pricing (subtotal, tax, coupon discount, total).
 * @param {Request} request
 * @returns {Promise<NextResponse>}
 * @updated 2026-05-23
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { items, couponCode } = body;

    if (!items || items.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Giỏ hàng trống' },
        { status: 400 }
      );
    }

    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      let collectionName = '';
      switch (item.serviceType) {
        case 'tour': collectionName = 'tours'; break;
        case 'hotel': collectionName = 'rooms'; break;
        case 'activity': collectionName = 'activities'; break;
        default:
          return NextResponse.json(
            { success: false, message: `Loại dịch vụ không hợp lệ: ${item.serviceType}` },
            { status: 400 }
          );
      }

      const docRef = adminDb.collection(collectionName).doc(item.serviceId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return NextResponse.json(
          { success: false, message: `Dịch vụ ${item.serviceId} không còn tồn tại` },
          { status: 404 }
        );
      }

      const dbData = docSnap.data();

      const adultPrice = dbData.adultPrice || dbData.price || 0;
      const childPrice = dbData.childPrice || 0;
      const infantPrice = dbData.infantPrice || 0;
      const discountPercent = dbData.discountPercent || 0;

      const adults = item.adults || 1;
      const children = item.children || 0;
      const infants = item.infants || 0;

      const baseTotal = (adultPrice * adults) + (childPrice * children) + (infantPrice * infants);
      const itemDiscountAmount = baseTotal * (discountPercent / 100);
      const finalTotal = baseTotal - itemDiscountAmount;

      subtotal += finalTotal;

      validatedItems.push({
        ...item,
        dbPrice: {
          baseTotal,
          discountAmount: itemDiscountAmount,
          finalTotal,
        },
        name: dbData.name || item.name || '',
        thumbnail: dbData.thumbnail || item.thumbnail || '',
      });
    }

    let couponDiscount = 0;
    if (couponCode) {
      const couponSnap = await adminDb.collection('coupons')
        .where('code', '==', couponCode.toUpperCase())
        .limit(1)
        .get();

      if (!couponSnap.empty) {
        const coupon = couponSnap.docs[0].data();
        const now = new Date();

        if (coupon.expiresAt && now > new Date(coupon.expiresAt)) {
          return NextResponse.json(
            { success: false, message: 'Mã giảm giá đã hết hạn' },
            { status: 400 }
          );
        }
        if (coupon.minOrder && subtotal < coupon.minOrder) {
          return NextResponse.json(
            { success: false, message: `Đơn hàng tối thiểu ${coupon.minOrder}đ để áp dụng mã` },
            { status: 400 }
          );
        }
        if (coupon.type === 'percent') {
          couponDiscount = Math.round(subtotal * (coupon.value / 100));
        } else {
          couponDiscount = coupon.value;
        }
      } else {
        return NextResponse.json(
          { success: false, message: 'Mã giảm giá không hợp lệ' },
          { status: 400 }
        );
      }
    }

    const tax = subtotal * 0.08;
    const total = Math.max(0, subtotal + tax - couponDiscount);

    return NextResponse.json({
      success: true,
      items: validatedItems,
      pricing: {
        subtotal: Math.round(subtotal),
        tax: Math.round(tax),
        couponDiscount: Math.round(couponDiscount),
        total: Math.round(total),
      },
    });
  } catch (error) {
    console.error('[Cart Validate] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi xác thực giỏ hàng' },
      { status: 500 }
    );
  }
}
