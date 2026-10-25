import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { matchFamilies, SAMPLE_FAMILIES } from '@/lib/community';
import { formatDate, addDays, todayKey } from '@/lib/dates';
import { parseCount } from '@/lib/parse';
import { PHILOSOPHY_INFO } from '@/lib/quiz';
import { SUBJECT_LIST, SUBJECTS, subjectLabel } from '@/lib/subjects';
import type { Philosophy, Subject, SwapListing } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { Button, Card, Chip, DateField, Field, MoneyField, Pill, Row, Screen, Section, Segmented, Sheet, space, Stack, T, useColors } from '@/ui';

type Tab = 'families' | 'coops' | 'events' | 'swap';
const RADII = [2, 5, 10, 25, 50];
const AGE_BANDS = [
  { label: 'Any age', min: undefined, max: undefined },
  { label: '4–7', min: 4, max: 7 },
  { label: '8–11', min: 8, max: 11 },
  { label: '12+', min: 12, max: 18 },
];

export default function CommunityHub() {
  const c = useColors();
  const [tab, setTab] = useState<Tab>('families');
  const family = useStore((s) => s.family)!;
  const coops = useStore((s) => s.coops);
  const events = useStore((s) => s.events);
  const swaps = useStore((s) => s.swaps);
  const { toggleCoop, addCoop, toggleEvent, addEvent, addSwap, removeSwap } = useStore.getState();

  const [radius, setRadius] = useState(10);
  const [ageBand, setAgeBand] = useState(0);
  const [philosophy, setPhilosophy] = useState<Philosophy | undefined>();
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const matches = useMemo(
    () => matchFamilies(SAMPLE_FAMILIES, { maxMiles: radius, ageMin: AGE_BANDS[ageBand].min, ageMax: AGE_BANDS[ageBand].max, philosophy }, family.interests),
    [radius, ageBand, philosophy, family.interests],
  );

  const [newCoop, setNewCoop] = useState(false);
  const [newEvent, setNewEvent] = useState(false);
  const [newSwap, setNewSwap] = useState(false);

  return (
    <Screen>
      <T v="display">Community</T>
      <T muted>Verified local families, co-ops, field trips, and curriculum swaps. Exact addresses are never shared — only distance bands.</T>
      <Card tint={c.accentSoft} style={{ marginTop: space.md }}>
        <T v="caption">🧪 Preview: you&apos;re seeing a sample network. Live matching, messaging, and verification turn on when the Kinship community service launches. Your co-ops, events, and listings are saved on this device.</T>
      </Card>
      <View style={{ marginTop: space.lg }}>
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

      {tab === 'families' ? (
        <Section title="Family finder" subtitle="Filter by distance, kid ages, and approach.">
          <Row wrap gap={6}>
            {RADII.map((r) => (
              <Chip key={r} label={`${r} mi`} selected={radius === r} onPress={() => setRadius(r)} />
            ))}
          </Row>
          <Row wrap gap={6}>
            {AGE_BANDS.map((a, i) => (
              <Chip key={a.label} label={a.label} selected={ageBand === i} onPress={() => setAgeBand(i)} />
            ))}
          </Row>
          <Row wrap gap={6}>
            <Chip label="Any style" selected={!philosophy} onPress={() => setPhilosophy(undefined)} />
            {(Object.keys(PHILOSOPHY_INFO) as Philosophy[]).map((p) => (
              <Chip key={p} label={`${PHILOSOPHY_INFO[p].emoji} ${PHILOSOPHY_INFO[p].label}`} selected={philosophy === p} onPress={() => setPhilosophy(p)} />
            ))}
          </Row>
          <Stack gap={space.sm}>
            {matches.length === 0 ? <T muted>No families match — try a wider radius.</T> : null}
            {matches.map((f) => (
              <Card key={f.id}>
                <Row style={{ justifyContent: 'space-between' }} wrap>
                  <T v="heading">{f.displayName} {f.verified ? '✅' : ''}</T>
                  <Pill text={f.band} />
                </Row>
                <T v="caption" muted>Kids: {f.kidAges.join(', ')} · {f.philosophies.map((p) => PHILOSOPHY_INFO[p].label).join(', ')}</T>
                <Row wrap gap={6}>
                  {f.interests.map((i) => (
                    <Pill key={i} text={i} bg={family.interests.includes(i) ? c.primarySoft : undefined} />
                  ))}
                </Row>
                <Row>
                  <Button
                    size="sm"
                    kind={connected.has(f.id) ? 'secondary' : 'primary'}
                    title={connected.has(f.id) ? 'Request sent' : 'Request to connect'}
                    disabled={connected.has(f.id)}
                    onPress={() => setConnected(new Set([...connected, f.id]))}
                  />
                </Row>
              </Card>
            ))}
          </Stack>
        </Section>
      ) : null}

      {tab === 'coops' ? (
        <Section title="Co-ops & pods" action={<Button size="sm" icon="＋" title="Start one" onPress={() => setNewCoop(true)} />}>
          <Stack gap={space.sm}>
            {coops.map((co) => (
              <Card key={co.id} tint={co.joined ? c.primarySoft : undefined}>
                <Row style={{ justifyContent: 'space-between' }} wrap>
                  <T v="heading" style={{ flex: 1 }}>{co.name}</T>
                  <Pill text={co.meets} />
                </Row>
                <T>{co.description}</T>
                <T v="caption" muted>{co.members.length} families · {co.members.join(', ')}</T>
                {co.joined ? (
                  <View style={{ gap: 2 }}>
                    <T v="label">Rotating duties</T>
                    {co.duties.map((d) => (
                      <T key={d.label} v="caption">• {d.label}: {d.family}</T>
                    ))}
                  </View>
                ) : null}
                <Row>
                  <Button size="sm" kind={co.joined ? 'secondary' : 'primary'} title={co.joined ? 'Leave' : 'Request to join'} onPress={() => toggleCoop(co.id)} />
                </Row>
              </Card>
            ))}
          </Stack>
        </Section>
      ) : null}

      {tab === 'events' ? (
        <Section title="Upcoming field trips & meetups" action={<Button size="sm" icon="＋" title="Organize" onPress={() => setNewEvent(true)} />}>
          <Stack gap={space.sm}>
            {[...events].sort((a, b) => a.date.localeCompare(b.date)).map((e) => (
              <Card key={e.id} tint={e.going ? c.primarySoft : undefined}>
                <Row style={{ justifyContent: 'space-between' }} wrap>
                  <T v="heading" style={{ flex: 1 }}>{e.title}</T>
                  <Pill text={formatDate(e.date)} />
                </Row>
                <T v="caption" muted>📍 {e.location} · Ages {e.ages} · Host {e.host} · {e.costPerKid ? `$${e.costPerKid}/kid` : 'Free'}</T>
                <T v="caption">{e.rsvps}/{e.capacity} going{e.rsvps >= 10 && e.costPerKid ? ' · group discount likely' : ''}</T>
                <Row wrap>
                  <Button size="sm" kind={e.going ? 'secondary' : 'primary'} title={e.going ? "Can't make it" : 'RSVP'} disabled={!e.going && e.rsvps >= e.capacity} onPress={() => toggleEvent(e.id, 'going')} />
                  {e.going ? <Button size="sm" kind="ghost" title={e.carpool ? '🚗 In carpool pool ✓' : '🚗 Join carpool matching'} onPress={() => toggleEvent(e.id, 'carpool')} /> : null}
                </Row>
              </Card>
            ))}
          </Stack>
        </Section>
      ) : null}

      {tab === 'swap' ? (
        <Section title="Curriculum swap" subtitle="Used books, manipulatives, and lab gear within local verified circles." action={<Button size="sm" icon="＋" title="List item" onPress={() => setNewSwap(true)} />}>
          <Stack gap={space.sm}>
            {swaps.map((s) => (
              <Card key={s.id}>
                <Row style={{ justifyContent: 'space-between' }} wrap>
                  <T v="heading" style={{ flex: 1 }}>{SUBJECTS[s.subject].icon} {s.title}</T>
                  <T v="heading" color={c.primary}>{s.price ? `$${s.price}` : 'Free'}</T>
                </Row>
                <T v="caption" muted>{subjectLabel(s.subject)} · {s.condition.replace('_', ' ')} · {s.mine ? 'Your listing' : `${s.seller} · ${s.distanceBand}`}</T>
                <Row>{s.mine ? <Button size="sm" kind="danger" title="Remove" onPress={() => removeSwap(s.id)} /> : <Button size="sm" kind="secondary" title="I'm interested" />}</Row>
              </Card>
            ))}
          </Stack>
        </Section>
      ) : null}

      <CoopSheet visible={newCoop} onClose={() => setNewCoop(false)} onSave={(name, description, meets) => { addCoop({ name, description, meets, duties: [{ label: 'Organizer', family: family.parentName }] }); setNewCoop(false); }} />
      <EventSheet visible={newEvent} onClose={() => setNewEvent(false)} onSave={(e) => { addEvent({ ...e, host: family.parentName }); setNewEvent(false); }} />
      <SwapSheet visible={newSwap} onClose={() => setNewSwap(false)} onSave={(s) => { addSwap(s); setNewSwap(false); }} />
    </Screen>
  );
}

