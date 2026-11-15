import { MAX_FAMILIES, normalizeClassCode, type ClassMember, type CoopClass, type StudentProgress } from '@/lib/coop';
import { randomCode } from '@/lib/gifts';
import { uid } from '@/lib/id';
import type { PackageContent } from '@/lib/market';
import { attributionFor, lessonTotal, publishRules, type CurriculumPackage } from '@/lib/package';
import type { ID } from '@/lib/types';
import { useAccount } from '@/store/useAccount';
import { useStore } from '@/store/useStore';
import { useStudio, type LocalClass } from '@/store/useStudio';

import { friendlyError, supabase } from './cloud';
import { pushPackageNow } from './studioApi';

/**
 * Co-op classes. With an account, classes live on the server: families join
 * with the invite code, the teacher's new versions reach them as plan
 * updates, and each family reports how far its students have got (first
 * names only if it opts in). Without an account, a class lives on this
 * device, and this device's own family can join it to try things out.
 */

const signedIn = () => !!supabase && !!useAccount.getState().userId;
/** The family on this device, in a class kept on this device. */
const HERE = 'this-device';

const fail = (e: unknown): never => {
  throw new Error(friendlyError(e));
};

type ClassRow = {
  id: string; code?: string; title: string; teacher_name: string; package_id?: string | null; description?: string; subjects?: string[]; grade_min?: number; grade_max?: number;
  lessons_per_week?: number; minutes_per_lesson?: number; parent_involvement?: CoopClass['parentInvolvement']; family_style?: boolean; cover: string; color: string;
  max_families: number; status: CoopClass['status']; version: number; families?: number | string; lessons?: number | string; joined?: boolean; created_at?: string; updated_at?: string;
};

