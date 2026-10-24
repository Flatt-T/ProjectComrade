import React, { useEffect, useRef, useState } from 'react';
import { CHAT_MAX, ChatAudience } from '@comrade/contracts';
import type { ChatLine, RoomConnection } from './net';
import { typingIn } from './help';

/**
 * Room chat to everyone or to your allies (players on your team). Allied messages are
 * filtered by the server, so opponents never receive them.
 *
 * `overlay` is the in-battle version: recent lines fade out, Enter opens the input,
 * Tab switches between all and allies, Esc closes it.
 */
export default function Chat({ conn, team, overlay = false, onMessage }: { conn: RoomConnection; team: number; overlay?: boolean; onMessage?: (line: ChatLine) => void }) {
  const [lines, setLines] = useState<ChatLine[]>(() => conn.chatLog);
  const [open, setOpen] = useState(!overlay);
  const [pick, setTo] = useState<ChatAudience>('all');
  const to: ChatAudience = team === 0 ? 'all' : pick;
  const [text, setText] = useState('');
  const [, setNow] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => conn.on(message => {
    if (message.type !== 'chat') return;
    setLines([...conn.chatLog]);
    if (message.from !== conn.id) onMessage?.(conn.chatLog[conn.chatLog.length - 1]);
  }), [conn, onMessage]);
  // Overlay lines fade after a while; re-render so they disappear on time.
  useEffect(() => { if (!overlay) return; const t = setInterval(() => setNow(n => n + 1), 1000); return () => clearInterval(t); }, [overlay]);
  useEffect(() => { list.current?.scrollTo(0, list.current.scrollHeight); }, [lines]);
  useEffect(() => {
    if (!overlay) return;
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' && !typingIn(document.activeElement)) { ev.preventDefault(); setOpen(true); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [overlay]);
  useEffect(() => { if (open && overlay) input.current?.focus(); }, [open, overlay]);

  const send = () => {
    const clean = text.trim().slice(0, CHAT_MAX);
    if (clean) conn.send({ type: 'chat', text: clean, to });
    setText('');
    if (overlay) { setOpen(false); input.current?.blur(); }
  };
  const recent = overlay && !open ? lines.filter(l => Date.now() - l.at < 12000).slice(-6) : lines.slice(-50);

  return <div className={`chat ${overlay ? 'overlay' : 'panel'} ${open ? 'open' : ''}`}>
    {!overlay && <span className="eyebrow">CHAT</span>}
    <div className="chat-lines" ref={list} aria-live="polite">
      {recent.map(l => <p key={`${l.at}-${l.from}`} className={l.to === 'allies' ? 'allies' : ''}>
        <b>{l.to === 'allies' ? '[ALLIES] ' : ''}{l.name}:</b>{' '}{l.text}
      </p>)}
      {!overlay && !lines.length && <p className="chat-empty">No messages yet.</p>}
    </div>
    {open && <div className="chat-input">
      <button type="button" className={to === 'allies' ? 'on' : ''} disabled={team === 0} title={team === 0 ? 'Join a team in the lobby to talk to allies' : 'Switch audience (Tab)'}
        onClick={() => setTo(t => (t === 'all' ? 'allies' : 'all'))}>{to === 'all' ? 'ALL' : 'ALLIES'}</button>
      <input ref={input} value={text} maxLength={CHAT_MAX} placeholder={to === 'all' ? 'Message everyone' : 'Message your allies'} aria-label="Chat message"
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); send(); }
          else if (e.key === 'Escape') { setText(''); if (overlay) { setOpen(false); input.current?.blur(); } }
          else if (e.key === 'Tab' && team > 0) { e.preventDefault(); setTo(t => (t === 'all' ? 'allies' : 'all')); }
        }} />
    </div>}
    {overlay && !open && <small className="chat-hint">Enter to chat</small>}
  </div>;
}
