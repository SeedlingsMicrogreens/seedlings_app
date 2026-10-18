import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { AppText, Logo, Button, Screen, TextAction } from '../../../components/UI';
import { colors, spacing, typography } from '../../../constants/theme';
import { useAppStore } from '../../../store/appStore';
import { ensureClientOnboarding, requestClientOtp } from '../../../services/clientOnboarding';
import { CustomerAuthenticationError } from '../../../services/auth/customerPhoneAuth';

const OTP_VALIDITY_SECONDS = 120;
const OTP_LENGTH = 4;

export default function OTP() {
  const mobile = useAppStore((s) => s.mobile);
  const login = useAppStore((s) => s.login);
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const otp = otpDigits.join('');
  const [remainingSeconds, setRemainingSeconds] = useState(OTP_VALIDITY_SECONDS);
  const [sending, setSending] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const inputRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    if (remainingSeconds <= 0) return;

    const timer = setInterval(() => {
      setRemainingSeconds((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [remainingSeconds]);

  useEffect(() => {
    if (!mobile) {
      router.replace('/(customer)/auth/login');
      return;
    }

    let alive = true;

    setSending(true);
    setOtpDigits(Array(OTP_LENGTH).fill(''));
    setVerificationError('');
    setRemainingSeconds(OTP_VALIDITY_SECONDS);

    void requestClientOtp(mobile)
      .then((result) => {
        if (!alive) return;

        if (result.demo && result.demoOtp) {
          Alert.alert('Demo OTP', result.demoOtp, [{ text: 'OK', onPress: () => inputRefs.current[0]?.focus() }]);
        } else {
          setTimeout(() => inputRefs.current[0]?.focus(), 80);
        }
      })
      .catch((error) => {
        if (!alive) return;

        console.error('Customer OTP request failed:', error);
        Alert.alert(
          'Unable to send OTP',
          error instanceof Error ? error.message : 'We could not request an OTP. Check your connection and try again.',
        );
      })
      .finally(() => {
        if (alive) setSending(false);
      });

    return () => {
      alive = false;
    };
  }, [mobile]);

  const formattedTimer = useMemo(() => {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [remainingSeconds]);

  const updateOtpAt = (index: number, rawValue: string) => {
    setVerificationError('');
    const digits = rawValue.replace(/\D/g, '');

    if (!digits) {
      const next = [...otpDigits];
      next[index] = '';
      setOtpDigits(next);
      return;
    }

    const next = [...otpDigits];

    digits
      .slice(0, OTP_LENGTH - index)
      .split('')
      .forEach((digit, offset) => {
        next[index + offset] = digit;
      });

    setOtpDigits(next);

    const nextIndex = Math.min(index + digits.length, OTP_LENGTH - 1);
    inputRefs.current[nextIndex]?.focus();
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const verify = async () => {
    if (sending || verifying) return;

    setVerificationError('');

    if (remainingSeconds <= 0) {
      setVerificationError('OTP expired. Please request a new OTP and try again.');
      return;
    }

    if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(otp)) {
      setVerificationError(`Please enter the ${OTP_LENGTH}-digit verification code.`);
      return;
    }

    try {
      setVerifying(true);
      await ensureClientOnboarding(mobile, otp);
      await login(mobile);
      router.replace('/(customer)/(tabs)');
    } catch (error) {
      console.error(
        'Customer verification failed:',
        error instanceof CustomerAuthenticationError
          ? { stage: error.stage, code: error.code }
          : { name: error instanceof Error ? error.name : 'UnknownError' },
      );
      setVerificationError(
        error instanceof Error ? error.message : 'Invalid OTP. Please try again.',
      );
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (remainingSeconds > 0 || sending || verifying) return;

    setOtpDigits(Array(OTP_LENGTH).fill(''));
    setRemainingSeconds(OTP_VALIDITY_SECONDS);
    setSending(true);

    try {
      const result = await requestClientOtp(mobile, true);
      if (result.demo && result.demoOtp) {
        Alert.alert('New Demo OTP', result.demoOtp, [{ text: 'OK', onPress: () => inputRefs.current[0]?.focus() }]);
      } else {
        setTimeout(() => inputRefs.current[0]?.focus(), 50);
      }
    } catch (error) {
      setRemainingSeconds(0);

      Alert.alert(
        'Unable to resend OTP',
        error instanceof Error ? error.message : 'We could not resend the OTP. Check your connection and try again.',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Logo size={130} />

        <AppText variant="h1" style={styles.title}>Enter OTP</AppText>

        <AppText variant="body" style={styles.lead}>We've sent a {OTP_LENGTH}-digit verification code to{'\n'}+91 {mobile}</AppText>

        <View style={styles.cells}>
          {Array.from({ length: OTP_LENGTH }, (_, i) => (
            <TextInput
              key={i}
              ref={(ref) => {
                inputRefs.current[i] = ref;
              }}
              value={otp[i] ?? ''}
              onChangeText={(value) => updateOtpAt(i, value)}
              onKeyPress={({ nativeEvent }) =>
                handleKeyPress(i, nativeEvent.key)
              }
              keyboardType="number-pad"
              maxLength={1}
              editable={!sending && !verifying && remainingSeconds > 0}
              selectTextOnFocus
              accessibilityLabel={`OTP digit ${i + 1}`}
              maxFontSizeMultiplier={typography.controlMaxFontScale}
              style={[styles.cell, otp.length === OTP_LENGTH && styles.cellComplete]}
            />
          ))}
        </View>

        {!!verificationError && (
          <Text style={styles.error}>{verificationError}</Text>
        )}

        <Text style={[styles.timer, remainingSeconds <= 0 && styles.timerExpired]}>
          {remainingSeconds > 0
            ? `OTP expires in ${formattedTimer}`
            : 'OTP expired'}
        </Text>

        <Text style={styles.note}>
          Demo mode displays the generated OTP after the server issues it; real mode sends the OTP by SMS.
        </Text>

        <View style={styles.action}>
          <Button
            title="Verify"
            onPress={verify}
            loading={verifying}
            disabled={sending || remainingSeconds <= 0}
          />
        </View>

        <TextAction
          label="Resend OTP"
          tone={remainingSeconds > 0 ? 'muted' : 'primary'}
          onPress={resend}
          disabled={remainingSeconds > 0 || sending || verifying}
          style={styles.resend}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: 42 },
  title: { marginTop: 10 },
  lead: { color: colors.inkSoft, marginTop: 6, textAlign: 'center' },
  cells: { flexDirection: 'row', gap: 9, marginTop: 26, marginBottom: 22 },
  cell: { width: 55, height: 55, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: 10, textAlign: 'center', fontSize: 22, fontWeight: '800', color: colors.ink },
  cellComplete: { borderColor: colors.green },
  error: { color: colors.danger, textAlign: 'center', fontWeight: '700', marginBottom: 10, paddingHorizontal: spacing.md },
  timer: { color: colors.inkSoft, marginBottom: spacing.sm },
  timerExpired: { color: colors.danger },
  note: { color: colors.inkSoft, marginBottom: 22, textAlign: 'center' },
  action: { width: '100%' },
  resend: { alignSelf: 'center', paddingHorizontal: 14 },
});
