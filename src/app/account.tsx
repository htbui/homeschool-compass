import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { PasswordField } from '@/components/PasswordField';
import { passwordProblems, validEmail as isEmail } from '@/lib/authLinks';
import { formatDate } from '@/lib/dates';
import { cloudEnabled } from '@/services/cloud';
import { changeEmail, changePassword, createInvite, joinFamily, leaveFamily, pull, push, resolveConflict, sendPasswordReset, signIn, signOut, signUp } from '@/services/sync';
import { STATUS_LABEL, useAccount } from '@/store/useAccount';
import { useStore } from '@/store/useStore';
import { Button, Card, Field, Pill, Row, Screen, Section, Segmented, Stack, T, useColors, useConfirm } from '@/ui';


/** Sign in, create an account, and manage cloud sync for this device. */
export default function AccountScreen() {
  const userId = useAccount((s) => s.userId);
  if (!cloudEnabled) return <LocalOnly />;
  return userId ? <SignedIn /> : <SignInForm />;
}

function LocalOnly() {
  const hasFamily = useStore((s) => !!s.family);
  return (
    <Screen edges={[]}>
      <Section title="Cloud sync isn't set up in this build">
        <T>Freerange is running local-only: your family&apos;s data lives on this device. Use Settings → Export backup to move it to another device.</T>
        {/* Setup notes are for developers running their own build, never for parents. */}
        {__DEV__ ? <T muted>Developers: add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see README → Cloud).</T> : null}
        <Row wrap>
          {hasFamily ? <Button title="Go to Today" onPress={() => router.replace('/today')} /> : <Button title="Set up my family" onPress={() => router.replace('/onboarding')} />}
          {hasFamily ? <Button kind="secondary" title="Settings" onPress={() => router.push('/settings')} /> : null}
        </Row>
      </Section>
    </Screen>
  );
}

