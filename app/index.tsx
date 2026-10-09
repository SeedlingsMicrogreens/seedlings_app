import { useEffect } from 'react';
import { router } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/theme';
import { useAppStore } from '../store/appStore';

export default function Splash() {
  const authenticated = useAppStore((s) => s.authenticated);
  const sessionHydrated = useAppStore((s) => s.sessionHydrated);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!sessionHydrated) return;
    const t = setTimeout(() => router.replace(authenticated ? '/(customer)/(tabs)' : '/(customer)/auth/login'), 700);
    return () => clearTimeout(t);
  }, [authenticated, sessionHydrated]);
  return (
    <View style={styles.container}>
      <Image source={require('../assets/logo.png')} style={styles.logo} resizeMode="contain" />
      <Text style={styles.tagline}>Grow Healthy. Live Fresh!</Text>
      <View style={[styles.leaf, { bottom: insets.bottom + 35 }]}><MaterialCommunityIcons name="sprout" size={22} color={colors.greenDark} /></View>
    </View>
  );
}
const styles=StyleSheet.create({
 container:{flex:1,backgroundColor:colors.paper,alignItems:'center',justifyContent:'center'},
 logo:{width:280,height:225},
 tagline:{color:colors.greenDark,fontSize:19,fontWeight:'900',fontStyle:'italic',marginTop:4},
 leaf:{position:'absolute',opacity:.8}
});
