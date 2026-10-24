import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Game, StructureDef, UnitDef, factionCanUse } from '../../../packages/fusion/src/index';
import { drawIcon } from '../../../packages/fusion/src/render';

type Status = 'owned' | 'ready' | 'locked' | 'tech';
interface Node { item: string; name: string; cost: number; kind: 'building' | 'unit' | 'upgrade'; status: Status; needs: string[]; powers: string[] }

/**
 * The progression map: every building, upgrade and unit this side can reach, arranged in
 * tiers by what it needs, with what you already have, what you can build now and what is
 * still missing. Superweapons and palace powers are shown on the building that grants them.
 */
export default function TechTree({ game, slot, color, accent, onClose }: { game: Game; slot: number; color: string; accent: string; onClose: () => void }) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 1000); return () => clearInterval(t); }, []);
  const pack = game.pack;
  const p = game.players[slot];

  // Tiers depend only on the rules, so compute them once.
  const tiers = useMemo(() => {
    const mine = (d: { factions?: string[] }) => factionCanUse(d, p.faction, p.side);
    const memo = new Map<string, number>();
    const structureTier = (id: string, depth = 0): number => {
      if (memo.has(id)) return memo.get(id)!;
      const def = pack.structures[id];
      if (!def || depth > 20) return 9;
      const t = def.constructionYard ? 0 : 1 + entriesTier(def.prereqs, depth);
      memo.set(id, t);
      return t;
    };
    const entriesTier = (prereqs: string[], depth: number) => Math.max(0, ...prereqs.map(entry => Math.min(...entry.split('|').map(alt => {
      const [base, level] = alt.split('@');
      const s = pack.structures[base];
      if (!s || !mine(s)) return 99;
      return structureTier(base, depth + 1) + (level ? 1 : 0);
    }))));
    const out = new Map<string, number>();
    for (const s of Object.values(pack.structures)) if (mine(s) && (s.tech <= 10 || s.constructionYard)) {
      out.set(s.id, structureTier(s.id));
      if (s.upgrades) out.set(`upgrade:${s.id}`, structureTier(s.id) + 1);
    }
    for (const u of Object.values(pack.units)) if (mine(u) && u.tech <= 10) out.set(u.id, 1 + entriesTier(u.prereqs, 0));
    return out;
  }, [pack, p.faction, p.side]);

  const columns = useMemo(() => {
    const owned = game.owned(p);
    const name = (id: string) => pack.structures[id]?.name ?? id;
    const missing = (prereqs: string[]) => prereqs.filter(entry => !entry.split('|').some(alt => {
      const [base, level] = alt.split('@');
      return (owned.get(base) ?? -1) >= Number(level ?? 0);
    })).map(entry => entry.split('|').filter(alt => factionCanUse(pack.structures[alt.split('@')[0]] ?? {}, p.faction, p.side))
      .map(alt => { const [base, level] = alt.split('@'); return level ? `${name(base)} upgrade` : name(base); }).join(' or '));
    const nodes: (Node & { tier: number })[] = [];
    for (const [item, tier] of tiers) {
      const upgrade = item.startsWith('upgrade:');
      const base = upgrade ? item.slice(8) : item;
      const def: StructureDef | UnitDef = pack.structures[base] ?? pack.units[base];
      const isUnit = !!pack.units[base];
      let status: Status;
      if (def.tech > game.techCap && !(def as StructureDef).constructionYard) status = 'tech';
      else if (upgrade ? (owned.get(base) ?? 0) >= 1 : !isUnit && owned.has(base)) status = 'owned';
      else status = game.canBuild(p, item, owned) ? 'ready' : 'locked';
      const needs = status === 'locked' ? (upgrade ? (owned.has(base) ? [] : [name(base)]) : missing(def.prereqs)) : [];
      if (status === 'locked' && !needs.length) needs.push(isUnit ? 'its factory' : 'a Construction Yard');
      const powers: string[] = [];
      const sw = !upgrade && !isUnit ? (pack.structures[base] as StructureDef).superweapon : undefined;
      for (const w of sw ? (Array.isArray(sw) ? sw : [sw]) : []) if (factionCanUse(w, p.faction, p.side)) powers.push(w.name);
      nodes.push({ item, tier, name: upgrade ? `${def.name} upgrade` : def.name, cost: game.costOf(item, p), kind: upgrade ? 'upgrade' : isUnit ? 'unit' : 'building', status, needs, powers });
    }
    const max = Math.max(0, ...nodes.map(n => n.tier));
    const order = { building: 0, upgrade: 1, unit: 2 };
    return Array.from({ length: max + 1 }, (_, t) => nodes.filter(n => n.tier === t).sort((a, b) => order[a.kind] - order[b.kind] || a.cost - b.cost || a.name.localeCompare(b.name)))
      .filter(col => col.length);
  }, [tiers, tick, game, p, pack]);

  const counts = columns.flat().reduce((c, n) => ({ ...c, [n.status]: (c[n.status] ?? 0) + 1 }), {} as Record<Status, number>);
  return <div className="tech-tree" role="dialog" aria-label="Tech tree">
    <div className="tt-head">
      <b>TECH TREE · {p.name.toUpperCase()}</b>
      <span className="tt-legend"><i className="owned" />built {counts.owned ?? 0}<i className="ready" />can build {counts.ready ?? 0}<i className="locked" />locked {counts.locked ?? 0}{counts.tech ? <><i className="tech" />above tech level {counts.tech}</> : null}</span>
      <button onClick={onClose}>CLOSE</button>
    </div>
    <div className="tt-columns">
      {columns.map((col, i) => <div key={i} className="tt-col">
        <h4>{i === 0 ? 'START' : `TIER ${i}`}</h4>
        {col.map(n => <div key={n.item} className={`tt-node ${n.status} ${n.kind}`} title={n.needs.length ? `Needs: ${n.needs.join(', ')}` : n.name}>
          <TreeIcon game={game} item={n.item} color={color} accent={accent} />
          <div className="tt-text">
            <span className="tt-name">{n.name}</span>
            <span className="tt-cost">{n.kind === 'unit' ? 'Unit' : n.kind === 'upgrade' ? 'Upgrade' : 'Building'} · {n.cost}</span>
            {n.powers.map(w => <span key={w} className="tt-power">★ {w}</span>)}
            {n.needs.length > 0 && <span className="tt-needs">Needs {n.needs.join(', ')}</span>}
            {n.status === 'tech' && <span className="tt-needs">Above this match's tech level</span>}
          </div>
        </div>)}
      </div>)}
    </div>
  </div>;
}

function TreeIcon({ game, item, color, accent }: { game: Game; item: string; color: string; accent: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) drawIcon(ref.current, game, item, color, accent); }, [game, item, color, accent]);
  return <canvas ref={ref} width={52} height={40} className="tt-icon" />;
}
