// The helpdot.me support widget, driven from the game's own tools panel while in battle.
// (Outside battle the widget shows its own launcher; see helpdot.css.)

/** Whether the widget has loaded on this page. */
export const helpAvailable = () => !!document.getElementById('sh-widget-toggle');

/** Whether the help window is open. */
export const helpOpen = () => !!document.getElementById('sh-widget-panel')?.classList.contains('sh-open');

/** Open or close the help window (the widget toggles on its own launcher's click). */
export function toggleHelp(): boolean {
  const toggle = document.getElementById('sh-widget-toggle');
  if (!toggle) return false;
  toggle.click();
  return true;
}

/** Battle screens mark the page so the floating launcher hides and the window sits clear of the sidebar. */
export function enterBattleHelp() {
  document.body.classList.add('comrade-in-battle');
  return () => document.body.classList.remove('comrade-in-battle');
}

/**
 * True when a key press belongs to a text field (chat, the help widget, forms), so game
 * hotkeys must ignore it.
 */
export function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable || !!el.closest?.('#sh-widget-container');
}
