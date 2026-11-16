import { router } from 'expo-router';

import { Segmented } from '@/ui';

export type PlanPart = 'week' | 'curricula' | 'unit';

/** The Plan tab's three parts: the weekly rhythm, the curricula, and the unit study generator. */
export function PlanSwitcher({ value }: { value: PlanPart }) {
  return (
    <Segmented<PlanPart>
      scroll
      value={value}
      onChange={(v) => {
        if (v === value) return;
        if (v === 'week') router.navigate('/schedule');
        // Already on the curricula screen: just switch its part.
        else if (value !== 'week') router.setParams({ tab: v === 'unit' ? 'unit' : undefined });
        else router.navigate({ pathname: '/learn', params: v === 'unit' ? { tab: 'unit' } : {} });
      }}
      options={[
        { value: 'week', label: '🗓️ Week' },
        { value: 'curricula', label: '📚 Curricula' },
        { value: 'unit', label: '🧭 Unit study' },
      ]}
    />
  );
}
