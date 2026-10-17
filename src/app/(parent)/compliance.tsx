import { router } from 'expo-router';
import { useState } from 'react';

import { StateRadarCard } from '@/components/StateRadarCard';
import { useCompliance } from '@/hooks/useCompliance';
import { todayKey } from '@/lib/dates';
import { evaluatorPacketHtml } from '@/lib/documents';
import { toHours } from '@/lib/hours';
import { useStore } from '@/store/useStore';
import { exportHtml } from '@/services/exportDoc';
import { toDataUri } from '@/services/media';
import { Button, Card, Progress, Row, Screen, Section, space, Stack, T, useColors } from '@/ui';

const TOOLS = [
  { icon: '📬', title: 'Notice of Intent', body: 'Pre-filled letter, e-signature, mailing checklist.', route: '/records/noi' },
  { icon: '⏱️', title: 'Hours & Attendance', body: 'Auto-logged from completed tasks, plus manual entries.', route: '/records/hours' },
  { icon: '🗂️', title: 'Portfolio Vault', body: 'Work samples tagged by subject, date, and standard.', route: '/records/portfolio' },
  { icon: '💰', title: 'ESA & Expenses', body: 'Track ESA funds, approved vendors, and tax-deductible costs.', route: '/records/expenses' },
] as const;

export default function Compass() {
  const c = useColors();
  const { law, perChild, items, family: fam } = useCompliance();
  const state = useStore.getState();
  const [busy, setBusy] = useState(false);

  const exportPacket = async () => {
    const s = useStore.getState();
    if (!s.family) return;
    setBusy(true);
    try {
      const evidence = await Promise.all(s.evidence.map(async (e) => ({ ...e, uri: await toDataUri(e.uri) })));
      const html = evaluatorPacketHtml({ family: s.family, law, children: s.children, tasks: s.tasks, logs: s.hoursLogs, evidence, curricula: s.curricula, from: s.family.schoolYearStart, to: todayKey() });
      await exportHtml(html, `${s.family.familyName} Evaluator Packet`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <T v="display">Homeschool Compass</T>
      <T muted>Legal radar, records, and benefits for {state.family?.familyName}.</T>

      <Section title="Compliance radar">
        <Card>
          {items.map((i) => (
            <Row key={i.label} style={{ justifyContent: 'space-between' }}>
              <T style={{ flex: 1 }}>{i.ok ? '✅' : '⚠️'} {i.label}</T>
              {i.route ? <Button kind="ghost" size="sm" title="Open ›" onPress={() => router.push(i.route!)} /> : null}
            </Row>
          ))}
          {items.length === 0 ? <T muted>Choose your state in Settings to see requirements.</T> : null}
        </Card>
      </Section>

      <Section title="Hours this school year" subtitle={`Since ${state.family?.schoolYearStart} · ${fam.daysAttended} days of instruction`}>
        <Stack gap={space.sm}>
          {perChild.map(({ child, summary }) => {
            const hrs = toHours(summary.totalMin);
            const goal = law?.requiredHours;
            return (
              <Card key={child.id}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T v="heading">{child.avatar} {child.name}</T>
                  <T v="label">{hrs}{goal ? ` / ${goal}` : ''} hrs</T>
                </Row>
                {goal ? <Progress value={hrs / goal} /> : null}
                <T v="caption" muted>Core {toHours(summary.coreMin)} h · Non-core {toHours(summary.nonCoreMin)} h · {summary.daysAttended} days</T>
              </Card>
            );
          })}
        </Stack>
      </Section>

      <Section title="Records & documents">
        <Row wrap gap={space.md} align="stretch">
          {TOOLS.map((t) => (
            <Card key={t.title} onPress={() => router.push(t.route)} style={{ flexBasis: 240, flexGrow: 1 }}>
              <T style={{ fontSize: 28 }}>{t.icon}</T>
              <T v="heading">{t.title}</T>
              <T v="caption" muted>{t.body}</T>
            </Card>
          ))}
        </Row>
        <Card tint={c.primarySoft}>
          <T v="heading">📦 End-of-Year Evaluator Packet</T>
          <T v="caption">One click: hours by subject, curricula progress, student reflections, and work samples for every child — as a PDF.</T>
          <Row>
            <Button title="Export packet" icon="⬇️" loading={busy} onPress={exportPacket} />
          </Row>
        </Card>
      </Section>

      {law ? (
        <Section title="Your state">
          <StateRadarCard law={law} />
        </Section>
      ) : null}
    </Screen>
  );
}
