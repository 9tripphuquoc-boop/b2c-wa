/**
 * Firebase Cloud Functions entry point.
 *
 * All HTTP API routes have been migrated to Next.js App Router (App Hosting).
 * This Cloud Functions environment is now dedicated exclusively to:
 * - Emily AI Chatbot (Callable function)
 * - Scheduled cron jobs (Cleanup tasks)
 */

process.setMaxListeners(0);
import 'dotenv/config';
import { setGlobalOptions } from 'firebase-functions/v2';

setGlobalOptions({
	maxInstances: 10,
	timeoutSeconds: 300,
	memory: '256MiB',
});

import { adminDb } from './src/lib/firebase-admin.js';
import '@9trip/shared/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall } from 'firebase-functions/v2/https';
import { cleanupExpiredHolds as cleanupHolds, cancelAbandonedBookings as cancelBookings } from './src/scheduled/cleanup.js';
import { handleChat } from './emily/index.js';

// ─── Scheduled Tasks ──────────────────────────────────────────────────

/**
 * Cleanup expired inventory holds — every 5 minutes.
 */
export const cleanupExpiredHolds = onSchedule({ schedule: 'every 5 minutes', region: 'asia-southeast1' }, async () => {
	await cleanupHolds(adminDb);
});

/**
 * Cancel abandoned unpaid bookings — every hour.
 */
export const cancelAbandonedBookings = onSchedule({ schedule: 'every 60 minutes', region: 'asia-southeast1' }, async () => {
	await cancelBookings(adminDb);
});

// ─── Emily Chat ───────────────────────────────────────────────────────

/**
 * Emily chat — AI customer support chatbot.
 * Trigger: Callable function (chatWithEmily)
 */
export const chatWithEmily = onCall({ region: 'asia-southeast1' }, async (request) => {
  return await handleChat(request);
});

// ─── Triggers ────────────────────────────────────────────────────────

export { onUserCreatedV2, onPasswordChangedV2, onUserDeletedV2 } from './src/triggers/users.js';
export { onBookingCreatedV2, onBookingPaidV2, onBookingCancelledV2, onBookingModifiedV2 } from './src/triggers/bookings.js';