function CoopSheet({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (name: string, description: string, meets: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [meets, setMeets] = useState('');
  return (
    <Sheet visible={visible} onClose={onClose} title="Start a co-op">
      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="Description" multiline value={description} onChangeText={setDescription} />
      <Field label="Meets" value={meets} onChangeText={setMeets} placeholder="Wednesdays 10 AM" />
      <Button title="Create" disabled={!name.trim()} onPress={() => onSave(name.trim(), description.trim(), meets.trim() || 'TBD')} />
    </Sheet>
  );
}

function EventSheet({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (e: { title: string; date: string; location: string; ages: string; costPerKid: number; capacity: number }) => void }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<string | undefined>(addDays(todayKey(), 7));
  const [location, setLocation] = useState('');
  const [ages, setAges] = useState('All ages');
  const [cost, setCost] = useState<number | undefined>(0);
  const [capacity, setCapacity] = useState('20');
  const cap = parseCount(capacity);
  const missing = [!title.trim() && 'a title', !date && 'a valid upcoming date', cost === undefined && 'a cost (0 for free)', !cap && 'capacity'].filter(Boolean);
  return (
    <Sheet visible={visible} onClose={onClose} title="Organize a field trip">
      <Field label="Title" value={title} onChangeText={setTitle} />
      <DateField label="Date" value={date} onChange={setDate} validate={(d) => (d < todayKey() ? 'Pick today or a future date' : undefined)} />
      <Field label="Location (public meeting place)" value={location} onChangeText={setLocation} />
      <Field label="Ages" value={ages} onChangeText={setAges} />
      <Row gap={space.md} align="flex-start">
        <View style={{ flex: 1 }}><MoneyField label="Cost per kid ($)" value={cost} onChange={setCost} example="0" /></View>
        <View style={{ flex: 1 }}><Field label="Capacity" keyboardType="number-pad" value={capacity} onChangeText={setCapacity} /></View>
      </Row>
      <Button
        title="Create"
        disabled={missing.length > 0}
        reason={`Still needed: ${missing.join(', ')}`}
        onPress={() => date && cap && onSave({ title: title.trim(), date, location: location.trim() || 'TBD', ages, costPerKid: cost ?? 0, capacity: cap })}
      />
    </Sheet>
  );
}

function SwapSheet({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (s: Omit<SwapListing, 'id' | 'mine' | 'seller' | 'distanceBand'>) => void }) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<Subject>('math');
  const [condition, setCondition] = useState<SwapListing['condition']>('good');
  const [price, setPrice] = useState<number | undefined>(0);
  return (
    <Sheet visible={visible} onClose={onClose} title="List an item">
      <Field label="What is it?" value={title} onChangeText={setTitle} placeholder="Saxon Math 6/5 student text" />
      <Row wrap gap={6}>
        {SUBJECT_LIST.map((s) => (
          <Chip key={s} label={`${SUBJECTS[s].icon} ${SUBJECTS[s].label}`} selected={subject === s} onPress={() => setSubject(s)} />
        ))}
      </Row>
      <Row wrap gap={6}>
        {(['new', 'like_new', 'good', 'fair'] as const).map((cnd) => (
          <Chip key={cnd} label={cnd.replace('_', ' ')} selected={condition === cnd} onPress={() => setCondition(cnd)} />
        ))}
      </Row>
      <MoneyField label="Price ($, 0 = free)" value={price} onChange={setPrice} example="0" />
      <Button
        title="List it"
        disabled={!title.trim() || price === undefined}
        reason={!title.trim() ? 'Describe the item' : 'Enter a price (0 for free)'}
        onPress={() => onSave({ title: title.trim(), subject, condition, price: price ?? 0 })}
      />
    </Sheet>
  );
}
