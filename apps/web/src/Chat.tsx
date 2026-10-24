import React, { useEffect, useRef, useState } from 'react';
import { CHAT_MAX, ChatAudience } from '@comrade/contracts';
import type { ChatLine, RoomConnection } from './net';
import { typingIn } from './help';

/**
 * Room chat to everyone or to your allies (players on your team). Allied messages are
 * filtered by the server, so opponents never receive them.
 *
 * `overlay` is the in-battle version: a drawer that slides out from the left edge (the
 * CHAT tab, or Enter). While it is closed, new lines show briefly over the battlefield
 * and the tab counts unread messages. Tab switches between all and allies, Esc closes it.
 */
export default function Chat({ conn, team, overlay = false, onMessage }: { conn: RoomConnection; team: number; overlay?: boolean; onMessage?: (line: ChatLine) => void }) {
  const [lines, setLines] = useState<ChatLine[]>(() => conn.chatLog);
  const [open, setOpen] = useState(!overlay);
  /** Opened from the tab: stays open after sending. Opened with Enter: closes after sending. */
  const pinned = useRef(false);
  const [unread, setUnread] = useState(0);
  const [pick, setTo] = useState<ChatAudience>('all');
  const to: ChatAudience = team === 0 ? 'all' : pick;
  const [text, setText] = useState('');
  const [, setNow] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => conn.on(message => {
    if (message.type !== 'chat') return;
    setLines([...conn.chatLog]);
    if (message.from !== conn.id) {
      onMessage?.(conn.chatLog[conn.chatLog.length - 1]);
      if (overlay && !openRef.current) setUnread(n => n + 1);
    }
  }), [conn, onMessage, overlay]);
  // Overlay lines fade after a while; re-render so they disappear on time.
  useEffect(() => { if (!overlay) return; const t = setInterval(() => setNow(n => n + 1), 1000); return () => clearInterval(t); }, [overlay]);
  useEffect(() => { list.current?.scrollTo(0, list.current.scrollHeight); }, [lines, open]);
  useEffect(() => {
    if (!overlay) return;
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' && !typingIn(document.activeElement)) { ev.preventDefault(); pinned.current = false; setOpen(true); setTimeout(() => input.current?.focus(), 0); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [overlay]);
  useEffect(() => { if (open) setUnread(0); }, [open]);

  const close = () => { setOpen(false); input.current?.blur(); };
  const send = () => {
    const clean = text.trim().slice(0, CHAT_MAX);
    if (clean) conn.send({ type: 'chat', text: clean, to });
    setText('');
    if (overlay && !pinned.current) close();
  };
  const row = (l: ChatLine) => <p key={`${l.at}-${l.from}`} className={l.to === 'allies' ? 'allies' : ''}>
    <b>{l.to === 'allies' ? '[ALLIES] ' : ''}{l.name}:</b>{' '}{l.text}
  </p>;
  const inputRow = <div className="chat-input">
    <button type="button" className={to === 'allies' ? 'on' : ''} disabled={team === 0} title={team === 0 ? 'Join a team in the lobby to talk to allies' : 'Switch audience (Tab)'}
      onClick={() => setTo(t => (t === 'all' ? 'allies' : 'all'))}>{to === 'all' ? 'ALL' : 'ALLIES'}</button>
    <input ref={input} value={text} maxLength={CHAT_MAX} placeholder={to === 'all' ? 'Message everyone' : 'Message your allies'} aria-label="Chat message"
      onChange={e => setText(e.target.value)}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); send(); }
        else if (e.key === 'Escape') { setText(''); if (overlay) close(); }
        else if (e.key === 'Tab' && team > 0) { e.preventDefault(); setTo(t => (t === 'all' ? 'allies' : 'all')); }
      }} />
    {overlay && <button type="button" onClick={send}>SEND</button>}
  </div>;

  if (!overlay) return <div className="chat panel open">
    <span className="eyebrow">CHAT</span>
    <div className="chat-lines" ref={list} aria-live="polite">
      {lines.slice(-50).map(row)}
      {!lines.length && <p className="chat-empty">No messages yet.</p>}
    </div>
    {inputRow}
  </div>;

  const recent = lines.filter(l => Date.now() - l.at < 12000).slice(-5);
  return <div className={`chat overlay ${open ? 'open' : ''}`}>
    <button type="button" className="chat-tab" aria-expanded={open} aria-label={open ? 'Hide chat' : 'Show chat'}
      onClick={() => { if (open) close(); else { pinned.current = true; setOpen(true); } }}>
      {open ? '◀' : '▶'}<span>CHAT</span>{!open && unread > 0 && <i>{unread}</i>}
    </button>
    <div className="chat-drawer" aria-hidden={!open}>
      <span className="eyebrow">CHAT · {team === 0 ? 'EVERYONE' : 'EVERYONE / ALLIES'}</span>
      <div className="chat-lines" ref={list} aria-live="polite">
        {lines.slice(-50).map(row)}
        {!lines.length && <p className="chat-empty">No messages yet.</p>}
      </div>
      {open && inputRow}
      <small className="chat-hint">Enter to chat · Tab switches all / allies · Esc closes</small>
    </div>
    {!open && recent.length > 0 && <div className="chat-recent">{recent.map(row)}</div>}
  </div>;
}
