import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { AppCard, AppInput, AppText, Button, LoadingState, ProfileAvatar, Screen, TextAction } from '../../../components/UI';
import { colors, spacing } from '../../../constants/theme';
import { useAppStore } from '../../../store/appStore';
import { getCachedCustomerProfile, getCustomerProfile, updateCustomerProfile } from '../../../services/customerProfile';
import { removeCustomerProfilePhoto, uploadCustomerProfilePhoto } from '../../../services/customerProfilePhoto';

export default function CustomerProfileScreen() {
  const mobile = useAppStore((state) => state.mobile);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (!mobile) { router.replace('/(customer)/auth/login'); return () => { active = false; }; }

    const cached = getCachedCustomerProfile(mobile);
    if (cached) {
      setName(cached.name);
      setEmail(cached.email);
      setPhotoUrl(cached.photoUrl);
      setLoading(false);
    }

    const load = async () => {
      try {
        const profile = await getCustomerProfile(mobile);
        if (!active) return;
        setName(profile.name);
        setEmail(profile.email);
        setPhotoUrl(profile.photoUrl);
      } catch (error) {
        console.error('Customer profile load failed:', error);
        if (active && !cached) Alert.alert('Unable to load profile', 'Please check your internet connection and try again.');
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [mobile]));

  const save = async () => {
    try {
      setSaving(true);
      await updateCustomerProfile(mobile, { name, email });
      Alert.alert('Profile updated', 'Your profile has been saved successfully.');
    } catch (error) {
      Alert.alert('Unable to save profile', error instanceof Error ? error.message : 'Unable to update your profile.');
    } finally { setSaving(false); }
  };

  const choosePhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo access required', 'Please allow photo access to choose a profile photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      setPhotoBusy(true);
      const url = await uploadCustomerProfilePhoto(mobile, result.assets[0].uri);
      setPhotoUrl(url);
    } catch (error) {
      Alert.alert('Unable to update photo', error instanceof Error ? error.message : 'Please try again.');
    } finally { setPhotoBusy(false); }
  };

  const removePhoto = async () => {
    try {
      setPhotoBusy(true);
      await removeCustomerProfilePhoto(mobile);
      setPhotoUrl(undefined);
    } catch (error) {
      Alert.alert('Unable to remove photo', error instanceof Error ? error.message : 'Please try again.');
    } finally { setPhotoBusy(false); }
  };

  return <Screen>
    {loading ? <LoadingState label="Loading profile…" /> : <>
      <AppCard style={styles.profileCard}>
        <View style={styles.photoWrap}>
          <ProfileAvatar uri={photoUrl} name={name} size={96} />
          <View style={styles.photoActions}>
            <Button title={photoBusy ? 'Updating…' : photoUrl ? 'Change photo' : 'Add photo'} onPress={choosePhoto} loading={photoBusy} />
            {photoUrl && !photoBusy ? <TextAction label="Remove photo" tone="danger" onPress={removePhoto} style={styles.removePhoto} /> : null}
          </View>
        </View>
      </AppCard>

      <AppCard>
        <AppText variant="caption" style={styles.label}>MOBILE NUMBER</AppText>
        <AppInput value={`+91 ${mobile}`} editable={false} accessibilityLabel="Mobile number" />

        <AppText variant="caption" style={styles.label}>NAME</AppText>
        <AppInput value={name} onChangeText={setName} placeholder="Enter your name" />

        <AppText variant="caption" style={styles.label}>EMAIL</AppText>
        <AppInput value={email} onChangeText={setEmail} placeholder="Enter your email (optional)" keyboardType="email-address" />

        <AppText variant="caption" style={styles.label}>PREFERRED DELIVERY DAY</AppText>
        <AppInput value="Saturday" editable={false} accessibilityLabel="Preferred delivery day" />

        <View style={styles.save}><Button title={saving ? 'Saving…' : 'Save Changes'} onPress={save} loading={saving} /></View>
      </AppCard>
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  profileCard: { alignItems: 'center' },
  photoWrap: { width: '100%', alignItems: 'center' },
  photoActions: { width: '100%', marginTop: spacing.md },
  removePhoto: { alignSelf: 'center', marginTop: 4 },
  label: { color: colors.inkSoft, fontWeight: '900', marginTop: spacing.md, marginBottom: 7 },
  save: { marginTop: spacing.lg },
});
