import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AppCard, AppText, ErrorState, LoadingState, PageTitle, Screen } from '../../../components/UI';
import { colors, radius, spacing } from '../../../constants/theme';
import { getStoredCustomerMobile } from '../../../services/clientOnboarding';
import { getCustomerWallet, prettyWalletType, type CustomerWallet } from '../../../services/wallet/walletService';

function money(v: number | null) { return v == null ? '—' : `₹${v.toFixed(2)}`; }
function amountLabel(t: { amount: number; type: string }) {
  const type = t.type.toLowerCase();
  const credit = ['credit','credited','refund','cashback','reward','bonus','top_up','topup'].some(x => type.includes(x));
  return `${credit ? '+' : '-'}₹${Math.abs(t.amount).toFixed(2)}`;
}

export default function ScreenPage() {
  const [wallet, setWallet] = useState<CustomerWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    const mobile = getStoredCustomerMobile();
    if (!mobile) { setError('Please sign in to view your wallet.'); setLoading(false); return; }
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try { setWallet(await getCustomerWallet(mobile)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load wallet.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return <Screen refreshControl={!loading && !error ? <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.greenDark]} tintColor={colors.greenDark} /> : undefined}>
    <PageTitle title="Wallet" />
    {loading ? <LoadingState label="Loading wallet…" /> :
      error ? <ErrorState message={error} /> :
      <>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balance}>{money(wallet?.balance ?? null)}</Text>
          {wallet?.balance == null && <Text style={styles.balanceNote}>Balance is shown when the trusted wallet ledger provides it.</Text>}
        </View>
        <AppText variant="h2" style={styles.sectionTitle}>Recent Activity</AppText>
        {!wallet?.transactions.length ? <AppCard><Text style={styles.faint}>No wallet transactions found.</Text></AppCard> : wallet.transactions.map(t => <AppCard key={t.id}>
          <Text style={styles.amount}>{amountLabel(t)} · {prettyWalletType(t.type)}</Text>
          {t.description ? <Text style={styles.description}>{t.description}</Text> : null}
          {t.referenceId ? <Text style={styles.meta}>Reference: {t.referenceId}</Text> : null}
          {t.status ? <Text style={styles.meta}>Status: {t.status}</Text> : null}
        </AppCard>)}
      </>}
  </Screen>;
}

const styles = StyleSheet.create({
  balanceCard: { backgroundColor: colors.greenTint, borderRadius: radius.xl, padding: 22, alignItems: 'center' },
  balanceLabel: { color: colors.greenDark, fontWeight: '800' },
  balance: { fontSize: 34, fontWeight: '900', color: colors.ink, marginTop: 5 },
  balanceNote: { color: colors.inkFaint, fontSize: 12, marginTop: 6, textAlign: 'center' },
  sectionTitle: { marginTop: 22, marginBottom: spacing.md },
  faint: { color: colors.inkFaint },
  amount: { fontWeight: '800', color: colors.greenDark },
  description: { color: colors.ink, marginTop: 4 },
  meta: { color: colors.inkFaint, fontSize: 12, marginTop: 4 },
});
