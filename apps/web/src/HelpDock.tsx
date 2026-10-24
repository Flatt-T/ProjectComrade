import React, { useEffect, useRef, useState } from 'react';
import { helpOpen, toggleHelp } from './help';

/**
 * The helpdot support chat as part of the page (home, game browser and war room) rather
 * than a floating bubble. The widget's own container is moved in here while this is
 * mounted and handed back to the page body when it unmounts, so battles keep their
 * HELP-button behaviour.
 */
export default function HelpDock() {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let container: HTMLElement | null = null;
    const hostEl = host.current;
    const dock = () => {
      container = document.getElementById('sh-widget-container');
      if (!container || !hostEl) return false;
      hostEl.appendChild(container);
      document.body.classList.add('comrade-help-docked');
      setReady(true); setOpen(helpOpen());
      return true;
    };
    // The widget script loads after the app, so wait for it if needed.
    const watch = dock() ? null : new MutationObserver(() => { if (dock()) watch?.disconnect(); });
    watch?.observe(document.body, { childList: true });
    // Follow the window's own close button and other changes to its open state.
    const sync = window.setInterval(() => setOpen(helpOpen()), 400);
    return () => {
      watch?.disconnect(); clearInterval(sync);
      document.body.classList.remove('comrade-help-docked');
      // React may already have removed this section (and the widget inside it) from the
      // page by now, so hand the widget back whenever it is ours or detached.
      if (container && (container.parentElement === hostEl || !container.isConnected)) document.body.appendChild(container);
    };
  }, []);

  const toggle = () => { if (toggleHelp()) setOpen(o => !o); };

  return <section className={`help-dock ${open ? 'open' : ''}`}>
    <div className="help-dock-head">
      <span className="eyebrow">HELP &amp; REPORTS</span>
      <button onClick={toggle} disabled={!ready} aria-expanded={open}>{!ready ? 'LOADING…' : open ? 'CLOSE HELP' : 'OPEN HELP CHAT'}</button>
    </div>
    {!open && <p className="help-dock-blurb">Questions about the game, or something not working? Ask the help desk or file a report.</p>}
    <div className="help-dock-host" ref={host} />
  </section>;
}
