import { router, Stack as RouterStack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { EsaBadge, VerifiedBadge } from '@/components/market/SellerBadges';
import { badgeIssues, emptyBadgeDraft, ESA_EXPLAINER, ESA_PROGRAM_STATES, stateList, stateName, VERIFIED_EXPLAINER, type Badge, type BadgeApplication, type BadgeDraft } from '@/lib/creators';
import { formatDate } from '@/lib/dates';
import { STATE_LAWS } from '@/lib/states';
import { cloudEnabled } from '@/services/cloud';
import { applyForBadge, myBadges, withdrawApplication, type MyBadges } from '@/services/creatorApi';
import { useAccount } from '@/store/useAccount';
import { Button, Card, Chip, Field, Row, Screen, Section, Segmented, space, Stack, T, useColors } from '@/ui';

const TITLE: Record<Badge, string> = { verified: '✓ Get verified', esa: '🏛️ ESA vendor listing' };

/** Apply for the verified-creator badge or to be listed as an ESA vendor. Freerange moderators review each one. */
export default function BadgeApplicationScreen() {
  const c = useColors();
  const params = useLocalSearchParams<{ kind?: string }>();
  const badge: Badge = params.kind === 'esa' ? 'esa' : 'verified';
  const userId = useAccount((s) => s.userId);
  const [mine, setMine] = useState<MyBadges | null | undefined>(undefined);
  const [draft, setDraft] = useState<BadgeDraft>(emptyBadgeDraft());
  const [editing, setEditing] = useState(false);
  const [allStates, setAllStates] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    myBadges()
      .then((m) => alive && setMine(m ?? null))
      .catch((e) => alive && (setError(e instanceof Error ? e.message : String(e)), setMine(null)));
    return () => {
      alive = false;
    };
  }, [userId, tick]);

  const app: BadgeApplication | undefined = mine?.latest[badge];
  const has = badge === 'verified' ? !!mine?.verified : !!mine?.esaStates.length;
  const pending = app?.status === 'pending';
  const showForm = !!userId && !!mine && (editing || (!has && !pending));
  const set = (p: Partial<BadgeDraft>) => setDraft((d) => ({ ...d, ...p }));
  const issues = badgeIssues(badge, draft);

  const startEdit = () => {
    if (app) setDraft({ sellerType: app.sellerType, legalName: app.legalName, website: app.website, about: app.about, sampleUrl: app.sampleUrl, states: app.states, vendorInfo: app.vendorInfo });
    setEditing(true);
  };
  const send = async () => {
    setBusy('send');
    setError('');
    try {
      await applyForBadge(badge, draft);
      setEditing(false);
      setDraft(emptyBadgeDraft());
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };
  const withdraw = async () => {
    setBusy('withdraw');
    try {
      await withdrawApplication(badge);
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const stateChoices = allStates ? STATE_LAWS.map((s) => s.code) : [...new Set([...ESA_PROGRAM_STATES, ...draft.states])];

  return (
    <Screen edges={[]}>
      <RouterStack.Screen options={{ title: badge === 'verified' ? 'Get verified' : 'ESA vendor' }} />
      <T v="display">{TITLE[badge]}</T>
      <Card tint={c.surfaceAlt}>
        <Row wrap gap={6}>{badge === 'verified' ? <VerifiedBadge /> : <EsaBadge states={mine?.esaStates} />}</Row>
        <T v="caption">{badge === 'verified' ? VERIFIED_EXPLAINER : ESA_EXPLAINER}</T>
        {badge === 'esa' ? (
          <T v="caption" style={{ fontWeight: '700' }}>Applying here doesn’t sign you up with any state. Apply to each state’s ESA program yourself; once they approve you, tell Freerange so families can see it.</T>
        ) : null}
      </Card>

      {!userId ? (
        <Card tint={c.accentSoft} style={{ marginTop: space.lg }}>
          <T>{cloudEnabled ? 'Freerange reviews every application, so applying needs a Freerange account.' : 'This copy of Freerange keeps everything on this device. Badges need a Freerange account, because Freerange reviews every application.'}</T>
          {cloudEnabled ? (
            <Row>
              <Button size="sm" kind="secondary" title="Sign in or create an account" onPress={() => router.push('/account')} />
            </Row>
          ) : null}
        </Card>
      ) : mine === undefined ? (
        <T muted style={{ marginTop: space.lg }}>Loading…</T>
      ) : null}

      {userId && mine ? (
        <Section title="Status">
          {has ? (
            <Card tint={c.successSoft}>
              <T v="heading">{badge === 'verified' ? '✓ You’re a verified creator' : `🏛️ Listed as an ESA vendor in ${stateList(mine.esaStates)}`}</T>
              <T v="caption">The badge shows on your storefront and on every curriculum you sell.{badge === 'verified' ? ' Changing your creator name removes it until Freerange checks again.' : ' Approved in another state? Send an update with every state you’re approved in.'}</T>
            </Card>
          ) : null}
          {pending && app ? (
            <Card>
              <T v="heading">⏳ Waiting for review</T>
              <T v="caption" muted>Sent {formatDate(app.createdAt.slice(0, 10), { month: 'short', day: 'numeric' })} as {app.legalName}{app.states.length ? ` · ${app.states.map(stateName).join(', ')}` : ''}. A Freerange moderator usually answers within a few days.</T>
              {!editing ? (
                <Row wrap style={{ justifyContent: 'flex-end' }}>
                  <Button size="sm" kind="ghost" title="Withdraw" loading={busy === 'withdraw'} onPress={withdraw} />
                  <Button size="sm" kind="secondary" title="Update application" onPress={startEdit} />
                </Row>
              ) : null}
            </Card>
          ) : null}
          {app && (app.status === 'declined' || app.status === 'revoked') ? (
            <Card tint={c.accentSoft}>
              <T v="heading">{app.status === 'declined' ? 'Not approved yet' : 'Badge removed'}</T>
              {app.decisionNote ? <T v="caption">Freerange’s note: {app.decisionNote}</T> : null}
              <T v="caption" muted>You can apply again with more details.</T>
            </Card>
          ) : null}
          {!has && !app ? <T muted>You haven’t applied yet.</T> : null}
          {has && badge === 'esa' && !editing && !pending ? (
            <Row>
              <Button size="sm" kind="secondary" title="Update my states" onPress={startEdit} />
            </Row>
          ) : null}
        </Section>
      ) : null}

      {showForm ? (
        <Section title={pending ? 'Update your application' : 'Apply'} subtitle={badge === 'verified' ? 'Tell us who you are and how you made your curricula.' : 'Tell us where you’re approved. Business name only: no tax ID or bank details.'}>
          <Segmented<BadgeDraft['sellerType']>
            value={draft.sellerType}
            onChange={(v) => set({ sellerType: v })}
            options={[
              { value: 'creator', label: '🎨 Independent creator' },
              { value: 'publisher', label: '🏢 Publisher or business' },
            ]}
          />
          {badge === 'verified' ? (
            <>
              <Field label={draft.sellerType === 'publisher' ? 'Your organization' : 'Your name'} value={draft.legalName} onChangeText={(t) => set({ legalName: t })} placeholder={draft.sellerType === 'publisher' ? 'Maple Room Press, LLC' : 'Jordan Rivera'} maxLength={120} hint="Who’s behind your shop. Families see your shop name, not this." />
              <Field label="Website or portfolio" value={draft.website} onChangeText={(t) => set({ website: t })} placeholder="example.com" autoCapitalize="none" keyboardType="url" hint="Somewhere that shows it’s you: your site, a teaching portfolio, or a shop elsewhere." />
              <Field label="How you made your curricula" value={draft.about} onChangeText={(t) => set({ about: t })} multiline maxLength={3000} placeholder="I taught 3rd grade for 8 years and wrote these lessons for my own kids. Everything is my own writing and photos." />
              <Field label="Sample lesson link (optional)" value={draft.sampleUrl} onChangeText={(t) => set({ sampleUrl: t })} placeholder="https://…" autoCapitalize="none" keyboardType="url" />
            </>
          ) : (
            <>
              <Field label="Business name (as on your W-9)" value={draft.legalName} onChangeText={(t) => set({ legalName: t })} placeholder="Maple Room Press, LLC" maxLength={120} hint="Just the name. Freerange never asks for a tax ID or bank details here." />
              <Stack gap={6}>
                <T v="label">States whose ESA programs approved you</T>
                <Row wrap gap={6}>
                  {stateChoices.map((code) => (
                    <Chip key={code} label={stateName(code)} selected={draft.states.includes(code)} onPress={() => set({ states: draft.states.includes(code) ? draft.states.filter((x) => x !== code) : [...draft.states, code].sort() })} />
                  ))}
                  {!allStates ? <Chip label="Other states…" onPress={() => setAllStates(true)} /> : null}
                </Row>
              </Stack>
              <Field label="Vendor IDs or links" value={draft.vendorInfo} onChangeText={(t) => set({ vendorInfo: t })} multiline maxLength={2000} placeholder={'AZ ESA vendor ID V-12345\nhttps://program.example.gov/vendors/maple-room'} hint="The ID each program gave you, or a link to your entry in its vendor list." />
              <Field label="Anything else (optional)" value={draft.about} onChangeText={(t) => set({ about: t })} multiline maxLength={3000} placeholder="Approved for curriculum and supplies." />
            </>
          )}
          {error ? <T color={c.danger}>{error}</T> : null}
          <Row style={{ justifyContent: 'flex-end' }} wrap>
            {editing ? <Button kind="ghost" title="Cancel" onPress={() => setEditing(false)} /> : null}
            <Button title={pending ? 'Send update' : 'Send to Freerange'} disabled={issues.length > 0} reason={`Still needed: ${issues.join(', ')}`} loading={busy === 'send'} onPress={send} />
          </Row>
        </Section>
      ) : error ? (
        <T color={c.danger}>{error}</T>
      ) : null}
    </Screen>
  );
}
