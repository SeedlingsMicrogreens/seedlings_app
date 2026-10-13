import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Screen } from '../../../components/UI';
import { colors, radius, spacing } from '../../../constants/theme';
import { getPendingPaymentAttempt, clearPendingPaymentAttempt } from '../../../services/payments/paymentAttemptStore';
import { verifyCashfreePayment } from '../../../services/payments/paymentService';
import { useAppStore } from '../../../store/appStore';

export default function PaymentStatus() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Checking your payment status…');
  const [status, setStatus] = useState<'pending' | 'paid' | 'failed' | 'missing'>('pending');

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const attempt = await getPendingPaymentAttempt();
      if (!attempt?.cashfreeOrderId) {
        setStatus('missing');
        setMessage('There is no active payment to check.');
        return;
      }
      const result = await verifyCashfreePayment(attempt.cashfreeOrderId);
      setStatus(result.status);
      if (result.status === 'paid') {
        useAppStore.getState().clearCart();
        await clearPendingPaymentAttempt(attempt.paymentAttemptId);
        setMessage('Payment received and your order has been placed.');
      } else if (result.status === 'failed') {
        setMessage(result.message || 'Payment was not completed. Your cart is still available for retry.');
      } else {
        setMessage('Payment is still pending. Please check again shortly.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'We could not confirm the payment status. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void check(); }, [check]);

  const failed = status === 'failed';
  return (
    <Screen>
      <View style={styles.wrap}>
        {loading ? <ActivityIndicator color={colors.greenDark} size="large" /> : null}
        <Text style={styles.title}>
          {status === 'paid' ? 'Order Placed!' : status === 'failed' ? 'Payment Failed' : 'Payment Status'}
        </Text>
        <View style={[styles.messageBox, failed && styles.messageBoxFailed]}><Text style={[styles.message, failed && styles.messageFailed]}>{message}</Text></View>
        {!loading && status === 'pending' ? <View style={styles.action}><Button title="Check Again" onPress={() => void check()} /></View> : null}
        {!loading && (status === 'pending' || status === 'failed') ? <View style={styles.action}><Button title="Resume Checkout" onPress={() => router.replace('/(customer)/checkout')} /></View> : null}
        {!loading && status === 'paid' ? <View style={styles.action}><Button title="View My Orders" onPress={() => router.replace('/(customer)/(tabs)/orders')} /></View> : null}
        {!loading && status === 'failed' ? <View style={styles.action}><Button title="Return to Cart" onPress={() => router.replace('/(customer)/(tabs)/cart')} /></View> : null}
        {!loading && status === 'missing' ? <View style={styles.action}><Button title="Continue Shopping" onPress={() => router.replace('/(customer)/(tabs)/products')} /></View> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 18 },
  title: { fontSize: 24, fontWeight: '900', color: colors.ink, marginTop: spacing.xl, textAlign: 'center' },
  messageBox: { width: '100%', marginTop: 10, backgroundColor: colors.panel, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  messageBoxFailed: { backgroundColor: colors.dangerTint, borderColor: colors.danger },
  message: { color: colors.inkSoft, textAlign: 'center', lineHeight: 21 },
  messageFailed: { color: colors.danger, fontWeight: '700' },
  action: { width: '100%', marginTop: spacing.xxl },
});
