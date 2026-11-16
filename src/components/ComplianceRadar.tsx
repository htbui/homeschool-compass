import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { splitRadar, type RadarItem } from '@/lib/compliance';
import { formatDate, todayKey } from '@/lib/dates';
import { useStore } from '@/store/useStore';
import { Actions, Button, Card, DateField, Row, Sheet, space, T, useColors } from '@/ui';

/** Run an item's next step: open its record screen, or plan the assessment date. */
function useRadarAction() {
  const [assessing, setAssessing] = useState(false);
  const run = (i: RadarItem) => {
    if (i.action?.kind === 'assessment') setAssessing(true);
    else if (i.action?.route) router.push(i.action.route);
  };
  return { run, sheet: assessing ? <AssessmentSheet visible onClose={() => setAssessing(false)} /> : null };
}

/**
 * The compliance radar as two lists: what to do (with due dates and a button for the next
 * step) and what's on track. Ordinary year-to-date progress is never a warning.
 */
export function ComplianceRadar({ items }: { items: RadarItem[] }) {
  const c = useColors();
  const { run, sheet } = useRadarAction();
  const { todo, onTrack } = splitRadar(items);
  return (
    <>
      {todo.length ? (
        <Card tint={c.accentSoft} label="To do">
          <T v="label" color={c.accentInk}>To do</T>
          {todo.map((i) => (
            <Row key={i.label} wrap align="flex-start" style={{ justifyContent: 'space-between', borderTopWidth: 1, borderColor: c.border, paddingTop: space.sm }}>
              <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
                <T style={{ fontWeight: '700' }} color={c.accentInk}>{i.status === 'behind' ? '⏳' : '📌'} {i.label}</T>
                {i.detail ? <T v="caption" color={c.accentInk}>{i.detail}</T> : null}
              </View>
              {i.action ? <Button size="sm" kind="secondary" title={`${i.action.label} ›`} onPress={() => run(i)} /> : null}
            </Row>
          ))}
        </Card>
      ) : null}
      {onTrack.length ? (
        <Card>
          <T v="label">On track</T>
          {onTrack.map((i) => (
            <Row key={i.label} wrap align="flex-start" style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
                <T>
                  <T color={c.successInk}>{i.status === 'info' ? 'ℹ️' : '✓'}</T> {i.label}
                </T>
                {i.detail ? <T v="caption" muted>{i.detail}</T> : null}
              </View>
              {i.action ? <Button size="sm" kind="ghost" title={`${i.action.label} ›`} onPress={() => run(i)} /> : i.route ? <Button size="sm" kind="ghost" title="Open ›" onPress={() => router.push(i.route!)} /> : null}
            </Row>
          ))}
        </Card>
      ) : null}
      {sheet}
    </>
  );
}

/** Today's radar: just the most urgent thing, with its next step and a way to see the rest. */
export function RadarTopItem({ items }: { items: RadarItem[] }) {
  const c = useColors();
  const { run, sheet } = useRadarAction();
  const { todo, onTrack } = splitRadar(items);
  const top = todo[0];
  return (
    <>
      {top ? (
        <View style={{ gap: 4 }}>
          <T style={{ fontWeight: '700' }}>{top.status === 'behind' ? '⏳' : '📌'} {top.label}</T>
          {top.detail ? <T v="caption" muted>{top.detail}</T> : null}
          <Row wrap>
            {top.action ? <Button size="sm" kind="secondary" title={`${top.action.label} ›`} onPress={() => run(top)} /> : null}
            <Button size="sm" kind="ghost" title={todo.length > 1 ? `See all (${todo.length} to do) ›` : 'See all ›'} onPress={() => router.push('/compliance')} />
          </Row>
        </View>
      ) : (
        <View style={{ gap: 4 }}>
          <T><T color={c.successInk}>✓</T> All on track{onTrack.length ? ` (${onTrack.length} item${onTrack.length === 1 ? '' : 's'})` : ''}</T>
          <Row>
            <Button size="sm" kind="ghost" title="See all ›" onPress={() => router.push('/compliance')} />
          </Row>
        </View>
      )}
      {sheet}
    </>
  );
}

/** Pick (or change) the day of this year's assessment / evaluation. */
function AssessmentSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const current = useStore((s) => s.family?.assessmentDate);
  const updateFamily = useStore((s) => s.updateFamily);
  const [date, setDate] = useState<string | undefined>(current);
  return (
    <Sheet visible={visible} onClose={onClose} title="Plan the assessment" dirty={date !== current}>
      <T muted>When is this year’s test or evaluator review? It shows on your radar until then. Book it early: evaluators fill up in spring.</T>
      <DateField label="Assessment date" value={date} onChange={setDate} validate={(d) => (d < todayKey() && d !== current ? 'Pick today or a later date' : undefined)} />
      {current ? <T v="caption" muted>Currently planned: {formatDate(current, { weekday: 'long', month: 'long', day: 'numeric' })}</T> : null}
      <Actions>
        {current ? <Button kind="quietDanger" title="Clear date" onPress={() => { updateFamily({ assessmentDate: undefined }); setDate(undefined); onClose(); }} /> : null}
        <Button kind="secondary" title="Cancel" onPress={onClose} />
        <Button title="Save" disabled={!date} reason="Still needed: a valid date" onPress={() => { updateFamily({ assessmentDate: date }); onClose(); }} />
      </Actions>
    </Sheet>
  );
}
