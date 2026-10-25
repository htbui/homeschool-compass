import { useState } from 'react';
import { Image, View } from 'react-native';

import { formatDate, schoolYearLabel, todayKey } from '@/lib/dates';
import { expenseReportHtml } from '@/lib/documents';
import { uid } from '@/lib/id';
import { getStateLaw } from '@/lib/states';
import type { Expense, FundingSource } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { exportHtml } from '@/services/exportDoc';
import { pickPhoto } from '@/services/media';
import { Button, Card, Chip, DateField, Empty, Field, MoneyField, Pill, Progress, Row, Screen, Section, Sheet, space, Stack, Stat, T, useColors } from '@/ui';

const CATEGORIES: Expense['category'][] = ['curriculum', 'supplies', 'tutoring', 'technology', 'field_trip', 'testing', 'other'];
const SOURCES: { value: FundingSource; label: string }[] = [
  { value: 'esa', label: 'ESA / voucher' },
  { value: 'tax', label: 'Tax credit / deduction' },
  { value: 'out_of_pocket', label: 'Out of pocket' },
];
const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ExpensesScreen() {
  const c = useColors();
  const family = useStore((s) => s.family)!;
  const kids = useStore((s) => s.children);
  const expenses = useStore((s) => s.expenses);
  const award = useStore((s) => s.esaAnnualAward);
  const { upsertExpense, removeExpense, setEsaAward } = useStore.getState();
  const [editing, setEditing] = useState<Expense | null>(null);
  const [awardDraft, setAwardDraft] = useState<number | undefined>(award || undefined);
  const [busy, setBusy] = useState(false);
  const law = getStateLaw(family.stateCode);

  const yearStart = family.schoolYearStart;
  const year = expenses.filter((e) => e.date >= yearStart);
  const sum = (src?: FundingSource) => year.filter((e) => !src || e.fundingSource === src).reduce((a, e) => a + e.amount, 0);
  const esaSpent = sum('esa');

  const blank = (): Expense => ({ id: uid('x'), date: todayKey(), vendor: '', description: '', amount: 0, category: 'curriculum', fundingSource: law?.funding.some((f) => f.kind === 'esa') ? 'esa' : 'tax', approvedVendor: false });

  const exportReport = async () => {
    setBusy(true);
    try {
      await exportHtml(expenseReportHtml(family, year, kids, schoolYearLabel()), `Education Expenses ${schoolYearLabel()}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={[]}>
      {law?.funding.length ? (
        <Card tint={c.successSoft}>
          <T v="heading">💰 Programs in {law.name}</T>
          {law.funding.map((f) => (
            <T key={f.name} v="caption">• {f.name}{f.approxAmount ? ` (${f.approxAmount})` : ''} — {f.note}</T>
          ))}
        </Card>
      ) : (
        <Card>
          <T v="caption">No state ESA or tax program is listed for {law?.name ?? 'your state'}. Track expenses anyway — some federal and local programs, and co-op reimbursements, still need receipts.</T>
        </Card>
      )}

      <Section title={`School year ${schoolYearLabel()}`}>
        <Row wrap gap={space.md} align="stretch">
          <Stat label="ESA spent" value={money(esaSpent)} sub={award ? `${money(Math.max(0, award - esaSpent))} remaining` : 'Set your award below'} />
          <Stat label="Tax-eligible" value={money(sum('tax'))} />
          <Stat label="Out of pocket" value={money(sum('out_of_pocket'))} />
        </Row>
        <Row gap={space.sm} align="flex-end">
          <View style={{ flex: 1 }}>
            <MoneyField label="Annual ESA award" value={awardDraft} onChange={setAwardDraft} example="7,000" />
          </View>
          <Button kind="secondary" title={awardDraft === award ? 'Saved ✓' : 'Save'} disabled={awardDraft === undefined || awardDraft === award} onPress={() => awardDraft !== undefined && setEsaAward(awardDraft)} />
        </Row>
        {award ? <Progress value={esaSpent / award} color={esaSpent > award ? c.danger : c.success} /> : null}
        <Row wrap>
          <Button icon="＋" title="Add expense" onPress={() => setEditing(blank())} />
          <Button kind="secondary" icon="⬇️" title="Export report" loading={busy} disabled={!year.length} onPress={exportReport} />
        </Row>
      </Section>

      <Section title="Expenses">
        {expenses.length === 0 ? (
          <Empty icon="🧾" title="No expenses yet" body="Log curriculum, supplies, tutoring, and field trips. Snap the receipt so it's ready for ESA reimbursement or tax time." />
        ) : (
          <Stack gap={space.sm}>
            {expenses.map((e) => (
              <Card key={e.id} onPress={() => setEditing(e)}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T v="heading" style={{ flex: 1 }}>{e.vendor || 'Expense'}</T>
                  <T v="heading">{money(e.amount)}</T>
                </Row>
                <T v="caption" muted>{formatDate(e.date)} · {e.category.replace('_', ' ')} · {kids.find((k) => k.id === e.childId)?.name ?? 'Family'}{e.description ? ` · ${e.description}` : ''}</T>
                <Row gap={6}>
                  <Pill text={SOURCES.find((s) => s.value === e.fundingSource)!.label} />
                  {e.approvedVendor ? <Pill text="Approved vendor ✓" bg={c.successSoft} fg={c.success} /> : null}
                  {e.receiptUri ? <Pill text="🧾 Receipt" /> : null}
                </Row>
              </Card>
            ))}
          </Stack>
        )}
      </Section>

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing && expenses.some((x) => x.id === editing.id) ? 'Edit expense' : 'New expense'}>
        {editing ? (
          <Stack gap={space.md}>
            <Field label="Vendor" value={editing.vendor} onChangeText={(vendor) => setEditing({ ...editing, vendor })} placeholder="Rainbow Resource Center" />
            <Field label="Description" value={editing.description} onChangeText={(description) => setEditing({ ...editing, description })} />
            <Row gap={space.md} align="flex-start" wrap>
              <View style={{ flex: 1, minWidth: 150 }}><MoneyField label="Amount ($)" required value={editing.amount || undefined} onChange={(v) => setEditing({ ...editing, amount: v ?? 0 })} /></View>
              <View style={{ flex: 1, minWidth: 180 }}><DateField label="Date" required value={editing.date || undefined} onChange={(date) => setEditing({ ...editing, date: date ?? '' })} /></View>
            </Row>
            <Row wrap gap={6}>
              {CATEGORIES.map((cat) => (
                <Chip key={cat} label={cat.replace('_', ' ')} selected={editing.category === cat} onPress={() => setEditing({ ...editing, category: cat })} />
              ))}
            </Row>
            <Row wrap gap={6}>
              {SOURCES.map((s) => (
                <Chip key={s.value} label={s.label} selected={editing.fundingSource === s.value} onPress={() => setEditing({ ...editing, fundingSource: s.value })} />
              ))}
            </Row>
            <Row wrap gap={6}>
              <Chip label="Family" selected={!editing.childId} onPress={() => setEditing({ ...editing, childId: undefined })} />
              {kids.map((k) => (
                <Chip key={k.id} label={`${k.avatar} ${k.name}`} selected={editing.childId === k.id} onPress={() => setEditing({ ...editing, childId: k.id })} />
              ))}
            </Row>
            <Chip label={`${editing.approvedVendor ? '✓' : '○'} Approved ESA vendor`} selected={editing.approvedVendor} onPress={() => setEditing({ ...editing, approvedVendor: !editing.approvedVendor })} />
            {editing.receiptUri ? <Image source={{ uri: editing.receiptUri }} style={{ width: '100%', height: 180, borderRadius: 12 }} resizeMode="contain" /> : null}
            <Button kind="secondary" icon="🧾" title={editing.receiptUri ? 'Replace receipt' : 'Attach receipt'} onPress={async () => { const uri = await pickPhoto('library'); if (uri) setEditing({ ...editing, receiptUri: uri }); }} />
            <Row style={{ justifyContent: 'flex-end' }}>
              {expenses.some((x) => x.id === editing.id) ? <Button kind="danger" title="Delete" onPress={() => { removeExpense(editing.id); setEditing(null); }} /> : null}
              <Button
                title="Save"
                disabled={!editing.amount || !editing.vendor.trim() || !editing.date}
                reason={`Still needed: ${[!editing.vendor.trim() && 'vendor', !editing.amount && 'an amount', !editing.date && 'a valid date'].filter(Boolean).join(', ')}`}
                onPress={() => { upsertExpense(editing); setEditing(null); }}
              />
            </Row>
          </Stack>
        ) : null}
      </Sheet>
    </Screen>
  );
}
