/**
 * Payment webhook handler — normalizes payload from various gateways,
 * verifies signatures, updates booking status in Firestore with idempotency.
 *
 * Handles: VNPay (GET IPN), MoMo (POST IPN), PayPal (POST webhook)
 *
 * Migrated from functions/src/webhooks/payment.js to Next.js-compatible format.
 * @updated 2026-05-23
 */

import crypto from 'node:crypto';
import { adminDb } from '@/lib/firebase-admin';

// ─── Configuration (from environment) ──────────────────────────────────

const VNPAY_HASH_SECRET = process.env.VNPAY_HASH_SECRET || '';
const MOMO_ACCESS_KEY = process.env.MOMO_ACCESS_KEY || '';
const MOMO_SECRET_KEY = process.env.MOMO_SECRET_KEY || '';
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || '';
const PAYPAL_API_BASE = PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

// ─── ERP Configuration ──────────────────────────────────────────────────
const ERP_BASE_URL = process.env.ERP_BASE_URL || 'https://erp.9tripphuquoc.com';
const ERP_WEBHOOK_SECRET = process.env.ERP_WEBHOOK_SECRET || '';

let cachedPayPalToken = null;

// ─── Signature Verification ────────────────────────────────────────────

/**
 * Verify VNPay IPN signature (HMAC SHA512).
 * @param {Object} params - Query params from VNPay callback
 * @returns {boolean}
 */
function verifyVNPaySignature(params) {
  const receivedHash = params.vnp_SecureHash;
  const paramsToHash = {};
  for (const [key, val] of Object.entries(params)) {
    if (key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType' && val !== undefined && val !== '') {
      paramsToHash[key] = val;
    }
  }

  // Sort keys alphabetically, build query string, compute HMAC SHA512
  const sortedKeys = Object.keys(paramsToHash).sort();
  const query = sortedKeys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(paramsToHash[k]))}`).join('&');
  const computedHash = crypto.createHmac('sha512', VNPAY_HASH_SECRET)
    .update(Buffer.from(query, 'utf-8'))
    .digest('hex')
    .toUpperCase();

  return computedHash === receivedHash;
}

/**
 * Verify MoMo IPN signature (HMAC SHA256).
 * @param {Object} payload - MoMo IPN callback body
 * @returns {boolean}
 */
function verifyMomoSignature(payload) {
  const { signature, ...rest } = payload;
  if (!signature) return false;

  const keys = Object.keys(rest).sort();
  const rawSignature = keys.map((k) => `${k}=${rest[k]}`).join('&');
  const computedSig = crypto.createHmac('sha256', MOMO_SECRET_KEY)
    .update(rawSignature, 'utf-8')
    .digest('hex');

  return computedSig === signature;
}

/**
 * Get PayPal OAuth2 access token (cached).
 * @returns {Promise<string>}
 */
async function getPayPalAccessToken() {
  if (cachedPayPalToken && cachedPayPalToken.expiresAt > Date.now() + 60000) {
    return cachedPayPalToken.token;
  }

  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${auth}` },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`PayPal auth failed: ${err.error_description || response.statusText}`);
  }

  const data = await response.json();
  cachedPayPalToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return cachedPayPalToken.token;
}

/**
 * Verify PayPal webhook signature via PayPal API.
 * @param {Headers} headers - Request headers
 * @param {Object} body - Parsed webhook body
 * @returns {Promise<boolean>}
 */
