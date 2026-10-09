import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Screen } from '../../../components/UI';
import { colors, spacing } from '../../../constants/theme';

export default function Success() {
  const { preview, orderNumber, total } = useLocalSearchParams<{ preview?: string; orderNumber?: string; total?: string }>();
  const isPreview = preview === 'true';

  return (
    <Screen>
      <View style={styles.wrap}>
        <Text style={styles.brand}>Seedlings</Text>
        <View style={styles.check}>
          <MaterialCommunityIcons name="check" size={40} color={colors.white} />
        </View>
        <Text style={styles.title}>{isPreview ? 'Checkout Ready' : 'Order Placed!'}</Text>
        <Text style={styles.message}>
          {isPreview ? 'Your checkout details are validated.' : `Your order ${orderNumber ? `#${orderNumber} ` : ''}has been placed successfully.`}
        </Text>
        {!isPreview && total ? <Text style={styles.total}>Total: ₹{total}</Text> : null}
        <View style={styles.actions}>
          <Button title="View My Orders" onPress={() => router.replace('/(customer)/(tabs)/orders')} />
          <Button title="Continue Shopping" secondary onPress={() => router.replace('/(customer)/(tabs)/products')} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 55 },
  brand: { fontSize: 24, fontWeight: '900', color: colors.greenDark, marginBottom: 18 },
  check: { width: 70, height: 70, borderRadius: 35, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 25, fontWeight: '900', color: colors.ink, marginTop: spacing.lg },
  message: { color: colors.inkSoft, textAlign: 'center', marginTop: 6 },
  total: { marginTop: 10, fontSize: 18, fontWeight: '900', color: colors.ink },
  actions: { width: '100%', marginTop: 26, gap: 10 },
});
