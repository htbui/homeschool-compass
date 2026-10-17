let counter = 0;

/** Short, sortable-enough local id. Replaced by server ids once synced. */
export function uid(prefix = ''): string {
  counter = (counter + 1) % 1296;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 6)}`;
}
