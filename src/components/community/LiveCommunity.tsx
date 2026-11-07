import { router } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { View } from 'react-native';

import { addDays, ageOn, formatDate, todayKey } from '@/lib/dates';
import { parseCount } from '@/lib/parse';
import { PHILOSOPHY_INFO } from '@/lib/quiz';
import type { Philosophy } from '@/lib/types';
import {
  approveCoopMember,
  cancelEvent,
  createCoop,
  createEvent,
  deleteCoop,
  getProfile,
  leaveCoop,
  myConnections,
  nearbyCoops,
  nearbyEvents,
  nearbyFamilies,
  removeConnection,
  requestConnection,
  requestToJoinCoop,
  respondToConnection,
  saveProfile,
  setCarpool,
  setCoopDuties,
  setRsvp,
  type CommunityProfile,
  type Connection,
  type LiveCoop,
  type LiveEvent,
  type NearbyFamily,
} from '@/services/communityApi';
import { useStore } from '@/store/useStore';
import { Button, Card, Chip, DateField, Empty, Field, MoneyField, Pill, Row, Section, Segmented, Sheet, space, Stack, T, useColors, useConfirm } from '@/ui';

type Tab = 'families' | 'coops' | 'events' | 'swap';
const RADII = [2, 5, 10, 25, 50];
const AGE_BANDS = [
  { label: 'Any age', min: undefined, max: undefined },
  { label: '4–7', min: 4, max: 7 },
  { label: '8–11', min: 8, max: 11 },
  { label: '12+', min: 12, max: 18 },
];

/** Community backed by the Kinship service: real families, co-ops, and field trips nearby. */
export function LiveCommunity() {
  const c = useColors();
  const [profile, setProfile] = useState<CommunityProfile | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getProfile()
      .then(setProfile)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <Card tint={c.dangerSoft}><T>{error}</T></Card>;
  if (profile === undefined) return <T muted>Loading your community…</T>;
  if (profile === null || editing) {
    return <ProfileForm initial={profile ?? undefined} onSaved={(p) => { setProfile(p); setEditing(false); }} onCancel={profile ? () => setEditing(false) : undefined} />;
  }
  return <CommunityTabs profile={profile} onEditProfile={() => setEditing(true)} />;
}

// ───────────────────────────── Profile

