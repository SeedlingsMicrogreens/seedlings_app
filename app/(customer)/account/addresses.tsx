import { Alert, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { AppCard, AppInput, AppText, Button, Chip, LoadingState, PageTitle, Screen, TextAction } from '../../../components/UI';
import { colors, spacing } from '../../../constants/theme';
import { useAppStore } from '../../../store/appStore';
import {
  addCustomerAddress,
  editCustomerAddress,
  getCustomerAddresses,
  deleteCustomerAddress,
  setDefaultCustomerAddress,
  type CustomerAddress,
} from '../../../services/customerAddresses';

const labels = ['Home', 'Office', 'Tenant', 'Other'];

type FormState = Omit<CustomerAddress, 'id'>;
const emptyForm: FormState = { label: 'Home', name: '', mobileNumber: '', addressLine1: '', addressLine2: '', landmark: '', city: '', state: '', pincode: '' };

function addressLines(address: CustomerAddress) {
  return [address.name, address.addressLine1, address.addressLine2, address.landmark,
    [address.city, address.state, address.pincode].filter(Boolean).join(', '),
    address.mobileNumber ? `+91 ${address.mobileNumber}` : ''].filter(Boolean) as string[];
}

export default function CustomerAddressesScreen() {
  const mobile = useAppStore((state) => state.mobile);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerAddress | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  useEffect(() => {
    let active = true;
    if (!mobile) { router.replace('/(customer)/auth/login'); return () => { active = false; }; }
    void getCustomerAddresses(mobile)
      .then((result) => { if (active) setAddresses(result); })
      .catch((error) => { if (active) Alert.alert('Unable to load addresses', error instanceof Error ? error.message : 'Please try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mobile]);

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm, mobileNumber: mobile }); setFormOpen(true); };
  const openEdit = (address: CustomerAddress) => {
    setEditing(address);
    setForm({ label: address.label || 'Home', name: address.name || '', mobileNumber: address.mobileNumber || mobile, addressLine1: address.addressLine1 || '', addressLine2: address.addressLine2 || '', landmark: address.landmark || '', city: address.city || '', state: address.state || '', pincode: address.pincode || '' });
    setFormOpen(true);
  };

  const save = async () => {
    const clean = { ...form, mobileNumber: (form.mobileNumber ?? '').replace(/\D/g, '') };
    try {
      setSaving(true);
      const next = editing ? await editCustomerAddress(mobile, { ...clean, id: editing.id }) : await addCustomerAddress(mobile, clean);
      setAddresses(next);
      setFormOpen(false);
      Alert.alert(editing ? 'Address updated' : 'Address added', editing ? 'Your address has been updated.' : 'Your delivery address has been saved.');
    } catch (error) {
      Alert.alert('Unable to save address', error instanceof Error ? error.message : 'Please check the details and try again.');
    } finally { setSaving(false); }
  };

  const removeAddress = (address: CustomerAddress) => {
    Alert.alert(
      'Delete address',
      `Delete ${address.label || 'this address'}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const next = await deleteCustomerAddress(mobile, address.id);
              setAddresses(next);
              if (editing?.id === address.id) { setEditing(null); setFormOpen(false); }
              Alert.alert('Address deleted', 'Your address has been deleted.');
            } catch (error) {
              Alert.alert('Unable to delete address', error instanceof Error ? error.message : 'Please try again.');
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  const makeDefault = async (id: string) => {
    try {
      const next = await setDefaultCustomerAddress(mobile, id);
      setAddresses(next);
      Alert.alert('Default address updated', 'This address will be used first at checkout.');
    } catch (error) { Alert.alert('Unable to update default', error instanceof Error ? error.message : 'Please try again.'); }
  };

  const field = (label: string, key: keyof FormState, placeholder: string, options: { keyboardType?: 'default' | 'numeric'; maxLength?: number } = {}) => (
    <View style={styles.field} key={key}>
      <AppText variant="caption" style={styles.fieldLabel}>{label.toUpperCase()}</AppText>
      <AppInput value={String(form[key] ?? '')} onChangeText={(value) => setForm((current) => ({ ...current, [key]: value }))} placeholder={placeholder} accessibilityLabel={label} keyboardType={options.keyboardType} maxLength={options.maxLength} />
    </View>
  );

  return (
    <Screen>
      <PageTitle title="Delivery Addresses" />
      {!formOpen && <Button title="+ Add address" onPress={openAdd} />}
      {loading ? <LoadingState label="Loading addresses…" /> : formOpen ? (
        <AppCard style={styles.formCard}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>{editing ? 'Edit delivery address' : 'Add delivery address'}</Text>
            <TextAction label="Cancel" tone="muted" onPress={() => setFormOpen(false)} />
          </View>
          <Text style={styles.labelHeading}>LABEL</Text>
          <View style={styles.labelChips}>{labels.map((label) => <Chip key={label} label={label} selected={form.label === label} onPress={() => setForm((current) => ({ ...current, label }))} />)}</View>
          {field('Name', 'name', 'Full name')}
          {field('Mobile number', 'mobileNumber', '10-digit mobile number', { keyboardType: 'numeric', maxLength: 10 })}
          {field('Address line 1', 'addressLine1', 'Flat, building, street')}
          {field('Address line 2', 'addressLine2', 'Area, locality')}
          {field('Landmark', 'landmark', 'Nearby landmark')}
          {field('City', 'city', 'City')}
          {field('State', 'state', 'State')}
          {field('Pincode', 'pincode', '6-digit pincode', { keyboardType: 'numeric', maxLength: 6 })}
          <View style={styles.saveAction}><Button title={saving ? 'Saving…' : editing ? 'Save changes' : 'Add address'} onPress={save} /></View>
        </AppCard>
      ) : addresses.length === 0 ? (
        <AppCard style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No saved addresses</Text>
          <Text style={styles.emptyMessage}>Add a delivery address to continue with checkout.</Text>
        </AppCard>
      ) : addresses.map((address, index) => (
        <AppCard key={address.id} style={[styles.addressCard, index === 0 && styles.defaultCard]}>
          {index === 0 && <Text style={styles.defaultBadge}>DEFAULT ADDRESS</Text>}
          <Text style={styles.addressLabel}>{address.label || 'Address'}</Text>
          <Text style={styles.addressLines}>{addressLines(address).join('\n')}</Text>
          <View style={styles.actions}>
            <TextAction bordered label="Edit" accessibilityLabel={`Edit ${address.label || 'address'}`} onPress={() => openEdit(address)} />
            {index !== 0 && <TextAction bordered tone="muted" label="Set default" accessibilityLabel={`Set ${address.label || 'address'} as default`} onPress={() => makeDefault(address.id)} />}
            <TextAction bordered tone="danger" label="Delete" accessibilityLabel={`Delete ${address.label || 'address'}`} onPress={() => removeAddress(address)} />
          </View>
        </AppCard>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: 14 },
  fieldLabel: { color: colors.inkSoft, fontWeight: '900', marginBottom: 7 },
  formCard: { marginTop: 14 },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  formTitle: { flex: 1, color: colors.ink, fontSize: 18, fontWeight: '900' },
  labelHeading: { color: colors.inkSoft, fontSize: 12, fontWeight: '700', marginTop: spacing.md },
  labelChips: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  saveAction: { marginTop: spacing.xl },
  emptyCard: { marginTop: 14, alignItems: 'center', padding: spacing.xxl },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  emptyMessage: { color: colors.inkSoft, marginTop: 7, textAlign: 'center' },
  addressCard: { marginTop: 14, marginBottom: 0 },
  defaultCard: { borderColor: colors.green },
  defaultBadge: { color: colors.greenDark, fontSize: 11, fontWeight: '900', marginBottom: 7 },
  addressLabel: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  addressLines: { color: colors.inkSoft, marginTop: spacing.sm, lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
});
