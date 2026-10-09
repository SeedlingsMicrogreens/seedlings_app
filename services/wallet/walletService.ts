import { collection, getDocs, orderBy, query, where } from '../core/firestore';
import { db } from '../core/firebaseClient';
import { normalizeIndianMobile } from '../clientOnboarding';

export type WalletTransaction = {
  id: string;
  customerId: string;
  amount: number;
  type: string;
  status?: string;
  description?: string;
  referenceId?: string;
  balance?: number;
  createdAt?: unknown;
};

export type CustomerWallet = {
  balance: number | null;
  transactions: WalletTransaction[];
};

function num(v: unknown) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function text(v: unknown) { return typeof v === 'string' ? v : undefined; }

function normalizeType(v: unknown) {
  return String(v ?? '').trim().toLowerCase().replace(/[-\s]+/g, '_');
}

function isCredit(type: string) {
  return ['credit', 'credited', 'refund', 'cashback', 'reward', 'bonus', 'top_up', 'topup'].some(x => type.includes(x));
}

function isDebit(type: string) {
  return ['debit', 'debited', 'payment', 'purchase', 'order', 'spent', 'deduction'].some(x => type.includes(x));
}

export async function getCustomerWallet(input: string): Promise<CustomerWallet> {
  const mobile = normalizeIndianMobile(input);
  if (!mobile) throw new Error('Invalid customer mobile number.');

  const base = collection(db, 'walletTransactions');
  let snapshot;
  try {
    snapshot = await getDocs(query(base, where('customerId', '==', mobile), orderBy('createdAt', 'desc')));
  } catch {
    snapshot = await getDocs(query(base, where('customerId', '==', mobile)));
  }

  const transactions = snapshot.docs.map(d => {
    const x = d.data();
    const balance = x.balance == null ? undefined : num(x.balance);
    return {
      id: d.id,
      customerId: String(x.customerId ?? mobile),
      amount: num(x.amount),
      type: String(x.type ?? x.transactionType ?? ''),
      ...(x.status != null ? { status: text(x.status) } : {}),
      ...(x.description != null ? { description: text(x.description) } : {}),
      ...(x.referenceId != null ? { referenceId: text(x.referenceId) } : {}),
      ...(balance !== undefined ? { balance } : {}),
      ...(x.createdAt != null ? { createdAt: x.createdAt } : {}),
    } as WalletTransaction;
  });

  const withBalance = transactions.find(t => t.balance !== undefined);
  if (withBalance?.balance !== undefined) return { balance: withBalance.balance, transactions };

  // Only derive a display balance from completed/settled ledger entries.
  // If the existing ledger does not expose a recognizable transaction type, do not invent a balance.
  const settled = transactions.filter(t => !t.status || ['completed', 'success', 'successful', 'settled', 'paid'].includes(String(t.status).toLowerCase()));
  if (settled.length && settled.every(t => isCredit(normalizeType(t.type)) || isDebit(normalizeType(t.type)))) {
    const balance = settled.reduce((sum, t) => {
      const type = normalizeType(t.type);
      return sum + (isCredit(type) ? Math.abs(t.amount) : -Math.abs(t.amount));
    }, 0);
    return { balance: Math.max(0, balance), transactions };
  }

  return { balance: null, transactions };
}

export function prettyWalletType(type?: string) {
  const v = String(type ?? '').trim().replace(/[_-]+/g, ' ');
  return v ? v.replace(/\b\w/g, c => c.toUpperCase()) : 'Wallet transaction';
}
