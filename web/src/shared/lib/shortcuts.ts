// Shortcuts are written the macOS way in the code and shown the way of the running OS.

const isMac = /Mac/.test(navigator.platform || navigator.userAgent);

const MODIFIERS: Record<string, string> = { '⌃': 'Ctrl', '⌘': 'Ctrl', '⌥': 'Alt', '⇧': 'Shift' };
const KEYS: Record<string, string> = { '↵': 'Enter', '⌦': 'Del', '⌫': 'Backspace', '↓': 'Down' };

/** `⇧⌘L` on macOS, `Ctrl+Shift+L` elsewhere. */
export function formatShortcut(keys: string, mac = isMac): string {
  if (mac) return keys;
  const chars = [...keys];
  const split = chars.findIndex((c) => !MODIFIERS[c]);
  const held = chars.slice(0, split === -1 ? chars.length : split).map((c) => MODIFIERS[c]);
  const key = split === -1 ? '' : chars.slice(split).join('');
  const order = ['Ctrl', 'Alt', 'Shift'].filter((m) => held.includes(m));
  return [...order, KEYS[key] ?? key].filter(Boolean).join('+');
}
