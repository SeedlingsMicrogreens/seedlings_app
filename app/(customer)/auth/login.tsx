import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AppInput, AppText, Logo, Button, Screen } from '../../../components/UI';
import { colors, layout, radius, spacing, typography } from '../../../constants/theme';
import { useAppStore } from '../../../store/appStore';

export default function Login() {
  const [mobile, setMobile] = useState('');
  const setStoreMobile = useAppStore((s) => s.setMobile);

  const submit = async () => {
    if (!/^\d{10}$/.test(mobile)) {
      Alert.alert('Invalid mobile number', 'Please enter a valid 10-digit mobile number.');
      return;
    }
    setStoreMobile(mobile);
    router.push('/(customer)/auth/otp');
  };

  return <Screen>
    <View style={styles.hero}>
      <Logo size={190} />
      <AppText variant="display" style={styles.welcome}>Welcome!</AppText>
      <AppText variant="body" style={styles.lead}>Enter your mobile number to continue</AppText>
      <View style={styles.form}>
        <View style={styles.phoneRow}>
          <View style={styles.countryCode}><AppText variant="body" maxFontSizeMultiplier={typography.controlMaxFontScale}>🇮🇳 +91</AppText></View>
          <View style={styles.phoneInput}><AppInput value={mobile} onChangeText={v=>setMobile(v.replace(/\D/g,''))} keyboardType="phone-pad" maxLength={10} placeholder="9876543210" accessibilityLabel="Mobile number" /></View>
        </View>
        <Button title="Send OTP" onPress={submit}/>
        <View style={styles.gap} /><Button title="Continue as Guest" secondary onPress={()=>router.replace('/(customer)/(tabs)')}/>
      </View>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: 38 },
  welcome: { marginTop: 10 },
  lead: { color: colors.inkSoft, marginTop: 6, marginBottom: 28 },
  form: { width: '100%' },
  phoneRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  countryCode: { width: 72, height: layout.inputHeight, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  phoneInput: { flex: 1 },
  gap: { height: 10 },
});
