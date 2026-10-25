import { useState } from 'react';

import { NOI_CHECKLIST, noiHtml } from '@/lib/documents';
import { getStateLaw, VERIFY_NOTICE } from '@/lib/states';
import { useStore } from '@/store/useStore';
import { exportHtml } from '@/services/exportDoc';
import { Button, Card, Chip, Empty, Field, Row, Screen, Section, space, Stack, T, useColors } from '@/ui';

export default function NoiScreen() {
  const c = useColors();
  const family = useStore((s) => s.family)!;
  const kids = useStore((s) => s.children);
  const noi = useStore((s) => s.noi);
  const updateNoi = useStore((s) => s.updateNoi);
  const law = getStateLaw(family.stateCode);
  const [busy, setBusy] = useState(false);

  if (!law) return <Screen edges={[]}><Empty icon="🗺️" title="Choose your state in Settings first" /></Screen>;

  const signed = !!noi.signedAt;
  const canSign = noi.signature.trim().length > 2 && noi.address.trim() && noi.parentName.trim();

  const exportLetter = async () => {
    setBusy(true);
    try {
      await exportHtml(noiHtml(family, law, kids, noi), `Notice of Intent ${noi.schoolYear}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={[]}>
      {!law.noticeRequired ? (
        <Card tint={c.successSoft}>
          <T v="heading">✅ {law.name} doesn&apos;t require a notice</T>
          <T>You can still generate a letter for your records — useful when withdrawing from a public school.</T>
        </Card>
      ) : (
        <Card tint={c.accentSoft}>
          <T v="heading">📬 {law.name} requires notice</T>
          <T>{law.noticeNote}</T>
        </Card>
      )}

      <Section title="Letter details">
        <Stack gap={space.md}>
          <Field label="School year" value={noi.schoolYear} onChangeText={(schoolYear) => updateNoi({ schoolYear })} />
          <Field label="Parent / educator name" value={noi.parentName} onChangeText={(parentName) => updateNoi({ parentName })} />
          <Field label="Home address" multiline value={noi.address} onChangeText={(address) => updateNoi({ address })} placeholder={'123 Maple St\nDenver, CO 80202'} />
          <Field label="School district" value={noi.district} onChangeText={(district) => updateNoi({ district })} placeholder="Denver Public Schools" />
          <Field label="Superintendent (or office)" value={noi.superintendent} onChangeText={(superintendent) => updateNoi({ superintendent })} placeholder="Office of the Superintendent" />
          <T v="caption" muted>Children included: {kids.map((k) => `${k.name} (${k.grade})`).join(', ')}</T>
        </Stack>
      </Section>

      <Section title="Digital signature">
        <Field label="Type your full legal name to sign" value={noi.signature} onChangeText={(signature) => updateNoi({ signature, signedAt: undefined })} />
        <T v="caption" muted>By signing you confirm the information is accurate. Some districts require a wet signature or notarization (e.g. Pennsylvania) — print and sign if so.</T>
        <Row wrap>
          {signed ? (
            <Button kind="secondary" title={`Signed ${noi.signedAt!.slice(0, 10)} · Unsign`} onPress={() => updateNoi({ signedAt: undefined, checklist: { ...noi.checklist, signed: false } })} />
          ) : (
            <Button title="Sign letter ✍️" disabled={!canSign} reason={`Still needed: ${[!noi.parentName.trim() && 'educator name', !noi.address.trim() && 'home address', noi.signature.trim().length <= 2 && 'your typed signature'].filter(Boolean).join(', ')}`} onPress={() => updateNoi({ signedAt: new Date().toISOString(), checklist: { ...noi.checklist, signed: true } })} />
          )}
          <Button kind={signed ? 'primary' : 'secondary'} icon="⬇️" title="Export PDF" loading={busy} onPress={exportLetter} />
        </Row>
      </Section>

      <Section title="Proof-of-mailing checklist">
        <Stack gap={6}>
          {NOI_CHECKLIST.map((item) => (
            <Chip key={item.key} label={`${noi.checklist[item.key] ? '✓' : '○'}  ${item.label}`} selected={!!noi.checklist[item.key]} onPress={() => updateNoi({ checklist: { ...noi.checklist, [item.key]: !noi.checklist[item.key] } })} />
          ))}
        </Stack>
      </Section>
      <T v="caption" muted style={{ marginTop: space.xl }}>{VERIFY_NOTICE}</T>
    </Screen>
  );
}
