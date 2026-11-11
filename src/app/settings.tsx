import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ChildForm } from '@/components/ChildForm';
import { StatePicker } from '@/components/StatePicker';
import { ageOn, WEEKDAY_SHORT } from '@/lib/dates';
import { describeResult } from '@/lib/quiz';
import type { Child, Weekday } from '@/lib/types';
import { STATUS_LABEL, useAccount } from '@/store/useAccount';
import { enterStudio } from '@/services/studioMode';
import { useStudio } from '@/store/useStudio';
import { usePrinter } from '@/store/usePrinter';
import { useStore } from '@/store/useStore';
import { cloudEnabled } from '@/services/cloud';
import { shareText } from '@/services/exportDoc';
import { signOut } from '@/services/sync';
import { Button, Card, Chip, DateField, Field, Row, Screen, Section, Sheet, space, Stack, T, useColors, useConfirm } from '@/ui';

export default function Settings() {
  const family = useStore((s) => s.family);
  const kids = useStore((s) => s.children);
  const { updateFamily, upsertChild, removeChild, exportData, importData, resetAll } = useStore.getState();
  const [editing, setEditing] = useState<Child | 'new' | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [pin, setPin] = useState('');
  const [pinSaved, setPinSaved] = useState(false);
  const confirm = useConfirm();
  const account = useAccount();
  const printer = usePrinter();
  const c = useColors();
  const studioName = useStudio((s) => s.profile?.name);

  if (!family) return null;
  const toggleDay = (d: Weekday) => updateFamily({ schoolDays: family.schoolDays.includes(d) ? family.schoolDays.filter((x) => x !== d) : [...family.schoolDays, d].sort() });

  return (
    <Screen edges={[]}>
      {cloudEnabled ? (
        <Section title="Account & sync">
          <Card onPress={() => router.push('/account')}>
            <Row wrap style={{ justifyContent: 'space-between' }}>
              <T v="heading">{account.userId ? account.email : 'Not signed in'}</T>
              <T v="label">{account.userId ? STATUS_LABEL[account.status] : 'Sign in ›'}</T>
            </Row>
            <T v="caption" muted>{account.userId ? 'Your family syncs across every device signed in to this account.' : 'Sign in to sync across devices, shop the live marketplace, and meet families nearby.'}</T>
          </Card>
        </Section>
      ) : null}
      <Section title="Freerange Studio">
        <Card onPress={enterStudio}>
          <Row wrap style={{ justifyContent: 'space-between' }}>
            <T v="heading">🎨 {studioName ?? 'Make your own curricula'}</T>
            <T v="label">Switch to Studio ›</T>
          </Row>
          <T v="caption" muted>Write lesson plans, convert books you own or free online courses, and publish to the Marketplace.</T>
        </Card>
      </Section>

      <Section title="Family">
        <Stack gap={space.md}>
          <Field label="Family name" value={family.familyName} onChangeText={(familyName) => updateFamily({ familyName })} />
          <Field label="Primary educator" value={family.parentName} onChangeText={(parentName) => updateFamily({ parentName })} />
          <View style={{ gap: 6 }}>
            <T v="label">State</T>
            <StatePicker value={family.stateCode} onChange={(stateCode) => updateFamily({ stateCode })} />
          </View>
          <Row gap={space.sm} align="flex-end">
            <View style={{ flex: 1 }}>
              <Field label="Change parent PIN" keyboardType="number-pad" maxLength={4} secureTextEntry value={pin} onChangeText={(v) => { setPin(v.replace(/\D/g, '')); setPinSaved(false); }} placeholder="New 4-digit PIN" />
            </View>
            <Button kind="secondary" title={pinSaved ? 'Updated ✓' : 'Update'} disabled={!/^\d{4}$/.test(pin)} onPress={() => { updateFamily({ parentPin: pin }); setPin(''); setPinSaved(true); }} />
          </Row>
          {family.philosophy ? (
            <Card>
              <T v="label">Homeschool style</T>
              <T>{describeResult(family.philosophy)}</T>
            </Card>
          ) : null}
        </Stack>
      </Section>

      <Section title="School calendar">
        <Row gap={space.md} align="flex-start" wrap>
          <View style={{ flex: 1, minWidth: 200 }}>
            <DateField label="Year starts" value={family.schoolYearStart} onChange={(d) => d && d < family.schoolYearEnd && updateFamily({ schoolYearStart: d })} validate={(d) => (d >= family.schoolYearEnd ? 'Must be before the end date' : undefined)} />
          </View>
          <View style={{ flex: 1, minWidth: 200 }}>
            <DateField label="Year ends" value={family.schoolYearEnd} onChange={(d) => d && d > family.schoolYearStart && updateFamily({ schoolYearEnd: d })} validate={(d) => (d <= family.schoolYearStart ? 'Must be after the start date' : undefined)} />
          </View>
        </Row>
        <T v="label">School days</T>
        <Row wrap gap={6}>
          {WEEKDAY_SHORT.map((d, i) => (
            <Chip key={d} label={d} selected={family.schoolDays.includes(i as Weekday)} onPress={() => toggleDay(i as Weekday)} />
          ))}
        </Row>
        <T v="label">Flex / catch-up day (for bumped tasks)</T>
        <Row wrap gap={6}>
          <Chip label="None" selected={family.flexDay === undefined} onPress={() => updateFamily({ flexDay: undefined })} />
          {WEEKDAY_SHORT.map((d, i) => (
            <Chip key={d} label={d} selected={family.flexDay === i} onPress={() => updateFamily({ flexDay: i as Weekday })} />
          ))}
        </Row>
      </Section>

      <Section title="Children" action={<Button size="sm" icon="＋" title="Add" onPress={() => setEditing('new')} />}>
        <Stack gap={space.sm}>
          {kids.map((k) => (
            <Card key={k.id} onPress={() => setEditing(k)}>
              <Row>
                <T style={{ fontSize: 30 }}>{k.avatar}</T>
                <View style={{ flex: 1 }}>
                  <T v="heading">{k.name}</T>
                  <T v="caption" muted>Age {ageOn(k.birthdate)} · {k.grade} · {k.pin ? 'PIN set' : 'No PIN'} · ⭐ {k.sparks}</T>
                </View>
              </Row>
            </Card>
          ))}
        </Stack>
      </Section>

      <Section title="Printing" subtitle="Worksheets and day packets print from 🖨️ buttons on tasks and days. Set up per device.">
        <Card onPress={() => printer.openSetup()}>
          <Row wrap style={{ justifyContent: 'space-between' }}>
            <T v="heading">{!printer.config ? 'Not set up yet' : printer.config.mode === 'saved' ? `🖨️ ${printer.config.name}` : '🖨️ Choose in the print dialog'}</T>
            <T v="label">{printer.config ? 'Change ›' : 'Set up ›'}</T>
          </Row>
          <T v="caption" muted>{printer.config ? `Paper: ${printer.config.paper === 'a4' ? 'A4' : 'US Letter'}` : 'You’ll be asked the first time you print.'}</T>
          {printer.lastError ? <T v="caption" color={c.danger}>{printer.lastError}</T> : null}
        </Card>
      </Section>

      <Section title="Your data" subtitle={account.userId ? 'Freerange is offline-first: this device keeps a full copy and syncs with your account. Backups are a handy extra copy.' : 'Freerange is offline-first: everything lives on this device. Back up to move it, or sign in to sync.'}>
        <Row wrap>
          <Button kind="secondary" icon="⬇️" title="Export backup" onPress={() => shareText(exportData(), `freerange-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json')} />
          <Button kind="secondary" icon="⬆️" title="Import backup" onPress={() => setImportOpen(true)} />
          <Button
            kind="danger"
            title="Erase everything"
            onPress={() =>
              confirm.ask(
                'Erase all Freerange data on this device?',
                async () => {
                  // Signed in: sign out first so the erase doesn't sync to the account.
                  if (account.userId) await signOut(false);
                  else resetAll();
                  router.replace('/onboarding');
                },
                { body: account.userId ? 'This signs you out and erases this device. Your account keeps its copy — to delete that too, use Account & sync → Leave family.' : 'This cannot be undone. Export a backup first if you might want it later.', confirm: 'Erase' },
              )
            }
          />
        </Row>
      </Section>

      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add child' : 'Edit child'}>
        {editing !== null ? (
          <Stack>
            <ChildForm initial={editing === 'new' ? undefined : editing} index={kids.length} onSave={(c) => { upsertChild(c); setEditing(null); }} onCancel={() => setEditing(null)} />
            {editing !== 'new' ? (
              <Button
                kind="danger"
                title={`Remove ${editing.name}`}
                onPress={() =>
                  confirm.ask(`Remove ${editing.name}?`, () => {
                    removeChild(editing.id);
                    setEditing(null);
                  }, { body: 'Their tasks are removed. Portfolio samples and hours logs are kept.', confirm: 'Remove' })
                }
              />
            ) : null}
          </Stack>
        ) : null}
      </Sheet>

      <Sheet visible={importOpen} onClose={() => setImportOpen(false)} title="Import backup">
        <T muted>Paste the contents of a Freerange backup file. This replaces everything on this device.</T>
        <Field multiline value={importText} onChangeText={(t) => { setImportText(t); setImportError(''); }} style={{ minHeight: 160 }} />
        {importError ? <T color="#C8463F">{importError}</T> : null}
        <Button
          title="Import"
          disabled={!importText.trim()}
          onPress={() => {
            try {
              importData(importText);
              setImportOpen(false);
              router.replace('/');
            } catch (e) {
              setImportError(e instanceof Error ? e.message : 'Could not read that backup.');
            }
          }}
        />
      </Sheet>
      {confirm.element}
    </Screen>
  );
}