function ProfileForm({ initial, onSaved, onCancel }: { initial?: CommunityProfile; onSaved: (p: CommunityProfile) => void; onCancel?: () => void }) {
  const c = useColors();
  const family = useStore((s) => s.family)!;
  const kids = useStore((s) => s.children);
  const parts = family.parentName.trim().split(/\s+/);
  const suggestedName = parts.length > 1 ? `${parts[0]} ${parts.at(-1)![0]}.` : parts[0];
  const [displayName, setDisplayName] = useState(initial?.displayName ?? suggestedName);
  const [zip, setZip] = useState(initial?.zip ?? family.zip);
  const [bio, setBio] = useState(initial?.bio ?? '');
  const [philosophies, setPhilosophies] = useState<Philosophy[]>(initial?.philosophies ?? (family.philosophy?.breakdown.filter((b) => b.percent >= 20).map((b) => b.philosophy) ?? []));
  const suggestions = [...new Set([...family.interests, ...kids.flatMap((k) => k.passions)])];
  const [interests, setInterests] = useState<string[]>(initial?.interests ?? suggestions.slice(0, 6));
  const [contact, setContact] = useState(initial?.contact ?? '');
  const [visible, setVisible] = useState(initial?.visible ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const kidAges = kids.map((k) => ageOn(k.birthdate));
  const missing = [!displayName.trim() && 'a display name', !/^\d{5}$/.test(zip.trim()) && 'a 5-digit ZIP code'].filter(Boolean);

  const save = async () => {
    setBusy(true);
    setError('');
    const p: CommunityProfile = { displayName: displayName.trim(), zip: zip.trim(), bio: bio.trim(), kidAges, philosophies, interests, contact: contact.trim(), visible };
    try {
      await saveProfile(p);
      onSaved(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={initial ? 'Your community profile' : 'Join your local homeschool community'} subtitle="Other parents see a distance band (like “within 5 mi”), never your address or ZIP code.">
      <Card>
        <Field label="Display name" value={displayName} onChangeText={setDisplayName} hint="First name and last initial works well." />
        <Field label="ZIP code (private — used only to measure distance)" value={zip} onChangeText={setZip} keyboardType="number-pad" maxLength={5} />
        <T v="caption" muted>Kids&apos; ages shared: {kidAges.length ? kidAges.join(', ') : 'none yet'} (names and birthdays are never shared)</T>
        <Stack gap={6}>
          <T v="label">Your approach</T>
          <Row wrap gap={6}>
            {(Object.keys(PHILOSOPHY_INFO) as Philosophy[]).map((p) => (
              <Chip key={p} label={`${PHILOSOPHY_INFO[p].emoji} ${PHILOSOPHY_INFO[p].label}`} selected={philosophies.includes(p)} onPress={() => setPhilosophies(philosophies.includes(p) ? philosophies.filter((x) => x !== p) : [...philosophies, p])} />
            ))}
          </Row>
        </Stack>
        {suggestions.length ? (
          <Stack gap={6}>
            <T v="label">Interests</T>
            <Row wrap gap={6}>
              {suggestions.map((i) => (
                <Chip key={i} label={i} selected={interests.includes(i)} onPress={() => setInterests(interests.includes(i) ? interests.filter((x) => x !== i) : [...interests, i])} />
              ))}
            </Row>
          </Stack>
        ) : null}
        <Field label="About your family (optional)" multiline value={bio} onChangeText={setBio} placeholder="Nature lovers looking for a weekly park day…" />
        <Field label="How connected families can reach you (optional)" value={contact} onChangeText={setContact} placeholder="Email or phone" hint="Shown only to families whose connection you accept." />
        <Chip label={`${visible ? '✓' : '○'} Show my family in the family finder`} selected={visible} onPress={() => setVisible(!visible)} />
        {error ? <T color={c.danger}>{error}</T> : null}
        <Row style={{ justifyContent: 'flex-end' }}>
          {onCancel ? <Button kind="secondary" title="Cancel" onPress={onCancel} /> : null}
          <Button title={initial ? 'Save profile' : 'Join the community'} loading={busy} disabled={missing.length > 0} reason={`Still needed: ${missing.join(', ')}`} onPress={save} />
        </Row>
      </Card>
    </Section>
  );
}

// ───────────────────────────── Tabs

function CommunityTabs({ profile, onEditProfile }: { profile: CommunityProfile; onEditProfile: () => void }) {
  const [tab, setTab] = useState<Tab>('families');
  const [radius, setRadius] = useState(25);
  return (
    <>
      <Row wrap style={{ justifyContent: 'space-between', marginTop: space.md }}>
        <T v="caption" muted>Signed in as {profile.displayName}{profile.visible ? '' : ' (hidden from the finder)'}</T>
        <Button size="sm" kind="ghost" title="Edit profile" onPress={onEditProfile} />
      </Row>
      <View style={{ marginTop: space.sm }}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'families', label: '👪 Families' },
            { value: 'coops', label: '🏫 Co-ops' },
            { value: 'events', label: '🚌 Field trips' },
            { value: 'swap', label: '📦 Swap' },
          ]}
        />
      </View>
      {tab !== 'swap' ? (
        <Row wrap gap={6} style={{ marginTop: space.md }}>
          {RADII.map((r) => (
            <Chip key={r} label={`${r} mi`} selected={radius === r} onPress={() => setRadius(r)} />
          ))}
        </Row>
      ) : null}
      {tab === 'families' ? <Families radius={radius} /> : null}
      {tab === 'coops' ? <Coops radius={radius} profile={profile} /> : null}
      {tab === 'events' ? <Events radius={radius} profile={profile} /> : null}
      {tab === 'swap' ? (
        <Section title="Curriculum swap">
          <Card>
            <T>Used curricula from local families are in the Marketplace, with reviews and one-tap “add to plan”.</T>
            <Row wrap>
              <Button title="Browse used curricula" onPress={() => router.push({ pathname: '/market', params: { used: '1' } })} />
              <Button kind="secondary" title="Sell something" onPress={() => router.push({ pathname: '/market', params: { view: 'selling' } })} />
            </Row>
          </Card>
        </Section>
      ) : null}
    </>
  );
}

