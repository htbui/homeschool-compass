import { useEffect, useState } from 'react';

import { formatDate } from '@/lib/dates';
import { myVerification, requestVerification, type MyVerification } from '@/services/verification';
import { Button, Card, Field, Row, Sheet, T, useColors } from '@/ui';

import { VerifiedBadge } from './VerifiedBadge';

/** The family's Verified status, with a way to ask for it. */
export function VerificationCard() {
  const c = useColors();
  const [v, setV] = useState<MyVerification | undefined>();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    myVerification()
      .then((r) => alive && setV(r))
      .catch(() => alive && setV({ status: 'none' }));
    return () => {
      alive = false;
    };
  }, []);

  if (!v) return null;
  if (v.status === 'verified') {
    return (
      <Card tint={c.successSoft}>
        <Row wrap>
          <VerifiedBadge />
          <T v="caption">Other families see this next to your name.</T>
        </Row>
      </Card>
    );
  }

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      await requestVerification(note);
      setV({ status: 'pending', requestedAt: new Date().toISOString() });
      setAsking(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <T v="heading">🛡️ Get a Verified badge</T>
      {v.status === 'pending' ? (
        <T>Thanks! The Freerange team got your request{v.requestedAt ? ` on ${formatDate(v.requestedAt.slice(0, 10), { month: 'short', day: 'numeric' })}` : ''} and will reach out using your contact details.</T>
      ) : (
        <>
          <T muted>
            {v.status === 'declined' || v.status === 'revoked'
              ? 'Your family isn’t verified right now. You can ask again.'
              : 'Families feel better meeting someone the Freerange team has checked. Ask to be verified, and we’ll set up a short video call.'}
          </T>
          <Row>
            <Button size="sm" title="Ask to be verified" onPress={() => setAsking(true)} />
          </Row>
        </>
      )}
      <Sheet visible={asking} onClose={() => setAsking(false)} title="Ask to be verified">
        <T>A Freerange team member will contact you (using the contact details in your profile) for a short video call with a parent. Once they’ve checked, your family gets a ✓ Verified badge in the family finder and in messages.</T>
        <T v="caption" muted>We never ask you to upload an ID to Freerange.</T>
        <Field label="Anything we should know? (optional)" multiline value={note} onChangeText={(t) => setNote(t.slice(0, 500))} placeholder="Weekday mornings work best for a call." />
        {error ? <T color={c.danger}>{error}</T> : null}
        <Row style={{ justifyContent: 'flex-end' }}>
          <Button kind="secondary" title="Cancel" onPress={() => setAsking(false)} />
          <Button title="Send request" loading={busy} onPress={send} />
        </Row>
      </Sheet>
    </Card>
  );
}
