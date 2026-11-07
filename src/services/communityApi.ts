import type { Philosophy } from '@/lib/types';
import { useAccount } from '@/store/useAccount';

import { friendlyError, supabase } from './cloud';

/**
 * Live community (parents only). Locations stay private on the server; the
 * finder only returns distance bands. Contact details are revealed only
 * after both families accept a connection.
 */

export interface CommunityProfile {
  displayName: string;
  zip: string;
  bio: string;
  kidAges: number[];
  philosophies: Philosophy[];
  interests: string[];
  contact: string;
  visible: boolean;
}

export type ConnectionState = 'none' | 'requested' | 'incoming' | 'connected' | 'declined';

export interface NearbyFamily {
  familyId: string;
  displayName: string;
  bio: string;
  kidAges: number[];
  philosophies: Philosophy[];
  interests: string[];
  band: string;
  emailVerified: boolean;
  connection: ConnectionState;
}

export interface Connection {
  familyId: string;
  displayName: string;
  status: 'pending' | 'accepted';
  direction: 'incoming' | 'outgoing';
  message: string;
  contact: string;
  kidAges: number[];
  band: string;
}

export interface LiveCoop {
  id: string;
  name: string;
  description: string;
  meets: string;
  band: string;
  organizer: string;
  memberCount: number;
  myRole: 'organizer' | 'member' | 'pending' | null;
  members: string[];
  pending: { familyId: string; name: string }[];
  duties: { label: string; family: string }[];
}

export interface LiveEvent {
  id: string;
  title: string;
  date: string;
  location: string;
  ages: string;
  costPerKid: number;
  capacity: number;
  host: string;
  band: string;
  going: number;
  carpooling: number;
  iAmGoing: boolean;
  iCarpool: boolean;
  iHost: boolean;
  carpoolNames: string[];
}

const db = () => {
  if (!supabase) throw new Error('Community needs the Kinship service.');
  return supabase;
};
const fid = () => {
  const id = useAccount.getState().familyId;
  if (!id) throw new Error('Finish setting up your family first.');
  return id;
};
const check = <T,>(r: { data: T; error: unknown }): T => {
  if (r.error) throw new Error(friendlyError(r.error));
  return r.data;
};

// ───────────────────────────── Profile

export async function getProfile(): Promise<CommunityProfile | null> {
  const family = fid();
  const [p, loc] = await Promise.all([
    db().from('community_profiles').select('*').eq('family_id', family).maybeSingle(),
    db().from('family_locations').select('zip5').eq('family_id', family).maybeSingle(),
  ]);
  const row = check(p);
  if (!row) return null;
  return {
    displayName: row.display_name,
    zip: check(loc)?.zip5 ?? '',
    bio: row.bio,
    kidAges: row.kid_ages,
    philosophies: row.philosophies,
    interests: row.interests,
    contact: row.contact,
    visible: row.visible,
  };
}

export async function saveProfile(p: CommunityProfile): Promise<void> {
  const family = fid();
  check(
    await db().from('community_profiles').upsert({
      family_id: family,
      display_name: p.displayName,
      bio: p.bio,
      kid_ages: p.kidAges,
      philosophies: p.philosophies,
      interests: p.interests,
      contact: p.contact,
      visible: p.visible,
      updated_at: new Date().toISOString(),
    }),
  );
  check(await db().from('family_locations').upsert({ family_id: family, zip5: p.zip, updated_at: new Date().toISOString() }));
}

// ───────────────────────────── Families & connections

export async function nearbyFamilies(f: { maxMiles: number; ageMin?: number; ageMax?: number; style?: Philosophy }): Promise<NearbyFamily[]> {
  const rows = check(await db().rpc('nearby_families', { max_miles: f.maxMiles, age_min: f.ageMin ?? null, age_max: f.ageMax ?? null, style: f.style ?? null })) as {
    family_id: string; display_name: string; bio: string; kid_ages: number[]; philosophies: Philosophy[]; interests: string[]; band: string; email_verified: boolean; connection: ConnectionState;
  }[];
  return rows.map((r) => ({ familyId: r.family_id, displayName: r.display_name, bio: r.bio, kidAges: r.kid_ages, philosophies: r.philosophies, interests: r.interests, band: r.band, emailVerified: r.email_verified, connection: r.connection }));
}

export async function myConnections(): Promise<Connection[]> {
  const rows = check(await db().rpc('my_connections')) as { family_id: string; display_name: string; status: Connection['status']; direction: Connection['direction']; message: string; contact: string; kid_ages: number[]; band: string }[];
  return rows.map((r) => ({ familyId: r.family_id, displayName: r.display_name, status: r.status, direction: r.direction, message: r.message, contact: r.contact, kidAges: r.kid_ages, band: r.band }));
}

