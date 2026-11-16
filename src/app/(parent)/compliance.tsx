import { router } from 'expo-router';
import { useState } from 'react';

import { ComplianceRadar } from '@/components/ComplianceRadar';
import { StateRadarCard } from '@/components/StateRadarCard';
import { useCompliance } from '@/hooks/useCompliance';
import { formatDate, todayKey } from '@/lib/dates';
import { evaluatorPacketHtml } from '@/lib/documents';
import { toHours } from '@/lib/hours';
import { missingSentence, standardLabel } from '@/lib/standards';
import { SUBJECTS } from '@/lib/subjects';
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
  const { law, perChild, items, family: fam, coverage, missing } = useCompliance();
  const [showStandards, setShowStandards] = useState(false);
  const tagged = coverage.reduce((n, cv) => n + cv.standards.length, 0);
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

      <Section title="Compliance radar" subtitle="What to do next, and what’s on track for this school year.">
        {items.length ? <ComplianceRadar items={items} /> : <Card><T muted>Choose your state in Settings to see requirements.</T></Card>}
      </Section>

      <Section title="Subject coverage" subtitle="From your curricula, your weekly rhythm, and the standards tagged in lesson plans.">
        <Card>
          {coverage.length === 0 ? <T muted>Add curricula or rhythm blocks to see which subjects your plan covers.</T> : null}
          {coverage.map((cv) => (
            <Stack key={cv.subject} gap={2}>
              <T>
                {SUBJECTS[cv.subject].icon} <T style={{ fontWeight: '700' }}>{SUBJECTS[cv.subject].label}</T>
                <T v="caption" muted> · {cv.sources.slice(0, 3).join(', ')}{cv.sources.length > 3 ? ` +${cv.sources.length - 3} more` : ''}{cv.standards.length ? ` · ${cv.standards.length} standard${cv.standards.length === 1 ? '' : 's'} tagged` : ''}</T>
              </T>
              {showStandards && cv.standards.length ? <T v="caption" muted>{cv.standards.map(standardLabel).join(' · ')}</T> : null}
            </Stack>
          ))}
          {tagged ? (
            <Row>
              <Button size="sm" kind="ghost" title={showStandards ? 'Hide standards' : `Show ${tagged} tagged standard${tagged === 1 ? '' : 's'}`} onPress={() => setShowStandards(!showStandards)} />
            </Row>
          ) : null}
          {missing.length ? (
            <Card tint={c.accentSoft}>
              <T>⚠️ {missingSentence(state.family?.stateCode, missing)}</T>
              <T v="caption" muted>Add a curriculum or a rhythm block for {missing.length === 1 ? 'it' : 'them'}, or check your state’s rules if you already teach {missing.length === 1 ? 'it' : 'them'} another way.</T>
            </Card>
          ) : null}
        </Card>
      </Section>

      <Section title="Hours this school year" subtitle={`${state.family ? `Since ${formatDate(state.family.schoolYearStart, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · ` : ''}${fam.daysAttended} day${fam.daysAttended === 1 ? '' : 's'} of instruction`}>
        <Stack gap={space.sm}>
          {perChild.map(({ child, summary }) => {
            const hrs = toHours(summary.totalMin);
            const goal = law?.requiredHours;
            return (
              <Card key={child.id}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T v="heading">{child.avatar} {child.name}</T>
                  <T v="label">{hrs}{goal ? ` of ${goal}` : ''} hrs</T>
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
