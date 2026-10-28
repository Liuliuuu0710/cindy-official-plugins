'use strict';
// Physical KeyboardEvent.code -> macOS virtual key code. Shared by settings and worker.
const EmoteShortcuts = (() => {
  const keys = {
    KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, KeyH: 4, KeyG: 5, KeyZ: 6, KeyX: 7, KeyC: 8, KeyV: 9,
    KeyB: 11, KeyQ: 12, KeyW: 13, KeyE: 14, KeyR: 15, KeyY: 16, KeyT: 17,
    Digit1: 18, Digit2: 19, Digit3: 20, Digit4: 21, Digit6: 22, Digit5: 23, Equal: 24,
    Digit9: 25, Digit7: 26, Minus: 27, Digit8: 28, Digit0: 29, BracketRight: 30, KeyO: 31,
    KeyU: 32, BracketLeft: 33, KeyI: 34, KeyP: 35, Enter: 36, KeyL: 37, KeyJ: 38, Quote: 39,
    KeyK: 40, Semicolon: 41, Backslash: 42, Comma: 43, Slash: 44, KeyN: 45, KeyM: 46, Period: 47,
    Tab: 48, Space: 49, Backquote: 50, Backspace: 51,
    MetaLeft: 55, ShiftLeft: 56, AltLeft: 58, ControlLeft: 59,
    F17: 64, F18: 79, F19: 80, F20: 90, F5: 96, F6: 97, F7: 98, F3: 99, F8: 100,
    F9: 101, F11: 103, F13: 105, F16: 106, F14: 107, F10: 109, F12: 111, F15: 113,
    Home: 115, PageUp: 116, Delete: 117, F4: 118, End: 119, F2: 120, PageDown: 121, F1: 122,
    ArrowLeft: 123, ArrowRight: 124, ArrowDown: 125, ArrowUp: 126,
  };
  // Bits: Control=1, Option=2, Shift=4, Command=8.
  const modifierBits = { ControlLeft: 1, AltLeft: 2, ShiftLeft: 4, MetaLeft: 8 };
  const defaults = () => ({ code: 'KeyG', modifiers: 8 });
  function validate(value) {
    if (!value || !Object.hasOwn(keys, value.code) || !Number.isInteger(value.modifiers) ||
        value.modifiers < 0 || value.modifiers > 15) throw new Error('SHORTCUT_INVALID');
    return { code: value.code, modifiers: value.modifiers & ~(modifierBits[value.code] || 0) };
  }
  function fromEvent(event) {
    return validate({ code: event.code.replace(/(Control|Alt|Shift|Meta)Right$/, '$1Left'), modifiers: (event.ctrlKey ? 1 : 0) | (event.altKey ? 2 : 0) |
      (event.shiftKey ? 4 : 0) | (event.metaKey ? 8 : 0) });
  }
  function label(value) {
    const names = { ControlLeft: '⌃ Control', AltLeft: '⌥ Option', ShiftLeft: '⇧ Shift', MetaLeft: '⌘ Command', Space: 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowDown: '↓', ArrowUp: '↑',
      Enter: '↩', Tab: 'Tab', Backspace: '⌫', Delete: '⌦', Equal: '=', Minus: '-', BracketRight: ']',
      BracketLeft: '[', Quote: "'", Semicolon: ';', Backslash: '\\', Comma: ',', Slash: '/', Period: '.', Backquote: '`' };
    const mods = [[1, '⌃'], [2, '⌥'], [4, '⇧'], [8, '⌘']].filter(([bit]) => value.modifiers & bit).map(([, text]) => text);
    return [...mods, names[value.code] || value.code.replace(/^(Key|Digit)/, '')].join(' ');
  }
  function native(value) {
    const shortcut = validate(value);
    return { keyCode: keys[shortcut.code], modifierOnly: modifierBits[shortcut.code] || 0, modifiers: (shortcut.modifiers & 1 ? 4096 : 0) |
      (shortcut.modifiers & 2 ? 2048 : 0) | (shortcut.modifiers & 4 ? 512 : 0) | (shortcut.modifiers & 8 ? 256 : 0) };
  }
  return { defaults, validate, fromEvent, label, native };
})();
if (typeof module !== 'undefined') module.exports = EmoteShortcuts;
