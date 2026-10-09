import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../../components/UI';
import { colors } from '../../../constants/theme';

export default function ScreenPage() {
  return <Screen>
    <View style={styles.wrap}>
      <Text style={styles.title}>Seedlings Microgreens</Text>
      <Text style={styles.body}>Grow Healthy. Live Fresh!{`\n`}Fresh microgreens delivered with care.</Text>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 20 },
  title: { fontSize: 20, fontWeight: '900', color: colors.ink },
  body: { color: colors.inkSoft, textAlign: 'center', marginTop: 8 },
});
