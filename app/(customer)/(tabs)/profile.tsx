import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AccountMenuItem, AccountMenuSection, AppText, Button, ProfileAvatar, Screen } from '../../../components/UI';
import { spacing } from '../../../constants/theme';
import { useAppStore } from '../../../store/appStore';
import { getCachedCustomerProfile, getCustomerProfile } from '../../../services/customerProfile';

const sections = [
  {
    title: 'Account',
    items: [
      ['My Profile', '/(customer)/account/profile', 'account-outline'],
      ['Delivery Addresses', '/(customer)/account/addresses', 'map-marker-outline'],
    ],
  },
  {
    title: 'Orders & Delivery',
    items: [
      ['My Orders', '/(customer)/(tabs)/orders', 'clipboard-text-outline'],
      ['My Subscriptions', '/(customer)/account/subscriptions', 'refresh'],
      ['Delivery Calendar', '/(customer)/account/delivery-calendar', 'calendar-month-outline'],
    ],
  },
  {
    title: 'Communication',
    items: [
      ['Notifications', '/(customer)/account/notifications', 'bell-outline'],
      ['Feedback', '/(customer)/account/feedback', 'star-outline'],
    ],
  },
] as const;

export default function Profile() {
  const mobile = useAppStore(s => s.mobile);
  const logout = useAppStore(s => s.logout);
  const [name, setName] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!mobile) { setLoading(false); return () => { active = false; }; }

    const cached = getCachedCustomerProfile(mobile);
    if (cached) {
      setName(cached.name);
      setPhotoUrl(cached.photoUrl);
      setLoading(false);
    }

    const load = async () => {
      try {
        const profile = await getCustomerProfile(mobile);
        if (!active) return;
        setName(profile.name);
        setPhotoUrl(profile.photoUrl);
      } catch {
        // Keep the cached values visible even if the refresh fails.
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, [mobile]));

  return (
    <Screen>
      <View style={styles.profileHero}>
        <ProfileAvatar uri={photoUrl} name={name} size={96} />
        <AppText variant="h1" style={styles.name}>{loading ? 'Loading…' : (name || 'Customer')}</AppText>
        <AppText variant="bodySmall" style={styles.mobile}>+91 {mobile || '—'}</AppText>
      </View>

      {sections.map(section => (
        <AccountMenuSection key={section.title} title={section.title}>
          {section.items.map(([label, path, icon], index) => (
            <AccountMenuItem
              key={label}
              label={label}
              icon={icon}
              last={index === section.items.length - 1}
              onPress={() => router.push(path as any)}
            />
          ))}
        </AccountMenuSection>
      ))}

      <Button title="Sign out" danger onPress={() => { void logout(); router.replace('/(customer)/auth/login'); }} style={styles.logout} />
      <AppText variant="caption" style={styles.version}>Seedlings Microgreens • Customer</AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The customer layout already offsets content below the fixed header; no extra top padding is needed.
  profileHero: { alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.md },
  name: { marginTop: spacing.md, textAlign: 'center' },
  mobile: { marginTop: 2 },
  logout: { marginTop: spacing.sm },
  version: { textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.sm },
});