/** Loads data whenever `key` changes, with a manual refresh; errors show inline. */
function useLoad<T>(load: () => Promise<T>, key: string) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const run = useEffectEvent(() => load());
  useEffect(() => {
    let alive = true;
    run()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError('');
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [key, tick]);
  return { data, error, refresh: () => setTick((t) => t + 1) };
}

/** Run an action, then refresh; surface failures. */
function useAct(refresh: () => void) {
  const [error, setError] = useState('');
  const act = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return { act, error };
}

// ───────────────────────────── Families

function Families({ radius }: { radius: number }) {
  const c = useColors();
  const family = useStore((s) => s.family)!;
  const [ageBand, setAgeBand] = useState(0);
  const [style, setStyle] = useState<Philosophy | undefined>();
  const finder = useLoad(() => nearbyFamilies({ maxMiles: radius, ageMin: AGE_BANDS[ageBand].min, ageMax: AGE_BANDS[ageBand].max, style }), `${radius}|${ageBand}|${style ?? ''}`);
  const conns = useLoad(() => myConnections(), 'connections');
  const refreshAll = () => {
    finder.refresh();
    conns.refresh();
  };
  const { act, error } = useAct(refreshAll);
  const [asking, setAsking] = useState<NearbyFamily | null>(null);
  const [message, setMessage] = useState('');

  const incoming = (conns.data ?? []).filter((x) => x.status === 'pending' && x.direction === 'incoming');
  const connected = (conns.data ?? []).filter((x) => x.status === 'accepted');

  return (
    <>
      {incoming.length ? (
        <Section title={`Connection requests (${incoming.length})`}>
          <Stack gap={space.sm}>
            {incoming.map((x) => (
              <Card key={x.familyId} tint={c.accentSoft}>
                <T v="heading">{x.displayName}</T>
                <T v="caption" muted>{x.band}{x.kidAges.length ? ` · kids ${x.kidAges.join(', ')}` : ''}</T>
                {x.message ? <T>“{x.message}”</T> : null}
                <Row>
                  <Button size="sm" title="Accept" onPress={() => act(() => respondToConnection(x.familyId, true))} />
                  <Button size="sm" kind="secondary" title="Decline" onPress={() => act(() => respondToConnection(x.familyId, false))} />
                </Row>
              </Card>
            ))}
          </Stack>
        </Section>
      ) : null}

      {connected.length ? (
        <Section title="Your connections">
          <Stack gap={space.sm}>
            {connected.map((x) => (
              <ConnectionCard key={x.familyId} connection={x} onRemove={() => act(() => removeConnection(x.familyId))} />
            ))}
          </Stack>
        </Section>
      ) : null}

      <Section title="Family finder" subtitle="Families who opted in, by distance band.">
        <Row wrap gap={6}>
          {AGE_BANDS.map((a, i) => (
            <Chip key={a.label} label={a.label} selected={ageBand === i} onPress={() => setAgeBand(i)} />
          ))}
        </Row>
        <Row wrap gap={6}>
          <Chip label="Any style" selected={!style} onPress={() => setStyle(undefined)} />
          {(Object.keys(PHILOSOPHY_INFO) as Philosophy[]).map((p) => (
            <Chip key={p} label={`${PHILOSOPHY_INFO[p].emoji} ${PHILOSOPHY_INFO[p].label}`} selected={style === p} onPress={() => setStyle(p)} />
          ))}
        </Row>
        {finder.error || error ? <T color={c.danger}>{finder.error || error}</T> : null}
        <Stack gap={space.sm}>
          {finder.data && finder.data.length === 0 ? <Empty icon="🧭" title="No families match yet" body="Try a wider radius. As more families nearby join Kinship, they'll show up here." /> : null}
          {(finder.data ?? []).map((f) => (
            <Card key={f.familyId}>
              <Row style={{ justifyContent: 'space-between' }} wrap>
                <T v="heading">{f.displayName} {f.emailVerified ? '✅' : ''}</T>
                <Pill text={f.band} />
              </Row>
              <T v="caption" muted>
                {f.kidAges.length ? `Kids: ${f.kidAges.join(', ')}` : 'Kids’ ages not shared'}
                {f.philosophies.length ? ` · ${f.philosophies.map((p) => PHILOSOPHY_INFO[p]?.label ?? p).join(', ')}` : ''}
              </T>
              {f.bio ? <T>{f.bio}</T> : null}
              {f.interests.length ? (
                <Row wrap gap={6}>
                  {f.interests.map((i) => (
                    <Pill key={i} text={i} bg={family.interests.includes(i) ? c.primarySoft : undefined} />
                  ))}
                </Row>
              ) : null}
              <Row>
                {f.connection === 'none' || f.connection === 'declined' ? <Button size="sm" title="Request to connect" onPress={() => { setAsking(f); setMessage(''); }} /> : null}
                {f.connection === 'requested' ? <Button size="sm" kind="secondary" title="Request sent · cancel" onPress={() => act(() => removeConnection(f.familyId))} /> : null}
                {f.connection === 'incoming' ? <Button size="sm" title="Accept their request" onPress={() => act(() => respondToConnection(f.familyId, true))} /> : null}
                {f.connection === 'connected' ? <Pill text="✓ Connected" bg={c.successSoft} fg={c.success} /> : null}
              </Row>
            </Card>
          ))}
        </Stack>
      </Section>

      <Sheet visible={!!asking} onClose={() => setAsking(null)} title={`Connect with ${asking?.displayName ?? ''}`}>
        <T muted>They&apos;ll see your display name, kids&apos; ages, and this note. Contact details are shared only if they accept.</T>
        <Field label="Note (optional)" multiline value={message} onChangeText={setMessage} placeholder="We'd love to meet up for park days!" maxLength={300} />
        <Row style={{ justifyContent: 'flex-end' }}>
          <Button kind="secondary" title="Cancel" onPress={() => setAsking(null)} />
          <Button title="Send request" onPress={() => { const f = asking!; setAsking(null); act(() => requestConnection(f.familyId, message.trim())); }} />
        </Row>
      </Sheet>
    </>
  );
}

