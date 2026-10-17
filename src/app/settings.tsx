import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ChildForm } from '@/components/ChildForm';
import { StatePicker } from '@/components/StatePicker';
import { ageOn, WEEKDAY_SHORT } from '@/lib/dates';
import { describeResult } from '@/lib/quiz';
import type { Child, Weekday } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { shareText } from '@/services/exportDoc';
import { Button, Card, Chip, Field, Row, Screen, Section, Sheet, space, Stack, T, useConfirm } from '@/ui';

export default function Settings() {
  const family = useStore((s) => s.family);
  const kids = useStore((s) => s.children);
  const { updateFamily, upsertChild, removeChild, exportData, importData, resetAll } = useStore.getState();
  const [editing, setEditing] = useState<Child | 'new' | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [pin, setPin] = useState('');
  const confirm = useConfirm();

  if (!family) return null;
  const toggleDay = (d: Weekday) => updateFamily({ schoolDays: family.schoolDays.includes(d) ? family.schoolDays.filter((x) => x !== d) : [...family.schoolDays, d].sort() });

  return (
    <Screen edges={[]}>
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
              <Field label="Change parent PIN" keyboardType="number-pad" maxLength={4} secureTextEntry value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, ''))} placeholder="New 4-digit PIN" />
            </View>
            <Button kind="secondary" title="Update" disabled={!/^\d{4}$/.test(pin)} onPress={() => { updateFamily({ parentPin: pin }); setPin(''); }} />
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
        <Row gap={space.md}>
          <View style={{ flex: 1 }}><Field label="Year starts" value={family.schoolYearStart} onChangeText={(schoolYearStart) => updateFamily({ schoolYearStart })} /></View>
          <View style={{ flex: 1 }}><Field label="Year ends" value={family.schoolYearEnd} onChangeText={(schoolYearEnd) => updateFamily({ schoolYearEnd })} /></View>
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

      <Section title="Your data" subtitle="Kinship is offline-first: everything lives on this device. Back up to move between devices until cloud sync arrives.">
        <Row wrap>
          <Button kind="secondary" icon="⬇️" title="Export backup" onPress={() => shareText(exportData(), `kinship-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json')} />
          <Button kind="secondary" icon="⬆️" title="Import backup" onPress={() => setImportOpen(true)} />
          <Button
            kind="danger"
            title="Erase everything"
            onPress={() =>
              confirm.ask('Erase all Kinship data on this device?', () => {
                resetAll();
                router.replace('/onboarding');
              }, { body: 'This cannot be undone. Export a backup first if you might want it later.', confirm: 'Erase' })
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
        <T muted>Paste the contents of a Kinship backup file. This replaces everything on this device.</T>
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