async function verifyPayPalSignature(headers, body) {
  try {
    const token = await getPayPalAccessToken();

    const verifyResponse = await fetch(
      `${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          auth_algo: headers.get('paypal-auth-algo') || '',
          cert_url: headers.get('paypal-cert-url') || '',
          transmission_id: headers.get('paypal-transmission-id') || '',
          transmission_sig: headers.get('paypal-transmission-sig') || '',
          transmission_time: headers.get('paypal-transmission-time') || '',
          webhook_id: PAYPAL_WEBHOOK_ID,
          webhook_event: body,
        }),
      }
    );

    if (!verifyResponse.ok) {
      console.warn('[PayPal] Webhook verify API returned non-OK:', verifyResponse.status);
      return PAYPAL_MODE !== 'live'; // Accept in sandbox if verification endpoint fails
    }

    const result = await verifyResponse.json();
    return result.verification_status === 'SUCCESS';
  } catch (err) {
    console.error('[PayPal] Webhook verification error:', err.message);
    return PAYPAL_MODE !== 'live'; // Accept in sandbox on network errors
  }
}

// ─── Payload Normalization ─────────────────────────────────────────────

/**
 * Normalize gateway-specific payload to a standard format.
 * @param {string} gateway
 * @param {Object} body
 * @returns {{ bookingId: string, transactionId: string, status: string, amount: number, currency: string }}
 */
function normalizePayload(gateway, body) {
  switch (gateway) {
    case 'vnpay':
      return {
        bookingId: body.vnp_TxnRef || body.bookingId || '',
        transactionId: body.vnp_TransactionNo || body.transactionId || '',
        status: body.vnp_ResponseCode === '00' ? 'paid' : 'failed',
        amount: parseInt(body.vnp_Amount || '0', 10) / 100,
        currency: 'VND',
      };

    case 'momo':
      return {
        bookingId: body.orderId || body.bookingId || '',
        transactionId: String(body.transId || body.transactionId || ''),
        status: body.resultCode === 0 ? 'paid' : 'failed',
        amount: body.amount || 0,
        currency: 'VND',
      };

    case 'paypal':
      return {
        bookingId: body.resource?.custom_id || body.bookingId || '',
        transactionId: body.resource?.id || body.transactionId || '',
        status: body.event_type === 'PAYMENT.CAPTURE.COMPLETED' || body.status === 'COMPLETED'
          ? 'paid' : 'failed',
        amount: parseFloat(body.resource?.amount?.value || '0'),
        currency: (body.resource?.amount?.currency_code || 'USD').toUpperCase(),
      };

    default:
      throw new Error(`Unsupported gateway: ${gateway}`);
  }
}

// ─── Idempotency ───────────────────────────────────────────────────────

/**
 * Check if a transaction has already been processed (idempotency guard).
 * @param {string} transactionId
 * @param {string} gateway
 * @returns {Promise<boolean>}
 */
async function isTransactionProcessed(transactionId, gateway) {
  if (!transactionId) return false;
  const snapshot = await adminDb.collection('payment_logs')
    .where('transactionId', '==', transactionId)
    .where('gateway', '==', gateway)
    .where('event', '==', 'ipn')
    .limit(1)
    .get();
  return !snapshot.empty;
}

/**
 * Log a payment event to Firestore for auditing and idempotency.
 * @param {Object} logData
 */
async function logPaymentEvent(logData) {
  try {
    await adminDb.collection('payment_logs').add({
      ...logData,
      createdAt: new Date(),
    });
  } catch (err) {
    console.warn('[payment] Failed to write payment log:', err.message);
  }
}

// ─── ERP Forwarding ─────────────────────────────────────────────────────

/**
 * Forward booking data to ERP after successful payment.
 * @param {string} bookingId
 */
async function forwardToERP(bookingId) {
  try {
    const snap = await adminDb.collection('bookings').doc(bookingId).get();
    if (!snap.exists) return;

    const booking = snap.data();
    const forwardUrl = new URL('/api/new-booking', ERP_BASE_URL);
    forwardUrl.searchParams.set('action', 'forward');
    forwardUrl.searchParams.set('event', 'new-booking');

    const response = await fetch(forwardUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-erp-secret': ERP_WEBHOOK_SECRET,
      },
      body: JSON.stringify({ id: bookingId, ...booking }),
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      console.log(`[payment] ✅ ERP forward success for booking ${bookingId}`);
      await adminDb.collection('bookings').doc(bookingId).update({
        erpSyncStatus: 'synced',
        erpSyncedAt: new Date(),
      });
    } else {
      console.warn(`[payment] ERP forward returned ${response.status} for booking ${bookingId}`);
      await adminDb.collection('bookings').doc(bookingId).update({
        erpSyncStatus: 'failed',
        erpSyncError: `HTTP ${response.status}`,
      });
    }
  } catch (err) {
    console.error(`[payment] ERP forward failed for booking ${bookingId}:`, err.message);
    try {
      await adminDb.collection('bookings').doc(bookingId).update({
        erpSyncStatus: 'failed',
        erpSyncError: err.message,
      });
    } catch (_) { /* best-effort */ }
  }
}

// ─── Main Webhook Handler ──────────────────────────────────────────────

/**
 * Handle payment webhook — verify signature, normalize, update booking with idempotency.
 *
 * @param {string} gateway - Payment gateway identifier (vnpay, momo, paypal)
 * @param {Object} data - Parsed request data (query params for GET, JSON body for POST)
 * @param {Headers} headers - Request headers (for PayPal verification)
 * @returns {Promise<Object>} Response object with gateway-specific codes
 */
export async function handlePaymentWebhook(gateway, data, headers) {
  if (!gateway) {
    throw new Error("Missing 'gateway' query parameter");
  }

  const startTime = Date.now();
  let payment;

  try {
    // ── 1. Verify signature ──────────────────────────────────────────
    let isValid = false;

    switch (gateway) {
      case 'vnpay': {
        // VNPay IPN is GET with query params (data is URLSearchParams converted to plain object)
        isValid = verifyVNPaySignature(data);
        if (!isValid) {
          await logPaymentEvent({
            gateway, bookingId: data.vnp_TxnRef || 'unknown',
            event: 'ipn', error: 'Invalid VNPay signature',
            request: JSON.stringify(data), duration: Date.now() - startTime,
          });
          return { RspCode: '97', Message: 'Invalid signature' };
        }
        payment = normalizePayload(gateway, data);
        break;
      }

      case 'momo': {
        // MoMo IPN is POST with JSON body
        isValid = verifyMomoSignature(data);
        if (!isValid) {
          await logPaymentEvent({
            gateway, bookingId: data.orderId || 'unknown',
            event: 'ipn', error: 'Invalid MoMo signature',
            request: JSON.stringify(data), duration: Date.now() - startTime,
          });
          return { received: false, message: 'Invalid signature' };
        }
        payment = normalizePayload(gateway, data);
        break;
      }

      case 'paypal': {
        // PayPal webhook is POST with JSON body + headers
        isValid = await verifyPayPalSignature(headers, data);
        if (!isValid) {
          await logPaymentEvent({
            gateway, bookingId: data.resource?.custom_id || 'unknown',
            event: 'ipn', error: 'Invalid PayPal signature',
            request: JSON.stringify(data), duration: Date.now() - startTime,
          });
          return { received: false, message: 'Invalid signature' };
        }
        payment = normalizePayload(gateway, data);
        break;
      }

      default:
        throw new Error(`Unsupported gateway: ${gateway}`);
    }

    // ── 2. Validate bookingId ────────────────────────────────────────
    if (!payment.bookingId) {
      await logPaymentEvent({
        gateway, bookingId: 'unknown',
        event: 'ipn', error: 'Missing bookingId',
        request: JSON.stringify(data), duration: Date.now() - startTime,
      });
      return gateway === 'vnpay'
        ? { RspCode: '01', Message: 'Order not found' }
        : { received: false, message: 'Missing booking ID' };
    }

    // ── 3. Idempotency check ─────────────────────────────────────────
    const alreadyProcessed = await isTransactionProcessed(payment.transactionId, gateway);
    if (alreadyProcessed) {
      console.log(`[payment] Transaction ${payment.transactionId} (${gateway}) already processed — skipping`);
      return gateway === 'vnpay'
        ? { RspCode: '02', Message: 'Order already confirmed' }
        : { received: true, message: 'Already processed' };
    }

    // ── 4. Get booking ───────────────────────────────────────────────
    const bookingRef = adminDb.collection('bookings').doc(payment.bookingId);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      await logPaymentEvent({
        gateway, bookingId: payment.bookingId, transactionId: payment.transactionId,
        event: 'ipn', error: 'Booking not found', duration: Date.now() - startTime,
      });
      return gateway === 'vnpay'
        ? { RspCode: '01', Message: 'Order not found' }
        : { received: false, message: 'Booking not found' };
    }

    const booking = bookingDoc.data();

    // ── 5. Update booking status ─────────────────────────────────────
    const now = new Date();
    const updateData = {
      paymentStatus: payment.status,
      paymentGateway: gateway,
      transactionId: payment.transactionId,
      updatedAt: now,
    };

    if (payment.status === 'paid') {
      updateData.status = 'paid';
      updateData.bookingStatus = 'confirmed';
      updateData.paidAt = now;
      updateData.paidAmount = payment.amount;
      updateData.currency = payment.currency;
    } else {
      updateData.status = 'payment_failed';
    }

    await bookingRef.update(updateData);

    // ── 6. Forward to ERP ─────────────────────────────────────────────
    if (payment.status === 'paid') {
      forwardToERP(payment.bookingId).catch((err) => {
        console.error(`[payment] ERP forward error (non-blocking):`, err.message);
      });
    }

    // ── 7. Release inventory hold ─────────────────────────────────────
    if (payment.status === 'paid' && booking.inventoryHoldId) {
      try {
        await adminDb.collection('inventory_holds').doc(booking.inventoryHoldId).delete();
        console.log(`[payment] Released inventory hold ${booking.inventoryHoldId}`);
      } catch (err) {
        console.warn(`[payment] Failed to release hold ${booking.inventoryHoldId}:`, err.message);
      }
    }

    // ── 8. Log success ───────────────────────────────────────────────
    await logPaymentEvent({
      gateway,
      bookingId: payment.bookingId,
      transactionId: payment.transactionId,
      event: 'ipn',
      request: JSON.stringify(data),
      response: JSON.stringify({ status: payment.status, amount: payment.amount }),
      duration: Date.now() - startTime,
    });

    console.log(`[payment] Booking ${payment.bookingId} → ${payment.status} via ${gateway} (txn: ${payment.transactionId})`);

    return gateway === 'vnpay'
      ? { RspCode: '00', Message: 'Confirm Success' }
      : { received: true };

  } catch (err) {
    console.error(`[payment:${gateway}] Unhandled error:`, err.message);

    await logPaymentEvent({
      gateway,
      bookingId: payment?.bookingId || 'unknown',
      event: 'ipn',
      error: err.message,
      duration: Date.now() - startTime,
    }).catch(() => {});

    return gateway === 'vnpay'
      ? { RspCode: '99', Message: 'Unknown error' }
      : { received: false, message: 'Internal error' };
  }
}
