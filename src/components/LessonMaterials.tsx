import { useState } from 'react';
import { View } from 'react-native';

import { lessonNumber, normalizeUrl } from '@/lib/curriculum';
import { uid } from '@/lib/id';
import type { LessonMaterial, Task } from '@/lib/types';
import { deleteMaterialFile, MAX_FILE_MB, openMaterial, pickMaterialFile } from '@/services/materials';
import { useStore } from '@/store/useStore';
import { Button, Card, Field, Row, space, Stack, T, useColors } from '@/ui';

const kindIcon = (m: LessonMaterial) => (m.url ? '🔗' : m.mimeType?.startsWith('image/') ? '🖼️' : '📄');

/** Opens a material and reports any problem inline. */
function useOpen() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const open = async (m: LessonMaterial) => {
    setError('');
    setBusy(m.id);
    const e = await openMaterial(m);
    setBusy('');
    if (e) setError(e);
  };
  return { open, busy, error };
}

/**
 * "Lesson 38 of 120" plus one-tap buttons to the lesson's materials — on the
 * kid's mission and the parent's task sheet. Parents can add materials here.
 */
export function LessonCard({ task, kid }: { task: Task; kid?: boolean }) {
  const c = useColors();
  const cur = useStore((s) => s.curricula.find((k) => k.id === task.curriculumId));
  const tasks = useStore((s) => s.tasks);
  const { open, busy, error } = useOpen();
  const [editing, setEditing] = useState(false);
  if (!cur) return null;
  const n = lessonNumber(task, cur, tasks);
  const materials = cur.materials ?? [];

  return (
    <Card tint={c.primarySoft} style={kid ? { marginTop: space.md } : undefined}>
      <T v={kid ? 'title' : 'heading'}>📖 Lesson {n} of {cur.totalLessons}</T>
      <T v="caption" muted>{cur.name}</T>
      {materials.length ? (
        <Row wrap>
          {materials.map((m) => (
            <Button key={m.id} size={kid ? 'lg' : 'sm'} title={`${kindIcon(m)} Open ${m.label}`} loading={busy === m.id} onPress={() => open(m)} />
          ))}
        </Row>
      ) : kid ? (
        <T v="caption">Your lesson book or video is wherever you usually find it — ask a grown-up if you&apos;re not sure.</T>
      ) : null}
      {error ? <T v="caption" color={c.danger}>{error}</T> : null}
      {!kid ? (
        editing ? (
          <MaterialsEditor curriculumId={cur.id} />
        ) : (
          <Button kind="ghost" size="sm" title={materials.length ? 'Manage lesson links & files' : '＋ Add the lesson link or PDF'} onPress={() => setEditing(true)} />
        )
      ) : null}
    </Card>
  );
}

/** Add, open, and remove a curriculum's links and files. Saves as you go. */
export function MaterialsEditor({ curriculumId }: { curriculumId: string }) {
  const c = useColors();
  const materials = useStore((s) => s.curricula.find((k) => k.id === curriculumId)?.materials) ?? [];
  const { addMaterial, removeMaterial } = useStore.getState();
  const { open, busy, error: openError } = useOpen();
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const link = normalizeUrl(url);

  const addLink = () => {
    if (!link) return;
    addMaterial(curriculumId, { id: uid('m'), label: label.trim() || new URL(link).hostname.replace(/^www\./, ''), url: link });
    setLabel('');
    setUrl('');
  };

  const addFile = async () => {
    setError('');
    setUploading(true);
    try {
      const r = await pickMaterialFile();
      if (r && 'error' in r) setError(r.error);
      else if (r) addMaterial(curriculumId, r.material);
    } catch {
      setError('Couldn’t add that file.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Stack gap={space.sm}>
      <T v="caption" muted>Links to the online course or videos, or the lesson PDF. Kids get an “Open” button on every lesson.</T>
      {materials.map((m) => (
        <Row key={m.id} style={{ justifyContent: 'space-between' }}>
          <T style={{ flex: 1 }} numberOfLines={1}>{kindIcon(m)} {m.label}</T>
          <Button size="sm" kind="secondary" title="Open" loading={busy === m.id} onPress={() => open(m)} />
          <Button size="sm" kind="ghost" title="Remove" onPress={() => { removeMaterial(curriculumId, m.id); deleteMaterialFile(m); }} />
        </Row>
      ))}
      {openError ? <T v="caption" color={c.danger}>{openError}</T> : null}
      <Row gap={space.sm} align="flex-start" wrap>
        <View style={{ flex: 2, minWidth: 200 }}>
          <Field label="Link" value={url} onChangeText={setUrl} placeholder="https://…" autoCapitalize="none" autoCorrect={false} keyboardType="url" hint={url.trim() && !link ? 'Enter a web address, like example.com/lessons' : undefined} />
        </View>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Field label="Name (optional)" value={label} onChangeText={setLabel} placeholder="Video lessons" />
        </View>
      </Row>
      <Row wrap style={{ justifyContent: 'flex-end' }}>
        <Button kind="secondary" title={`📄 Upload PDF or image (up to ${MAX_FILE_MB} MB)`} loading={uploading} onPress={addFile} />
        <Button title="Add link" disabled={!link} reason="Enter a web address" onPress={addLink} />
      </Row>
      {error ? <T v="caption" color={c.danger}>{error}</T> : null}
    </Stack>
  );
}
