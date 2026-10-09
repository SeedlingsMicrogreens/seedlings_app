import { clearPendingPaymentAttempt, getPendingPaymentAttempt } from './paymentAttemptStore';
import { verifyCashfreePayment } from './paymentService';
import { useAppStore } from '../../store/appStore';

let reconciliationRunning = false;

/**
 * Reconciles the last Mobile payment attempt after app restart/focus.
 * The server is authoritative; the local marker only tells Mobile what to check.
 */
export async function reconcilePendingPayment() {
  if (reconciliationRunning) return null;
  reconciliationRunning = true;
  try {
    const attempt = await getPendingPaymentAttempt();
    if (!attempt?.cashfreeOrderId || !attempt.orderIds.length) return null;

    const result = await verifyCashfreePayment(attempt.cashfreeOrderId);
    if (result.status === 'paid') {
      useAppStore.getState().clearCart();
      await clearPendingPaymentAttempt();
    } else if (result.status === 'failed') {
      await clearPendingPaymentAttempt();
    }
    return { attempt, result };
  } finally {
    reconciliationRunning = false;
  }
}
