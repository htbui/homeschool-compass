import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { uid } from '@/lib/id';
import type { Listing, Review } from '@/lib/market';
import { useStore } from '@/store/useStore';
import { submitReview } from '@/services/marketApi';
import { Button, Chip, Field, Row, Sheet, Stack, T, useColors } from '@/ui';

const WORDS = ['', 'Didn’t work for us', 'Not a great fit', 'It’s okay', 'Really good', 'Love it'];

/** Write or edit this family's review of a listing (one per listing). */
export function ReviewSheet({ listing, existing, visible, onClose }: { listing: Listing; existing?: Review; visible: boolean; onClose: () => void }) {
  return visible ? <ReviewForm listing={listing} existing={existing} onClose={onClose} /> : null;
}

function ReviewForm({ listing, existing, onClose }: { listing: Listing; existing?: Review; onClose: () => void }) {
  const c = useColors();
  const family = useStore((s) => s.family)!;
  const kids = useStore((s) => s.children);
  const owned = useStore((s) => s.purchases.some((p) => p.listingId === listing.id));
  const [rating, setRating] = useState<number>(existing?.rating ?? 0);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [grade, setGrade] = useState<string | undefined>(existing?.childGrade);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const grades = [...new Set(kids.map((k) => k.grade))];
  const missing = [!rating && 'a star rating', body.trim().length < 10 && 'a few words about your experience (10+ characters)'].filter(Boolean);

  const save = async () => {
    setBusy(true);
    setError('');
    const parts = family.parentName.trim().split(/\s+/);
    const review: Review = {
      id: existing?.id ?? uid('r'),
      listingId: listing.id,
      author: parts.length > 1 ? `${parts[0]} ${parts.at(-1)![0]}.` : parts[0],
      rating: rating as Review['rating'],
      title: title.trim() || WORDS[rating],
      body: body.trim(),
      childGrade: grade,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      verified: owned,
      helpful: existing?.helpful ?? 0,
      mine: true,
    };
    try {
      await submitReview(review);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your review');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible onClose={onClose} title={existing ? 'Edit your review' : 'Write a review'}>
      <T muted>{listing.title}</T>
      <Stack gap={4}>
        <Row gap={4}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setRating(n)} accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`} hitSlop={4}>
              <Text style={{ fontSize: 36, color: n <= rating ? c.accent : c.border }}>★</Text>
            </Pressable>
          ))}
        </Row>
        <T v="caption" muted>{rating ? WORDS[rating] : 'Tap a star to rate'}</T>
      </Stack>
      <Field label="Headline (optional)" value={title} onChangeText={setTitle} placeholder={rating ? WORDS[rating] : 'Sum it up'} />
      <Field label="Your review" multiline value={body} onChangeText={setBody} placeholder="What worked, what didn't, and who it's best for." style={{ minHeight: 110 }} />
      {grades.length ? (
        <Stack gap={6}>
          <T v="label">Used with</T>
          <Row wrap gap={6}>
            {grades.map((g) => (
              <Chip key={g} label={g} selected={grade === g} onPress={() => setGrade(grade === g ? undefined : g)} />
            ))}
          </Row>
        </Stack>
      ) : null}
      <T v="caption" muted>{owned ? '✓ Shown as a verified purchase.' : 'You haven’t bought this through Freerange, so it won’t carry a verified-purchase badge.'} Reviews show your first name and last initial only.</T>
      {error ? <T color={c.danger}>{error}</T> : null}
      <Row style={{ justifyContent: 'flex-end' }}>
        <Button kind="secondary" title="Cancel" onPress={onClose} />
        <Button title={existing ? 'Save review' : 'Post review'} loading={busy} disabled={missing.length > 0} reason={`Still needed: ${missing.join(', ')}`} onPress={save} />
      </Row>
    </Sheet>
  );
}