export async function requestConnection(to: string, message: string) {
  check(await db().from('connections').insert({ from_family: fid(), to_family: to, message }));
}

export async function respondToConnection(from: string, accept: boolean) {
  check(await db().from('connections').update({ status: accept ? 'accepted' : 'declined', responded_at: new Date().toISOString() }).eq('from_family', from).eq('to_family', fid()));
}

export async function removeConnection(other: string) {
  const me = fid();
  check(await db().from('connections').delete().or(`and(from_family.eq.${me},to_family.eq.${other}),and(from_family.eq.${other},to_family.eq.${me})`));
}

// ───────────────────────────── Co-ops

export async function nearbyCoops(maxMiles: number): Promise<LiveCoop[]> {
  const rows = check(await db().rpc('nearby_coops', { max_miles: maxMiles })) as {
    id: string; name: string; description: string; meets: string; band: string; organizer: string | null; member_count: number; my_role: LiveCoop['myRole']; members: string[] | null; pending: string[] | null; duties: LiveCoop['duties'];
  }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    meets: r.meets,
    band: r.band,
    organizer: r.organizer ?? '',
    memberCount: r.member_count,
    myRole: r.my_role,
    members: r.members ?? [],
    pending: (r.pending ?? []).map((p) => {
      const [familyId, ...name] = p.split('|');
      return { familyId, name: name.join('|') };
    }),
    duties: r.duties ?? [],
  }));
}

export async function createCoop(c: { name: string; description: string; meets: string; zip: string }) {
  check(await db().from('coops').insert({ name: c.name, description: c.description, meets: c.meets, zip5: c.zip || null, organizer_family: fid() }));
}

export async function requestToJoinCoop(coopId: string, displayName: string) {
  check(await db().from('coop_members').insert({ coop_id: coopId, family_id: fid(), display_name: displayName }));
}

export async function approveCoopMember(coopId: string, familyId: string, approve: boolean) {
  const q = db().from('coop_members');
  check(approve ? await q.update({ status: 'active' }).eq('coop_id', coopId).eq('family_id', familyId) : await q.delete().eq('coop_id', coopId).eq('family_id', familyId));
}

export async function leaveCoop(coopId: string) {
  check(await db().from('coop_members').delete().eq('coop_id', coopId).eq('family_id', fid()));
}

export async function deleteCoop(coopId: string) {
  check(await db().from('coops').delete().eq('id', coopId));
}

export async function setCoopDuties(coopId: string, duties: LiveCoop['duties']) {
  check(await db().from('coops').update({ duties }).eq('id', coopId));
}

// ───────────────────────────── Events

export async function nearbyEvents(maxMiles: number): Promise<LiveEvent[]> {
  const rows = check(await db().rpc('nearby_events', { max_miles: maxMiles })) as {
    id: string; title: string; starts_on: string; location: string; ages: string; cost_per_kid: number | string; capacity: number; host_name: string; band: string; going: number; carpooling: number; i_am_going: boolean; i_carpool: boolean; i_host: boolean; carpool_names: string[] | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    date: r.starts_on,
    location: r.location,
    ages: r.ages,
    costPerKid: Number(r.cost_per_kid),
    capacity: r.capacity,
    host: r.host_name,
    band: r.band,
    going: r.going,
    carpooling: r.carpooling,
    iAmGoing: r.i_am_going,
    iCarpool: r.i_carpool,
    iHost: r.i_host,
    carpoolNames: r.carpool_names ?? [],
  }));
}

export async function createEvent(e: { title: string; date: string; location: string; zip: string; ages: string; costPerKid: number; capacity: number; hostName: string }) {
  check(await db().from('events').insert({ title: e.title, starts_on: e.date, location: e.location, zip5: e.zip || null, ages: e.ages, cost_per_kid: e.costPerKid, capacity: e.capacity, host_family: fid(), host_name: e.hostName }));
}

export async function setRsvp(eventId: string, going: boolean) {
  const q = db().from('event_rsvps');
  check(going ? await q.insert({ event_id: eventId, family_id: fid(), display_name: '' }) : await q.delete().eq('event_id', eventId).eq('family_id', fid()));
}

export async function setCarpool(eventId: string, carpool: boolean) {
  check(await db().from('event_rsvps').update({ carpool }).eq('event_id', eventId).eq('family_id', fid()));
}

export async function cancelEvent(eventId: string) {
  check(await db().from('events').delete().eq('id', eventId));
}
