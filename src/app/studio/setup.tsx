import { router } from 'expo-router';
import { useState } from 'react';

import { normalizeUrl } from '@/lib/curriculum';
import { cloudEnabled } from '@/services/cloud';
import { saveCreatorProfile } from '@/services/studioApi';
import { useAccount } from '@/store/useAccount';
import { useStudio } from '@/store/useStudio';
import { Button, Card, Field, Row, Screen, Section, space, Stack, T, useColors } from '@/ui';

/** The creator's shop profile: the seller name families see on the Marketplace. */
export default function CreatorSetup() {
  const c = useColors();
  const profile = useStudio((s) => s.profile);
  const signedIn = useAccount((s) => !!s.userId);
  const [name, setName] = useState(profile?.name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [website, setWebsite] = useState(profile?.website ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const site = website.trim() ? normalizeUrl(website) : '';
  const missing = [name.trim().length < 2 && 'a creator or shop name (2+ characters)', site === undefined && 'a valid website (or leave it blank)'].filter(Boolean);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await saveCreatorProfile({ name, bio, website: site || undefined });
      useStudio.getState().setActive(true);
      if (router.canGoBack() && profile) router.back();
      else router.replace('/studio');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={[]}>
      {!profile ? (
        <Stack gap={space.sm}>
          <T v="display">🎨 Freerange Studio</T>
          <T muted>Make lesson-by-lesson curricula that families can add to their day in one tap — write your own, or turn a free online course into a ready-to-teach plan. Families find them in the Marketplace.</T>
        </Stack>
      ) : null}
      <Section title="Your creator profile" subtitle="Shown as the seller on your curricula.">
        <Field label="Creator or shop name" value={name} onChangeText={setName} placeholder="Maple Room Studio" maxLength={60} />
        <Field label="About you (optional)" value={bio} onChangeText={setBio} multiline placeholder="Former 3rd-grade teacher making hands-on math for homeschoolers." maxLength={1000} />
        <Field label="Website (optional)" value={website} onChangeText={setWebsite} placeholder="example.com" autoCapitalize="none" keyboardType="url" hint={site === undefined ? 'Enter a web address, like example.com' : undefined} />
      </Section>
      {cloudEnabled && !signedIn ? (
        <Card tint={c.accentSoft}>
          <T>To publish to everyone and get paid, sign in to a Freerange account. You can start drafting now; your work moves to your account when you sign in.</T>
          <Row>
            <Button size="sm" kind="secondary" title="Sign in or create an account" onPress={() => router.push('/account')} />
          </Row>
        </Card>
      ) : null}
      {error ? <T color={c.danger}>{error}</T> : null}
      <Row style={{ justifyContent: 'flex-end', marginTop: space.lg }}>
        <Button title={profile ? 'Save' : 'Open my Studio'} disabled={missing.length > 0} reason={`Still needed: ${missing.join(', ')}`} loading={busy} onPress={save} />
      </Row>
    </Screen>
  );
}
