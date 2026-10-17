import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { formatDate, todayKey } from '@/lib/dates';
import { SUBJECT_LIST, SUBJECTS, subjectLabel } from '@/lib/subjects';
import type { Evidence, Subject } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { deletePhoto, pickPhoto } from '@/services/media';
import { Button, Card, Chip, Empty, Field, Row, Screen, Section, Sheet, space, Stack, T, useConfirm } from '@/ui';

export default function PortfolioVault() {
  const kids = useStore((s) => s.children);
  const evidence = useStore((s) => s.evidence);
  const { addEvidence, removeEvidence } = useStore.getState();
  const [filterKid, setFilterKid] = useState<string | 'all'>('all');
  const [filterSubject, setFilterSubject] = useState<Subject | 'all'>('all');
  const [draft, setDraft] = useState<Omit<Evidence, 'id'> | null>(null);
  const [view, setView] = useState<Evidence | null>(null);
  const confirm = useConfirm();

  const shown = evidence.filter((e) => (filterKid === 'all' || e.childId === filterKid) && (filterSubject === 'all' || e.subject === filterSubject));
  const kid = (id: string) => kids.find((k) => k.id === id);

  const capture = async (source: 'camera' | 'library') => {
    const uri = await pickPhoto(source);
    if (uri) setDraft({ uri, childId: filterKid !== 'all' ? filterKid : kids[0]?.id ?? '', subject: filterSubject !== 'all' ? filterSubject : 'math', date: todayKey(), note: '' });
  };

  return (
    <Screen edges={[]}>
      <T muted>Snap worksheets, dioramas, handwriting, and projects. Tag by subject and learning standard for your evaluator.</T>
      <Row wrap style={{ marginTop: space.lg }}>
        <Button icon="📷" title="Take photo" onPress={() => capture('camera')} />
        <Button kind="secondary" icon="🖼️" title="Upload" onPress={() => capture('library')} />
      </Row>

      <Section title={`${shown.length} work sample${shown.length === 1 ? '' : 's'}`}>
        <Row wrap gap={6}>
          <Chip label="All kids" selected={filterKid === 'all'} onPress={() => setFilterKid('all')} />
          {kids.map((k) => (
            <Chip key={k.id} label={`${k.avatar} ${k.name}`} selected={filterKid === k.id} onPress={() => setFilterKid(k.id)} />
          ))}
        </Row>
        <Row wrap gap={6}>
          <Chip label="All subjects" selected={filterSubject === 'all'} onPress={() => setFilterSubject('all')} />
          {SUBJECT_LIST.filter((s) => evidence.some((e) => e.subject === s)).map((s) => (
            <Chip key={s} label={`${SUBJECTS[s].icon} ${SUBJECTS[s].label}`} selected={filterSubject === s} onPress={() => setFilterSubject(s)} />
          ))}
        </Row>
        {shown.length === 0 ? (
          <Empty icon="🗂️" title="No samples yet" body="Kids can also add photos from their mission cards." />
        ) : (
          <Row wrap gap={space.md} align="flex-start">
            {shown.map((e) => (
              <Pressable key={e.id} onPress={() => setView(e)} style={{ width: 160 }}>
                <Image source={{ uri: e.uri }} style={{ width: 160, height: 140, borderRadius: 12 }} />
                <T v="caption" numberOfLines={1}>{kid(e.childId)?.avatar} {subjectLabel(e.subject)} · {formatDate(e.date)}</T>
                {e.note ? <T v="caption" muted numberOfLines={1}>{e.note}</T> : null}
              </Pressable>
            ))}
          </Row>
        )}
      </Section>

      <Sheet visible={!!draft} onClose={() => setDraft(null)} title="Tag this sample">
        {draft ? (
          <Stack gap={space.md}>
            <Image source={{ uri: draft.uri }} style={{ width: '100%', height: 220, borderRadius: 12 }} resizeMode="contain" />
            <Row wrap gap={6}>
              {kids.map((k) => (
                <Chip key={k.id} label={`${k.avatar} ${k.name}`} selected={draft.childId === k.id} onPress={() => setDraft({ ...draft, childId: k.id })} />
              ))}
            </Row>
            <Row wrap gap={6}>
              {SUBJECT_LIST.map((s) => (
                <Chip key={s} label={`${SUBJECTS[s].icon} ${SUBJECTS[s].label}`} selected={draft.subject === s} onPress={() => setDraft({ ...draft, subject: s })} />
              ))}
            </Row>
            <Field label="Date" value={draft.date} onChangeText={(date) => setDraft({ ...draft, date })} />
            <Field label="Note" value={draft.note} onChangeText={(note) => setDraft({ ...draft, note })} placeholder="Long division practice, p. 42" />
            <Field label="Learning standard (optional)" value={draft.standard ?? ''} onChangeText={(standard) => setDraft({ ...draft, standard })} placeholder="CCSS.MATH.4.NBT.B.6" />
            <Button
              title="Save to portfolio"
              disabled={!draft.childId}
              onPress={() => {
                addEvidence({ ...draft, standard: draft.standard?.trim() || undefined });
                setDraft(null);
              }}
            />
          </Stack>
        ) : null}
      </Sheet>

      <Sheet visible={!!view} onClose={() => setView(null)} title={view ? `${kid(view.childId)?.name} · ${subjectLabel(view.subject)}` : ''}>
        {view ? (
          <View style={{ gap: space.md }}>
            <Image source={{ uri: view.uri }} style={{ width: '100%', height: 320, borderRadius: 12 }} resizeMode="contain" />
            <T>{formatDate(view.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</T>
            {view.note ? <T>{view.note}</T> : null}
            {view.standard ? <Card><T v="caption">Standard: {view.standard}</T></Card> : null}
            <Button
              kind="danger"
              title="Delete sample"
              onPress={() =>
                confirm.ask('Delete this sample?', () => {
                  deletePhoto(view.uri);
                  removeEvidence(view.id);
                  setView(null);
                }, { confirm: 'Delete' })
              }
            />
          </View>
        ) : null}
      </Sheet>
      {confirm.element}
    </Screen>
  );
}
