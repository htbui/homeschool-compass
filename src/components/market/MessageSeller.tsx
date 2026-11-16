import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { needsAccount } from '@/components/AccountNote';
import type { Listing } from '@/lib/market';
import { cloudEnabled } from '@/services/cloud';
import { refreshConversations } from '@/services/inbox';
import { messageSeller, messagesLive } from '@/services/messagesApi';
import { useAccount } from '@/store/useAccount';
import { useInbox } from '@/store/useInbox';
import { Actions, Button, Field, Sheet, Stack, T, useColors } from '@/ui';

const MAX = 2000;

const openThread = (familyId: string) => router.push({ pathname: '/messages/[familyId]', params: { familyId } });

/**
 * "💬 Message the seller" for a used curriculum a family is selling. It starts a private
 * conversation (no Community connection needed) in Messages, where block and report work as usual.
 * Neither family's contact details are shared.
 */
export function MessageSellerButton({ listing, kind = 'secondary', title = '💬 Message the seller' }: { listing: Listing; kind?: 'primary' | 'secondary'; title?: string }) {
  const signedIn = useAccount((s) => !!s.userId && !!s.familyId && !s.conflict);
  const existing = useInbox((s) => s.conversations.find((c) => c.listingId === listing.id && c.seller));
  const [open, setOpen] = useState(false);
  // Listing pages sit outside the tabs that keep the inbox live, so load it here.
  useEffect(() => {
    if (signedIn) refreshConversations();
  }, [signedIn]);
  if (existing) return <Button kind={kind} title="💬 Open your conversation" onPress={() => openThread(existing.familyId)} />;
  if (!cloudEnabled) return null;
  if (!signedIn) return <Button kind={kind} title="💬 Sign in to message the seller" onPress={() => router.push('/account')} />;
  return (
    <>
      <Button kind={kind} title={title} onPress={() => setOpen(true)} />
      {open ? <MessageSellerSheet listing={listing} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function MessageSellerSheet({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  const c = useColors();
  const [body, setBody] = useState(`Hi! Is “${listing.title}” still available? `);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await messageSeller(listing.id, body);
      await refreshConversations();
      onClose();
      openThread(r.familyId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const live = messagesLive();
  return (
    <Sheet
      visible
      onClose={onClose}
      title="Message the seller"
      dirty={body.trim().length > 0 && !body.startsWith('Hi! Is “')}
      discardQuestion="Discard your message?"
      footer={
        <Actions>
          <Button kind="secondary" title="Cancel" onPress={onClose} />
          <Button title="Send" loading={busy} disabled={!live || !body.trim()} reason={!live ? 'Still needed: your family set up in Settings → Account' : 'Still needed: a message'} onPress={send} />
        </Actions>
      }>
      <T muted>
        {listing.title} · {listing.seller}
      </T>
      <Field label="Your message" multiline value={body} onChangeText={(t) => setBody(t.slice(0, MAX))} style={{ minHeight: 110 }} />
      <Stack gap={4}>
        <T v="caption" muted>Only your two families can read this conversation. Freerange doesn’t share your email, phone, or address, and you can block or report the family at any time.</T>
        <T v="caption" muted>Arrange pickup in a public place (a library or coffee shop), or ship it. Never share your home address.</T>
      </Stack>
      {error ? <T color={c.danger} accessibilityLiveRegion="polite">{error}</T> : null}
      {!live ? <T v="caption" muted>{needsAccount('Finish setting up your family under Settings → Account first.', 'Messages need the connected app.')}</T> : null}
    </Sheet>
  );
}
