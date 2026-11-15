import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useNotices } from '@/hooks/useNotices';
import { radius, useColors } from '@/ui';

/** The parent's bell: opens the notifications center, with the unread count. */
export function NotificationBell() {
  const c = useColors();
  const { unread } = useNotices();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      onPress={() => router.push('/notifications')}
      hitSlop={6}
      style={({ pressed }) => ({
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface,
        opacity: pressed ? 0.8 : 1,
      })}>
      <Text style={{ fontSize: 16 }}>🔔</Text>
      {unread ? (
        <View style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