const toClass = (r: ClassRow): CoopClass => ({
  id: r.id,
  code: r.code,
  title: r.title,
  teacherName: r.teacher_name,
  packageId: r.package_id ?? undefined,
  description: r.description ?? '',
  subjects: (r.subjects ?? []) as CoopClass['subjects'],
  gradeMin: r.grade_min ?? 1,
  gradeMax: r.grade_max ?? 3,
  lessonsPerWeek: r.lessons_per_week ?? 3,
  minutesPerLesson: r.minutes_per_lesson ?? 30,
  parentInvolvement: r.parent_involvement ?? 'medium',
  familyStyle: r.family_style ?? false,
  cover: r.cover,
  color: r.color,
  maxFamilies: r.max_families,
  status: r.status,
  version: r.version,
  families: Number(r.families ?? 0),
  lessons: r.lessons === undefined ? undefined : Number(r.lessons),
  joined: r.joined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const fromLocal = ({ releases, members, ...c }: LocalClass): CoopClass => ({
  ...c,
  families: members.length,
  lessons: lessonTotal(releases.at(-1)?.units),
  joined: members.some((m) => m.familyId === HERE),
});

function patchLocal(id: ID, fn: (c: LocalClass) => LocalClass | undefined) {
  const studio = useStudio.getState();
  const next = studio.classes.flatMap((c) => (c.id === id ? (fn(c) ?? []) : [c]));
  studio.setClasses(next);
}

const findLocal = (id: ID) => useStudio.getState().classes.find((c) => c.id === id);

// ───────────────────────────── Teacher

/** Why a Studio curriculum can't be shared with a class (the same rules as publishing). */
export function classIssues(pkg: CurriculumPackage): string[] {
  const rules = publishRules(pkg);
  return [!rules.canPublish && rules.note, !pkg.title.trim() && 'a title', !lessonTotal(pkg.units) && 'at least one lesson'].filter((x): x is string => !!x);
}

const releaseOf = (pkg: CurriculumPackage, version: number, note?: string): PackageContent => ({
  units: pkg.units,
  version,
  license: pkg.license,
  attribution: attributionFor(pkg, useStudio.getState().profile?.name),
  note: note?.trim() || undefined,
});

export async function teachingClasses(): Promise<CoopClass[]> {
  if (!signedIn()) return useStudio.getState().classes.map(fromLocal);
  const { data, error } = await supabase!.rpc('coop_teaching');
  if (error) fail(error);
  return (data as ClassRow[]).map(toClass);
}

export async function createClass(pkg: CurriculumPackage, maxFamilies = MAX_FAMILIES): Promise<CoopClass> {
  const issues = classIssues(pkg);
  if (issues.length) throw new Error(issues.join(', '));
  if (signedIn()) {
    await pushPackageNow(pkg);
    const { data, error } = await supabase!.rpc('coop_create_class', { pkg_id: pkg.id, max_fam: maxFamilies });
    if (error) fail(error);
    return { ...toClass(data as ClassRow), families: 0, lessons: lessonTotal(pkg.units) };
  }
  const now = new Date().toISOString();
  const cls: LocalClass = {
    id: uid('cc'),
    code: randomCode(8),
    title: pkg.title.trim(),
    teacherName: useStudio.getState().profile?.name ?? 'Teacher',
    packageId: pkg.id,
    description: pkg.description,
    subjects: pkg.subjects,
    gradeMin: pkg.gradeMin,
    gradeMax: pkg.gradeMax,
    lessonsPerWeek: pkg.lessonsPerWeek,
    minutesPerLesson: pkg.minutesPerLesson,
    parentInvolvement: pkg.parentInvolvement,
    familyStyle: pkg.familyStyle,
    cover: pkg.cover,
    color: pkg.color,
    maxFamilies,
    status: 'open',
    version: 1,
    families: 0,
    createdAt: now,
    updatedAt: now,
    releases: [releaseOf(pkg, 1)],
    members: [],
  };
  useStudio.getState().setClasses([cls, ...useStudio.getState().classes]);
  return fromLocal(cls);
}

/** Send the teacher's latest lessons to the class; families see it as an update. */
export async function sendClassUpdate(cls: CoopClass, pkg: CurriculumPackage, note: string): Promise<CoopClass> {
  const issues = classIssues(pkg);
  if (issues.length) throw new Error(issues.join(', '));
  if (signedIn()) {
    await pushPackageNow(pkg);
    const { data, error } = await supabase!.rpc('coop_update_class', { cid: cls.id, release_note: note.trim() || null });
    if (error) fail(error);
    return { ...cls, ...toClass(data as ClassRow), families: cls.families };
  }
  patchLocal(cls.id, (c) => ({ ...c, title: pkg.title.trim(), version: c.version + 1, updatedAt: new Date().toISOString(), releases: [...c.releases, releaseOf(pkg, c.version + 1, note)] }));
  return fromLocal(findLocal(cls.id)!);
}

export async function classSettings(cls: CoopClass, maxFamilies: number, open: boolean): Promise<CoopClass> {
  if (signedIn()) {
    const { data, error } = await supabase!.rpc('coop_class_settings', { cid: cls.id, max_fam: maxFamilies, is_open: open });
    if (error) fail(error);
    return { ...cls, ...toClass(data as ClassRow), families: cls.families };
  }
  patchLocal(cls.id, (c) => ({ ...c, maxFamilies, status: open ? 'open' : 'closed' }));
  return fromLocal(findLocal(cls.id)!);
}

/** A new invite code; the old one stops working. */
export async function newInviteCode(cls: CoopClass): Promise<string> {
  if (signedIn()) {
    const { data, error } = await supabase!.rpc('coop_new_code', { cid: cls.id });
    if (error) fail(error);
    return data as string;
  }
  const code = randomCode(8);
  patchLocal(cls.id, (c) => ({ ...c, code }));
  return code;
}

/** End the class. Families keep their plans, without further updates. */
export async function endClass(cls: CoopClass): Promise<void> {
  if (signedIn()) {
    const { error } = await supabase!.rpc('coop_delete_class', { cid: cls.id });
    if (error) fail(error);
    return;
  }
  patchLocal(cls.id, () => undefined);
}

export async function classRoster(cls: CoopClass): Promise<ClassMember[]> {
  if (!signedIn()) return findLocal(cls.id)?.members ?? [];
  const { data, error } = await supabase!.rpc('coop_roster', { cid: cls.id });
  if (error) fail(error);
  return (
    data as { family_id: string; family_label: string; share_names: boolean; progress: StudentProgress[]; total_lessons: number | null; on_version: number | null; joined_at: string; updated_at: string }[]
  ).map((r) => ({
    familyId: r.family_id,
    label: r.family_label,
    shareNames: r.share_names,
    progress: r.progress ?? [],
    totalLessons: r.total_lessons ?? undefined,
    onVersion: r.on_version ?? undefined,
    joinedAt: r.joined_at,
    updatedAt: r.updated_at,
  }));
}

export async function removeFamily(cls: CoopClass, familyId: ID): Promise<void> {
  if (signedIn()) {
    const { error } = await supabase!.rpc('coop_remove_family', { cid: cls.id, fid: familyId });
    if (error) fail(error);
    return;
  }
  patchLocal(cls.id, (c) => ({ ...c, members: c.members.filter((m) => m.familyId !== familyId) }));
}

/** The class's latest lessons (for the teacher, and families in it). */
export async function classContent(classId: ID): Promise<PackageContent | undefined> {
  if (!signedIn()) {
    const c = findLocal(classId);
    if (!c || (!c.members.some((m) => m.familyId === HERE) && !useStudio.getState().profile)) throw new Error('You’re not in this class');
    return c.releases.at(-1);
  }
  const { data, error } = await supabase!.rpc('coop_class_content', { cid: classId });
  if (error) fail(error);
  return (data as PackageContent | null) ?? undefined;
}

// ───────────────────────────── Families

export async function previewClass(code: string): Promise<CoopClass | undefined> {
  const c = normalizeClassCode(code);
  if (!signedIn()) {
    const found = useStudio.getState().classes.find((x) => x.code === c);
    return found ? fromLocal(found) : undefined;
  }
  const { data, error } = await supabase!.rpc('coop_class_preview', { class_code: c });
  if (error) fail(error);
  return data ? toClass(data as ClassRow) : undefined;
}

/** Join with an invite code. `label` is how the teacher sees the family. */
export async function joinClass(code: string, label: string, shareNames: boolean): Promise<{ cls: CoopClass; content: PackageContent }> {
  const c = normalizeClassCode(code);
  if (!signedIn()) {
    const found = useStudio.getState().classes.find((x) => x.code === c);
    if (!found) throw new Error('That class code isn’t valid');
    if (!found.members.some((m) => m.familyId === HERE)) {
      if (found.status !== 'open') throw new Error('This class isn’t taking new families');
      if (found.members.length >= found.maxFamilies) throw new Error('This class is full');
      const now = new Date().toISOString();
      patchLocal(found.id, (x) => ({ ...x, members: [...x.members, { familyId: HERE, label: label.trim() || 'My family', shareNames, progress: [], joinedAt: now, updatedAt: now }] }));
    }
    const cls = findLocal(found.id)!;
    return { cls: fromLocal(cls), content: cls.releases.at(-1)! };
  }
  if (!useAccount.getState().familyId) throw new Error('Finish setting up your family first.');
  const { data, error } = await supabase!.rpc('coop_join_class', { class_code: c, label: label.trim(), share: shareNames });
  if (error) fail(error);
  const row = data as ClassRow & { content: PackageContent };
  return { cls: toClass(row), content: row.content };
}

export interface MyClass {
  classId: ID;
  version: number;
  shareNames: boolean;
  status: CoopClass['status'];
}

/** The classes this family is in, with their latest version (where plan updates come from). */
export async function myClasses(): Promise<MyClass[]> {
  if (!signedIn()) {
    return useStudio
      .getState()
      .classes.filter((c) => c.members.some((m) => m.familyId === HERE))
      .map((c) => ({ classId: c.id, version: c.version, shareNames: !!c.members.find((m) => m.familyId === HERE)?.shareNames, status: c.status }));
  }
  if (!useAccount.getState().familyId) return [];
  const { data, error } = await supabase!.rpc('coop_my_classes');
  if (error) fail(error);
  return (data as { class_id: string; version: number; share_names: boolean; status: CoopClass['status'] }[]).map((r) => ({ classId: r.class_id, version: r.version, shareNames: r.share_names, status: r.status }));
}

export async function reportProgress(classId: ID, progress: StudentProgress[], total: number, version?: number): Promise<void> {
  if (!signedIn()) {
    patchLocal(classId, (c) => ({
      ...c,
      members: c.members.map((m) =>
        m.familyId === HERE ? { ...m, progress: m.shareNames ? progress : progress.map(({ done }) => ({ done })), totalLessons: total, onVersion: version, updatedAt: new Date().toISOString() } : m,
      ),
    }));
    return;
  }
  const { error } = await supabase!.rpc('coop_report_progress', { cid: classId, students: progress, total, on_ver: version ?? null });
  if (error) fail(error);
}

/** Let the teacher see the kids' first names (or stop). */
export async function setShareNames(curriculumId: ID, classId: ID, share: boolean): Promise<void> {
  if (signedIn()) {
    const { error } = await supabase!.rpc('coop_share_names', { cid: classId, share });
    if (error) fail(error);
  } else {
    patchLocal(classId, (c) => ({ ...c, members: c.members.map((m) => (m.familyId === HERE ? { ...m, shareNames: share, progress: share ? m.progress : m.progress.map(({ done }) => ({ done })) } : m)) }));
  }
  const cur = useStore.getState().curricula.find((c) => c.id === curriculumId);
  if (cur) useStore.getState().upsertCurriculum({ ...cur, coopShareNames: share });
}

/** Leave the class. The family keeps the plan, without further updates. */
export async function leaveClass(curriculumId: ID, classId: ID): Promise<void> {
  if (signedIn()) {
    const { error } = await supabase!.rpc('coop_leave_class', { cid: classId });
    if (error) fail(error);
  } else {
    patchLocal(classId, (c) => ({ ...c, members: c.members.filter((m) => m.familyId !== HERE) }));
  }
  const cur = useStore.getState().curricula.find((c) => c.id === curriculumId);
  if (cur) useStore.getState().upsertCurriculum({ ...cur, coopClassId: undefined, coopEnded: undefined, coopShareNames: undefined });
}