function SignInForm() {
  const c = useColors();
  const hasFamily = useStore((s) => !!s.family);
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const validEmail = isEmail(email);
  const missing = [!validEmail && 'a valid email', password.length < 6 && 'a password of 6+ characters'].filter(Boolean);

  const go = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'in') {
        await signIn(email, password);
      } else if (await signUp(email, password)) {
        setNotice(`We sent a confirmation link to ${email.trim()}. Open it, then sign in here.`);
        setMode('in');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (forgot) {
    return (
      <Screen edges={[]}>
        <Section title="Reset your password" subtitle="We’ll email you a link. It opens Freerange, signed in, so you can choose a new password. Your family’s records stay safe in your account.">
          <Card>
            <Field label="Email" value={email} onChangeText={(t) => { setEmail(t); setNotice(''); }} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
            {error ? <T color={c.danger}>{error}</T> : null}
            {notice ? <T color={c.successInk} accessibilityLiveRegion="polite">{notice}</T> : null}
            <Button
              title="Email me a reset link"
              loading={busy}
              disabled={!validEmail}
              reason="Still needed: a valid email"
              onPress={async () => {
                setBusy(true);
                setError('');
                try {
                  await sendPasswordReset(email);
                  setNotice(`If ${email.trim()} has a Freerange account, a reset link is on its way. Check your inbox (and spam).`);
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            />
          </Card>
          <Row>
            <Button kind="ghost" title="‹ Back to sign in" onPress={() => { setForgot(false); setError(''); setNotice(''); }} />
          </Row>
        </Section>
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <Section title={mode === 'in' ? 'Sign in to Freerange' : 'Create your Freerange account'} subtitle="Sync your family across phones, tablets, and the web, shop the live marketplace, and meet families nearby.">
        <Segmented<'in' | 'up'> value={mode} onChange={setMode} options={[{ value: 'in', label: 'Sign in' }, { value: 'up', label: 'Create account' }]} />
        <Card>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
          <PasswordField label="Password" value={password} onChangeText={setPassword} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} textContentType={mode === 'in' ? 'password' : 'newPassword'} />
          {mode === 'in' ? (
            <Row>
              <Button kind="ghost" size="sm" title="Forgot password?" onPress={() => { setForgot(true); setError(''); setNotice(''); }} />
            </Row>
          ) : null}
          {error ? <T color={c.danger}>{error}</T> : null}
          {notice ? <T color={c.successInk}>{notice}</T> : null}
          <Button title={mode === 'in' ? 'Sign in' : 'Create account'} loading={busy} disabled={missing.length > 0} reason={`Still needed: ${missing.join(', ')}`} onPress={go} />
        </Card>
        <T v="caption" muted>
          {hasFamily
            ? 'Signing in uploads this device’s family to your account (or lets you choose, if the account already has one).'
            : 'If your account already has a family, it downloads to this device.'}{' '}
          Kids never need an account — they use kid mode on any signed-in device.
        </T>
      </Section>
    </Screen>
  );
}

function SignedIn() {
  const c = useColors();
  const acct = useAccount();
  const family = useStore((s) => s.family);
  const confirm = useConfirm();
  const [invite, setInvite] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  if (acct.conflict) {
    return (
      <Screen edges={[]}>
        <Section title="Which family should this device use?" subtitle={`Your account already has “${acct.conflict.familyName}”, and this device has “${family?.familyName ?? 'a family'}”.`}>
          <Card>
            <T v="heading">☁️ Use “{acct.conflict.familyName}” from your account</T>
            <T muted>Replaces this device&apos;s family data with the account&apos;s. Export a backup first if you want to keep this device&apos;s copy.</T>
            <Button title="Use my account's family" loading={busy === 'cloud'} onPress={() => run('cloud', () => resolveConflict('cloud'))} />
          </Card>
          <Card>
            <T v="heading">📱 Keep this device&apos;s “{family?.familyName}”</T>
            <T muted>Replaces the family stored in your account with this device&apos;s data. Other devices signed in to the account will switch to it.</T>
            <Button kind="secondary" title="Upload this device's family" loading={busy === 'device'} onPress={() => run('device', () => resolveConflict('device'))} />
          </Card>
          {error ? <T color={c.danger}>{error}</T> : null}
          <Button kind="ghost" title="Sign out instead" onPress={() => run('out', () => signOut(true))} />
        </Section>
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      {acct.recovering ? <NewPassword title="Choose a new password" subtitle="You opened a password-reset link. Pick a new password to finish." /> : null}
      <Section title="Account & sync">
        <Card>
          <Row wrap style={{ justifyContent: 'space-between' }}>
            <T v="heading">{acct.email}</T>
            <Pill text={STATUS_LABEL[acct.status]} bg={acct.status === 'error' ? c.dangerSoft : acct.status === 'idle' ? c.successSoft : undefined} />
          </Row>
          {acct.familyId ? (
            <T muted>
              Syncing “{acct.familyName ?? family?.familyName}” across your devices
              {acct.lastSyncedAt ? ` · last synced ${formatDate(acct.lastSyncedAt.slice(0, 10), { month: 'short', day: 'numeric' })} at ${new Date(acct.lastSyncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}.
            </T>
          ) : family ? (
            <T muted>Setting up your family in the cloud…</T>
          ) : (
            <T muted>No family on this account yet. Set one up, or join another parent&apos;s family with an invite code.</T>
          )}
          {acct.error ? <T color={c.danger}>{acct.error}</T> : null}
          <Row wrap>
            {acct.familyId ? <Button size="sm" kind="secondary" title="Sync now" loading={busy === 'sync'} onPress={() => run('sync', async () => { await pull(); await push(); })} /> : null}
            {!family ? <Button size="sm" title="Set up my family" onPress={() => router.push('/onboarding')} /> : null}
            {family && acct.familyId ? <Button size="sm" title="Go to Today" onPress={() => router.replace('/today')} /> : null}
          </Row>
        </Card>
      </Section>

      {acct.familyId ? (
        <Section title="Add another parent or caregiver" subtitle="They create their own Freerange account, then enter this code to share your family's planner.">
          <Card>
            {invite ? (
              <Stack gap={4}>
                <T v="display" style={{ letterSpacing: 4 }}>{invite}</T>
                <T v="caption" muted>Works once, for 7 days.</T>
              </Stack>
            ) : null}
            <Button kind="secondary" title={invite ? 'Make a new code' : 'Create invite code'} loading={busy === 'invite'} onPress={() => run('invite', async () => setInvite(await createInvite()))} />
          </Card>
        </Section>
      ) : (
        <Section title="Join a family" subtitle="Got an invite code from another parent?">
          <Card>
            <Field label="Invite code" value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" maxLength={8} />
            <Button title="Join family" disabled={code.trim().length !== 8} reason="Codes are 8 characters" loading={busy === 'join'} onPress={() => run('join', async () => { await joinFamily(code); router.replace('/today'); })} />
          </Card>
        </Section>
      )}

      {error ? <T color={c.danger}>{error}</T> : null}

      <Section title="Sign-in details">
        <ChangeEmail current={acct.email} />
        {acct.recovering ? null : <NewPassword title="Change password" compact />}
      </Section>

      <Section title="Sign out">
        <Row wrap>
          <Button kind="secondary" title="Sign out" loading={busy === 'out'} onPress={() => run('out', () => signOut(true))} />
          <Button
            kind="secondary"
            title="Sign out & remove from this device"
            onPress={() => confirm.ask('Remove your family from this device?', () => run('out', async () => { await signOut(false); router.replace('/onboarding'); }), { confirm: 'Sign out & remove', body: 'Everything stays in your account; sign in again to bring it back. Use this on shared devices.' })}
          />
        </Row>
        {acct.familyId ? (
          <Button
            kind="danger"
            title="Leave family / delete from the cloud"
            onPress={() =>
              confirm.ask('Leave this family?', () => run('leave', async () => { await leaveFamily(); router.replace('/onboarding'); }), {
                confirm: 'Leave family',
                body: 'You lose access on all your devices. If you’re the last parent in the family, its cloud copy (planner, records, photos list) is permanently deleted. This can’t be undone.',
              })
            }
          />
        ) : null}
      </Section>
      {confirm.element}
    </Screen>
  );
}

/** Set a new password: after a reset link, or to change it. */
function NewPassword({ title, subtitle, compact }: { title: string; subtitle?: string; compact?: boolean }) {
  const c = useColors();
  const [open, setOpen] = useState(!compact);
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const problems = passwordProblems(pw, again);
  if (!open) {
    return (
      <Card>
        <Row wrap style={{ justifyContent: 'space-between' }}>
          <T v="heading">🔑 Password</T>
          <Button size="sm" kind="secondary" title={done ? 'Password changed ✓' : 'Change password'} onPress={() => { setOpen(true); setDone(false); }} />
        </Row>
      </Card>
    );
  }
  return (
    <Card tint={compact ? undefined : c.accentSoft}>
      <T v="heading">{title}</T>
      {subtitle ? <T v="caption" muted>{subtitle}</T> : null}
      <PasswordField label="New password" value={pw} onChangeText={setPw} autoComplete="new-password" textContentType="newPassword" />
      <PasswordField label="New password again" value={again} onChangeText={setAgain} autoComplete="new-password" textContentType="newPassword" />
      {error ? <T color={c.danger}>{error}</T> : null}
      <Row wrap style={{ justifyContent: 'flex-end' }}>
        {compact ? <Button kind="secondary" title="Cancel" onPress={() => { setOpen(false); setPw(''); setAgain(''); setError(''); }} /> : null}
        <Button
          title="Save new password"
          loading={busy}
          disabled={problems.length > 0}
          reason={`Still needed: ${problems.join(', ')}`}
          onPress={async () => {
            setBusy(true);
            setError('');
            try {
              await changePassword(pw);
              setPw('');
              setAgain('');
              setDone(true);
              setOpen(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      </Row>
    </Card>
  );
}

/** Move the account to a new email (confirmed by a link sent to it). */
function ChangeEmail({ current }: { current?: string }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const same = email.trim().toLowerCase() === (current ?? '').toLowerCase();
  return (
    <Card>
      <Row wrap style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1, minWidth: 180 }}>
          <T v="heading">✉️ Email</T>
          <T v="caption" muted>{current}</T>
        </View>
        {open ? null : <Button size="sm" kind="secondary" title="Change email" onPress={() => { setOpen(true); setNotice(''); }} />}
      </Row>
      {notice ? <T color={c.successInk} accessibilityLiveRegion="polite">{notice}</T> : null}
      {open ? (
        <>
          <Field label="New email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
          {error ? <T color={c.danger}>{error}</T> : null}
          <Row wrap style={{ justifyContent: 'flex-end' }}>
            <Button kind="secondary" title="Cancel" onPress={() => { setOpen(false); setEmail(''); setError(''); }} />
            <Button
              title="Change email"
              loading={busy}
              disabled={!isEmail(email) || same}
              reason={same ? 'That’s already your email' : 'Still needed: a valid email'}
              onPress={async () => {
                setBusy(true);
                setError('');
                try {
                  const pending = await changeEmail(email);
                  setNotice(pending ? `We sent a confirmation link to ${email.trim()}. Your sign-in email changes once you open it.` : `Your sign-in email is now ${email.trim()}.`);
                  setOpen(false);
                  setEmail('');
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            />
          </Row>
        </>
      ) : null}
    </Card>
  );
}
