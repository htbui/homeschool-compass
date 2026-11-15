import type { TextProps } from 'react-native';

import { accountCopy } from '@/lib/accountCopy';
import { cloudEnabled } from '@/services/cloud';
import { T } from '@/ui';

export { DEVICE_ONLY } from '@/lib/accountCopy';

/** `signIn` where an account is possible, otherwise "This copy of Freerange keeps everything on this device. {deviceOnly}". */
export const needsAccount = (signIn: string, deviceOnly: string) => accountCopy(cloudEnabled, signIn, deviceOnly);

/** A caption explaining what an account adds, worded for the build (cloud or device-only). */
export function AccountNote({ signIn, deviceOnly, v = 'caption', muted = true, ...rest }: TextProps & { signIn: string; deviceOnly: string; v?: 'caption' | 'body'; muted?: boolean }) {
  return (
    <T v={v} muted={muted} {...rest}>
      {needsAccount(signIn, deviceOnly)}
    </T>
  );
}