function ConnectionCard({ connection: x, onRemove }: { connection: Connection; onRemove: () => void }) {
  const c = useColors();
  const confirm = useConfirm();
  return (
    <Card tint={c.primarySoft}>
      <Row style={{ justifyContent: 'space-between' }} wrap>
        <T v="heading">{x.displayName}</T>
        <Pill text={x.band} />
      </Row>
      <T>{x.contact ? `📬 ${x.contact}` : 'They haven’t shared contact details yet.'}</T>
      <Row>
        <Button size="sm" kind="ghost" title="Remove connection" onPress={() => confirm.ask(`Remove ${x.displayName}?`, onRemove, { confirm: 'Remove' })} />
      </Row>
      {confirm.element}
    </Card>
  );
}

// ───────────────────────────── Co-ops

function Coops({ radius, profile }: { radius: number; profile: CommunityProfile }) {
  const c = useColors();
  const list = useLoad(() => nearbyCoops(radius), String(radius));
  const { act, error } = useAct(list.refresh);
  const [creating, setCreating] = useState(false);
  const [dutyFor, setDutyFor] = useState<LiveCoop | null>(null);
  const confirm = useConfirm();

  return (
    <Section title="Co-ops & pods" subtitle="Yours first, then groups meeting nearby." action={<Button size="sm" icon="＋" title="Start one" onPress={() => setCreating(true)} />}>
      {list.error || error ? <T color={c.danger}>{list.error || error}</T> : null}
      <Stack gap={space.sm}>
        {list.data && list.data.length === 0 ? <Empty icon="🏫" title="No co-ops nearby yet" body="Start one — families nearby will be able to find it and ask to join." /> : null}
        {(list.data ?? []).map((co) => (
          <Card key={co.id} tint={co.myRole === 'member' || co.myRole === 'organizer' ? c.primarySoft : undefined}>
            <Row style={{ justifyContent: 'space-between' }} wrap>
              <T v="heading" style={{ flex: 1 }}>{co.name}</T>
              <Pill text={co.meets} />
            </Row>
            {co.description ? <T>{co.description}</T> : null}
            <T v="caption" muted>{co.memberCount} famil{co.memberCount === 1 ? 'y' : 'ies'} · organized by {co.organizer || '—'} · {co.band}</T>
            {co.members.length ? <T v="caption">Members: {co.members.join(', ')}</T> : null}
            {co.myRole === 'member' || co.myRole === 'organizer' ? (
              <View style={{ gap: 2 }}>
                <T v="label">Rotating duties</T>
                {co.duties.length ? co.duties.map((d) => <T key={d.label} v="caption">• {d.label}: {d.family}</T>) : <T v="caption" muted>None assigned yet.</T>}
              </View>
            ) : null}
            {co.myRole === 'organizer' && co.pending.length ? (
              <Card tint={c.accentSoft}>
                <T v="label">Asking to join</T>
                {co.pending.map((p) => (
                  <Row key={p.familyId} wrap style={{ justifyContent: 'space-between' }}>
                    <T>{p.name}</T>
                    <Row>
                      <Button size="sm" title="Approve" onPress={() => act(() => approveCoopMember(co.id, p.familyId, true))} />
                      <Button size="sm" kind="secondary" title="Decline" onPress={() => act(() => approveCoopMember(co.id, p.familyId, false))} />
                    </Row>
                  </Row>
                ))}
              </Card>
            ) : null}
            <Row wrap>
              {co.myRole === null ? <Button size="sm" title="Request to join" onPress={() => act(() => requestToJoinCoop(co.id, profile.displayName))} /> : null}
              {co.myRole === 'pending' ? <Button size="sm" kind="secondary" title="Requested · cancel" onPress={() => act(() => leaveCoop(co.id))} /> : null}
              {co.myRole === 'member' ? <Button size="sm" kind="secondary" title="Leave" onPress={() => confirm.ask(`Leave ${co.name}?`, () => act(() => leaveCoop(co.id)), { confirm: 'Leave' })} /> : null}
              {co.myRole === 'organizer' ? (
                <>
                  <Button size="sm" kind="secondary" title="Edit duties" onPress={() => setDutyFor(co)} />
                  <Button size="sm" kind="ghost" title="Delete co-op" onPress={() => confirm.ask(`Delete ${co.name}?`, () => act(() => deleteCoop(co.id)), { confirm: 'Delete', body: 'Members lose access to it. This can’t be undone.' })} />
                </>
              ) : null}
            </Row>
          </Card>
        ))}
      </Stack>
      <CoopSheet visible={creating} defaultZip={profile.zip} onClose={() => setCreating(false)} onSave={(v) => { setCreating(false); act(() => createCoop(v)); }} />
      {dutyFor ? <DutySheet coop={dutyFor} onClose={() => setDutyFor(null)} onSave={(d) => { const id = dutyFor.id; setDutyFor(null); act(() => setCoopDuties(id, d)); }} /> : null}
      {confirm.element}
    </Section>
  );
}

