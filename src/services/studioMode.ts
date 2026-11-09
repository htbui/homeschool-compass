import { router } from 'expo-router';

import { useStudio } from '@/store/useStudio';

/** Switch this device to Studio (setting up a creator profile the first time). */
export function enterStudio() {
  const studio = useStudio.getState();
  if (!studio.profile) {
    router.push('/studio/setup');
    return;
  }
  studio.setActive(true);
  router.replace('/studio');
}
