import { router } from 'expo-router';
import { View } from 'react-native';

import { StateRadarCard } from '@/components/StateRadarCard';
import { StatePicker } from '@/components/StatePicker';
import { StepHeader } from '@/components/StepHeader';
import { getStateLaw, stateFromZip } from '@/lib/states';
import { useDraft } from '@/store/onboardingDraft';
import { Button, Field, Screen, space, Stack, T } from '@/ui';

export default function FamilyStep() {
  const d = useDraft();
  const law = getStateLaw(d.stateCode);
  const pinOk = /^\d{4}$/.test(d.parentPin);
  const missing = [!d.familyName.trim() && 'family name', !d.parentName.trim() && 'your name', !pinOk && '4-digit parent PIN', !law && 'state'].filter(Boolean);
  const canContinue = missing.length === 0;

  return (
    <Screen>
      <StepHeader step={1} total={4} title="Your family & location" subtitle="We'll pull your state's homeschool rules and available funding." />
      <Stack gap={space.lg}>
        <Field label="Family name" placeholder="The Miller Crew" value={d.familyName} onChangeText={(familyName) => d.set({ familyName })} />
        <Field label="Your name (primary educator)" placeholder="Dana Miller" value={d.parentName} onChangeText={(parentName) => d.set({ parentName })} />
        <Field
          label="Parent PIN"
          hint="4 digits. Kids need this to leave their view or reach parent-only areas."
          keyboardType="number-pad"
          maxLength={4}
          secureTextEntry
          value={d.parentPin}
          onChangeText={(parentPin) => d.set({ parentPin: parentPin.replace(/\D/g, '') })}
        />
        <Field
          label="ZIP code"
          keyboardType="number-pad"
          maxLength={5}
          value={d.zip}
          onChangeText={(z) => {
            const zip = z.replace(/\D/g, '');
            const guess = stateFromZip(zip);
            d.set({ zip, ...(guess ? { stateCode: guess } : {}) });
          }}
        />
        <View style={{ gap: 6 }}>
          <T v="label">State</T>
          <StatePicker value={d.stateCode} onChange={(stateCode) => d.set({ stateCode })} />
        </View>
        {law ? <StateRadarCard law={law} /> : null}
        <Button size="lg" title="Continue" disabled={!canContinue} reason={`Still needed: ${missing.join(', ')}`} onPress={() => router.push('/onboarding/kids')} />
      </Stack>
    </Screen>
  );
}