function CoopSheet({ visible, defaultZip, onClose, onSave }: { visible: boolean; defaultZip: string; onClose: () => void; onSave: (v: { name: string; description: string; meets: string; zip: string }) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [meets, setMeets] = useState('');
  const [zip, setZip] = useState(defaultZip);
  return (
    <Sheet visible={visible} onClose={onClose} title="Start a co-op">
      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="Description" multiline value={description} onChangeText={setDescription} />
      <Field label="Meets" value={meets} onChangeText={setMeets} placeholder="Wednesdays 10 AM" />
      <Field label="Meeting area ZIP (for distance)" value={zip} onChangeText={setZip} keyboardType="number-pad" maxLength={5} />
      <Button title="Create" disabled={!name.trim() || !/^\d{5}$/.test(zip)} reason={!name.trim() ? 'Give it a name' : 'Enter a 5-digit ZIP'} onPress={() => onSave({ name: name.trim(), description: description.trim(), meets: meets.trim() || 'TBD', zip })} />
    </Sheet>
  );
}

function DutySheet({ coop, onClose, onSave }: { coop: LiveCoop; onClose: () => void; onSave: (d: LiveCoop['duties']) => void }) {
  const [rows, setRows] = useState(coop.duties.length ? coop.duties : [{ label: '', family: '' }]);
  const set = (i: number, patch: Partial<LiveCoop['duties'][number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <Sheet visible onClose={onClose} title="Rotating duties">
      {rows.map((r, i) => (
        <Row key={i} gap={space.sm} align="flex-start">
          <View style={{ flex: 1 }}><Field placeholder="Snacks" value={r.label} onChangeText={(label) => set(i, { label })} /></View>
          <View style={{ flex: 1 }}>
            <Field placeholder="Who" value={r.family} onChangeText={(family) => set(i, { family })} />
          </View>
          <Button size="sm" kind="ghost" title="✕" onPress={() => setRows(rows.filter((_, j) => j !== i))} />
        </Row>
      ))}
      <Row wrap gap={6}>
        {coop.members.map((m) => (
          <Chip key={m} label={`+ ${m}`} onPress={() => setRows([...rows, { label: '', family: m }])} />
        ))}
      </Row>
      <Row style={{ justifyContent: 'flex-end' }}>
        <Button kind="secondary" title="Add duty" onPress={() => setRows([...rows, { label: '', family: '' }])} />
        <Button title="Save" onPress={() => onSave(rows.filter((r) => r.label.trim()).map((r) => ({ label: r.label.trim(), family: r.family.trim() || 'TBD' })))} />
      </Row>
    </Sheet>
  );
}

// ───────────────────────────── Events

function Events({ radius, profile }: { radius: number; profile: CommunityProfile }) {
  const c = useColors();
  const list = useLoad(() => nearbyEvents(radius), String(radius));
  const { act, error } = useAct(list.refresh);
  const [creating, setCreating] = useState(false);
  const confirm = useConfirm();

  return (
    <Section title="Upcoming field trips & meetups" action={<Button size="sm" icon="＋" title="Organize" onPress={() => setCreating(true)} />}>
      {list.error || error ? <T color={c.danger}>{list.error || error}</T> : null}
      <Stack gap={space.sm}>
        {list.data && list.data.length === 0 ? <Empty icon="🚌" title="Nothing scheduled nearby" body="Organize a park day or field trip — families within your radius will see it." /> : null}
        {(list.data ?? []).map((e: LiveEvent) => (
          <Card key={e.id} tint={e.iAmGoing ? c.primarySoft : undefined}>
            <Row style={{ justifyContent: 'space-between' }} wrap>
              <T v="heading" style={{ flex: 1 }}>{e.title}</T>
              <Pill text={formatDate(e.date)} />
            </Row>
            <T v="caption" muted>📍 {e.location} · {e.band} · Ages {e.ages} · Host {e.iHost ? 'you' : e.host} · {e.costPerKid ? `$${e.costPerKid}/kid` : 'Free'}</T>
            <T v="caption">{e.going}/{e.capacity} families going{e.carpooling ? ` · ${e.carpooling} in the carpool pool` : ''}</T>
            {e.iCarpool && e.carpoolNames.length ? <T v="caption" color={c.primary}>🚗 Carpool with: {e.carpoolNames.join(', ')}</T> : null}
            <Row wrap>
              {e.iHost ? (
                <Button size="sm" kind="ghost" title="Cancel event" onPress={() => confirm.ask(`Cancel ${e.title}?`, () => act(() => cancelEvent(e.id)), { confirm: 'Cancel event', body: 'Everyone who RSVP’d will no longer see it.' })} />
              ) : (
                <Button size="sm" kind={e.iAmGoing ? 'secondary' : 'primary'} title={e.iAmGoing ? "Can't make it" : 'RSVP'} disabled={!e.iAmGoing && e.going >= e.capacity} reason="This event is full" onPress={() => act(() => setRsvp(e.id, !e.iAmGoing))} />
              )}
              {e.iAmGoing ? <Button size="sm" kind="ghost" title={e.iCarpool ? '🚗 In carpool pool ✓' : '🚗 Join carpool matching'} onPress={() => act(() => setCarpool(e.id, !e.iCarpool))} /> : null}
            </Row>
          </Card>
        ))}
      </Stack>
      <EventSheet visible={creating} defaultZip={profile.zip} hostName={profile.displayName} onClose={() => setCreating(false)} onSave={(v) => { setCreating(false); act(() => createEvent(v)); }} />
      {confirm.element}
    </Section>
  );
}

function EventSheet({ visible, defaultZip, hostName, onClose, onSave }: { visible: boolean; defaultZip: string; hostName: string; onClose: () => void; onSave: (e: Parameters<typeof createEvent>[0]) => void }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<string | undefined>(addDays(todayKey(), 7));
  const [location, setLocation] = useState('');
  const [zip, setZip] = useState(defaultZip);
  const [ages, setAges] = useState('All ages');
  const [cost, setCost] = useState<number | undefined>(0);
  const [capacity, setCapacity] = useState('20');
  const cap = parseCount(capacity);
  const missing = [!title.trim() && 'a title', !date && 'a valid upcoming date', !location.trim() && 'a public meeting place', !/^\d{5}$/.test(zip) && 'a 5-digit ZIP', cost === undefined && 'a cost (0 for free)', !cap && 'capacity'].filter(Boolean);
  return (
    <Sheet visible={visible} onClose={onClose} title="Organize a field trip">
      <Field label="Title" value={title} onChangeText={setTitle} />
      <DateField label="Date" value={date} onChange={setDate} validate={(d) => (d < todayKey() ? 'Pick today or a future date' : undefined)} />
      <Field label="Location (public meeting place)" value={location} onChangeText={setLocation} placeholder="City park, north pavilion" />
      <Field label="Location ZIP (for distance)" value={zip} onChangeText={setZip} keyboardType="number-pad" maxLength={5} />
      <Field label="Ages" value={ages} onChangeText={setAges} />
      <Row gap={space.md} align="flex-start">
        <View style={{ flex: 1 }}><MoneyField label="Cost per kid ($)" value={cost} onChange={setCost} example="0" /></View>
        <View style={{ flex: 1 }}><Field label="Capacity (families)" keyboardType="number-pad" value={capacity} onChangeText={setCapacity} /></View>
      </Row>
      <Button
        title="Create"
        disabled={missing.length > 0}
        reason={`Still needed: ${missing.join(', ')}`}
        onPress={() => date && cap && onSave({ title: title.trim(), date, location: location.trim(), zip, ages, costPerKid: cost ?? 0, capacity: cap, hostName })}
      />
    </Sheet>
  );
}
