// PW17: persistent-world pack compatibility manifest (COMRADE 18 §3.6).
//
// Every pack a persistent region may run is declared here with the revision
// the world pins at creation. Packs from different original engine families
// are NOT interchangeable: Fusion packs share one simulation, but a pack
// only becomes selectable for the persistent profile once its mechanics are
// proven under the persistent ruleset — unsupported combinations must be
// explicitly unavailable, never silently substituted.
//
// Versioning: `revision` is recorded on the world row (pack_revision) when the
// world is created. Snapshots pin packId + seed, so restoreGame always
// resolves the SAME pack content the region ran — a future content update
// adds a new revision entry and never hot-reinterprets live entities,
// structures or superweapon timers. Retired revisions stay listed as
// 'retained' so existing worlds keep resolving.

export type PersistentPackStatus = 'supported' | 'retained' | 'unsupported';

export interface PersistentPackEntry {
  packId: string;
  /** Content revision recorded on the world row; bump when pack data changes. */
  revision: string;
  status: PersistentPackStatus;
  notes?: string;
}

export const PERSISTENT_PACK_MANIFEST: PersistentPackEntry[] = [
  {
    packId: 'td',
    revision: 'td-persistent-1',
    status: 'supported',
    notes: 'Tiberian Dawn rules pack — the persistent beta baseline. GDI/Nod mixed forces verified under persistent rules (PW17).',
  },
  // Future approved content packs append here with their own revision. A pack
  // from another engine family requires an actual adapter/mechanics proof
  // before its status may become 'supported' — listing it 'unsupported' keeps
  // it explicitly unavailable rather than fake-selectable.
];

export function persistentPackEntry(packId: string): PersistentPackEntry | undefined {
  return PERSISTENT_PACK_MANIFEST.find(e => e.packId === packId);
}

/** The revision a NEW world should pin for this pack. */
export function persistentPackRevision(packId: string): string {
  const e = persistentPackEntry(packId);
  if (!e || e.status !== 'supported') throw new Error(`pack ${packId} is not available for the persistent profile`);
  return e.revision;
}

/**
 * Whether a region spec's pack may run: 'supported' packs always, 'retained'
 * packs only so worlds created before their retirement keep resolving — they
 * can never back a NEW world (persistentPackRevision rejects them).
 */
export function persistentPackRunnable(packId: string): boolean {
  const s = persistentPackEntry(packId)?.status;
  return s === 'supported' || s === 'retained';
}
