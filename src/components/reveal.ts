import { Platform, type HostInstance, type ScrollViewInstance } from 'react-native';

/**
 * Scroll a view into sight: on the web the view is a DOM element; on phones it's measured
 * against the screen's scroll view (pass the ref given to `<Screen scrollRef>`).
 */
export function reveal(target: HostInstance | null | undefined, scroll?: ScrollViewInstance | null, offset = 16) {
  if (!target) return;
  if (Platform.OS === 'web') {
    (target as unknown as { scrollIntoView?: (o: object) => void }).scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    return;
  }
  const inner = scroll?.getInnerViewRef?.();
  if (!scroll || !inner) return;
  try {
    target.measureLayout(inner, (_x: number, y: number) => scroll.scrollTo({ y: Math.max(0, y - offset), animated: true }), () => {});
  } catch {
    // Not laid out yet; nothing to scroll to.
  }
}
