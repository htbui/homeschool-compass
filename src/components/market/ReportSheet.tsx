import { useState } from 'react';

import { cloudEnabled } from '@/services/cloud';
import { reportContent, type ReportReason, type ReportTarget } from '@/services/marketApi';
import { useAccount } from '@/store/useAccount';
import { Button, Card, Chip, Field, Row, Sheet, Stack, T, useColors } from '@/ui';

const REASONS: { value: ReportReason; label: string; listingOnly?: boolean }[] = [
  { value: 'copyright', label: '©️ Copies my work or breaks a license', listingOnly: true },
  { value: 'inappropriate', label: '🚫 Not appropriate for families' },
  { value: 'misleading', label: '🤔 Misleading or not as described' },
  { value: 'spam', label: '📣 Spam or a scam' },
  { value: 'personal_info', label: '🔒 Shares someone’s private information' },
  { value: 'other', label: 'Something else' },
];

/** Report a listing or review to the Freerange moderators. */
export function ReportSheet({ target, name, onClose }: { target?: ReportTarget; name?: string; onClose: () => void }) {
  return (
    <Sheet visible={!!target} onClose={onClose} title={target?.kind === 'review' ? 'Report this review' : 'Report this listing'}>
      {target ? <ReportForm key={target.id} target={target} name={name} onClose={onClose} /> : null}
    </Sheet>
  );
}

function ReportForm({ target, name, onClose }: { target: ReportTarget; name?: string; onClose: () => void }) {
  const c = useColors();
  const signedIn = useAccount((s) => !!s.userId);
  const [reason, setReason] = useState<ReportReason | undefined>();
  const [details, setDetails] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ hidden: boolean } | null>(null);
  const copyright = reason === 'copyright';
  const missing = [!reason && 'a reason', copyright && !details.trim() && 'which work it copies', copyright && !contact.trim() && 'how to reach you'].filter(Boolean);

  if (sent) {
    return (
      <Stack>
        <T v="heading">Thanks, we got it.</T>
        <T>
          A Freerange moderator will look at {name ? `“${name}”` : 'it'} and decide whether it stays up.
          {sent.hidden ? ' Several families reported it, so it’s hidden until then.' : ''}
        </T>
        <Row style={{ justifyContent: 'flex-end' }}>
          <Button title="Done" onPress={onClose} />
        </Row>
      </Stack>
    );
  }
  if (!cloudEnabled || !signedIn) {
    return (
      <Stack>
        <T>Reports go to the Freerange moderators, so they need an account. Sign in under Settings → Account &amp; sync, then report it again.</T>
        <Row style={{ justifyContent: 'flex-end' }}>
          <Button title="OK" onPress={onClose} />
        </Row>
      </Stack>
    );
  }

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    setError('');
    try {
      setSent(await reportContent(target, reason, details, copyright ? contact : undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack>
      {name ? <T muted>{name}</T> : null}
      <Stack gap={6}>
        <T v="label">What’s wrong?</T>
        <Row wrap gap={6}>
          {REASONS.filter((r) => target.kind === 'listing' || !r.listingOnly).map((r) => (
            <Chip key={r.value} label={r.label} selected={reason === r.value} onPress={() => setReason(r.value)} />
          ))}
        </Row>
      </Stack>
      {copyright ? (
        <Card tint={c.surfaceAlt}>
          <T v="caption">
            Copyright claims are for the owner of the work (or someone acting for them). Tell us which work is copied and where it appears in this listing. We may share your claim with the seller so they can respond.
          </T>
        </Card>
      ) : null}
      <Field
        label={copyright ? 'Your original work and what was copied' : 'Details (optional)'}
        value={details}
        onChangeText={(v) => setDetails(v.slice(0, 2000))}
        multiline
        placeholder={copyright ? '“Pond Days” (2021), chapters 1–3 copied into lessons 1–9' : 'What should the moderators look at?'}
      />
      {copyright ? <Field label="Email or phone to reach you" value={contact} onChangeText={(v) => setContact(v.slice(0, 200))} autoCapitalize="none" /> : null}
      {error ? <T color={c.danger}>{error}</T> : null}
      <Row style={{ justifyContent: 'flex-end' }} wrap>
        <Button kind="ghost" title="Cancel" onPress={onClose} />
        <Button title="Send report" disabled={missing.length > 0} reason={`Still needed: ${missing.join(', ')}`} loading={busy} onPress={send} />
      </Row>
    </Stack>
  );
}
