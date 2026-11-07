import { useEffect, useState } from 'react';
import { Image, View, type ImageResizeMode, type ImageStyle, type StyleProp } from 'react-native';

import { mediaUrl } from '@/services/sync';
import { T, useColors } from '@/ui';

/**
 * A family photo: the local file when this device took it, otherwise the
 * copy in family cloud storage (uploaded by another device).
 */
export function MediaImage({ uri, remotePath, style, resizeMode }: { uri?: string; remotePath?: string; style: StyleProp<ImageStyle>; resizeMode?: ImageResizeMode }) {
  const c = useColors();
  const [fetched, setFetched] = useState<{ path: string; url?: string }>();
  useEffect(() => {
    if (uri || !remotePath) return;
    let alive = true;
    mediaUrl(remotePath).then((url) => alive && setFetched({ path: remotePath, url }));
    return () => {
      alive = false;
    };
  }, [uri, remotePath]);

  const src = uri || (fetched?.path === remotePath ? fetched?.url : undefined);
  if (!src) {
    return (
      <View style={[style as object, { alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceAlt }]}>
        <T v="caption" muted>{remotePath ? 'Loading photo…' : 'Photo on another device'}</T>
      </View>
    );
  }
  return <Image source={{ uri: src }} style={style} resizeMode={resizeMode} />;
}
