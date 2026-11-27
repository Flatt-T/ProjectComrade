// PW32 (THU-2443): recipient-scoped views of Engineer consent grants.
//
// An accepted consent is mirrored into the deterministic sim as a journaled
// `consentGrant` so every client reproduces the consented capture. The beta
// client runs the full sim (DEC-IMPL-9), so observers must still hold the grant
// tuple (engineer, building, slots, ownership generation) to converge — but the
// private exchange itself is not theirs:
//
// - The consent request id links to the two-party request/approval messages.
//   Non-participants get an opaque, deterministic token instead. It is stable
//   per region + request, so live frames, reconnect snapshots and the client's
//   requestId idempotence all agree, and it cannot be mapped back to the request.
// - Consumed or invalidated grants carry no simulation weight (consentFor only
//   matches unused grants), so observers never receive the grant history.
// - Pending capture audit receipts carry the request id; observers get the token.
//
// Neither consents nor capture receipts are part of Game.checksum(), so a
// redacted observer sim stays checksum-identical to the authority.
import { createHash } from 'node:crypto';
import type { Command } from '@comrade/fusion';

type GrantCommand = Extract<Command, { t: 'consentGrant' }>;

interface CapturedState {
  v: 1; seed: number; snapshot: string; bindings: [string, number][]; tick: number;
}

interface SnapConsent { requestId: string; owner: number; requester: number; used: boolean }
interface SnapCaptureEvent { requestId: string; from: number; to: number }

/** Opaque stand-in for a consent request id, for non-participants. */
export function grantToken(regionId: string, requestId: string): string {
  return 'grant:' + createHash('sha256').update(`comrade-consent\0${regionId}\0${requestId}`).digest('hex').slice(0, 32);
}

const isParticipant = (slot: number | null, owner: number, requester: number) =>
  slot !== null && slot >= 0 && (slot === owner || slot === requester);

/**
 * The `mmo.sim` payload this subscriber may see. Returns the original object
 * when nothing needs redacting so the common path allocates nothing.
 */
export function simPayloadFor(payload: Record<string, unknown>, regionId: string, slot: number | null): Record<string, unknown> {
  const cmd = payload.command as Command | undefined;
  if (!cmd || cmd.t !== 'consentGrant') return payload;
  const grant = cmd as GrantCommand;
  if (isParticipant(slot, grant.owner, grant.requester)) return payload;
  return { ...payload, command: { ...grant, requestId: grantToken(regionId, grant.requestId) } };
}

/**
 * The subscription snapshot state this subscriber may see. Participants keep
 * their own grants and receipts intact; everything else is tokenized, and
 * consumed grants are withheld from non-participants.
 */
export function snapshotStateFor<T extends CapturedState>(state: T, regionId: string, slot: number | null): T {
  // Cheap guard: the engine serializes these arrays as JSON; no request id
  // anywhere means there is nothing private to scope.
  if (!state.snapshot.includes('"requestId"')) return state;
  const snap = JSON.parse(state.snapshot) as { state: { consents?: SnapConsent[]; captureEvents?: SnapCaptureEvent[] } };
  const s = snap.state;
  let changed = false;
  if (Array.isArray(s.consents)) {
    const out: SnapConsent[] = [];
    for (const c of s.consents) {
      if (isParticipant(slot, c.owner, c.requester)) { out.push(c); continue; }
      changed = true;
      if (c.used) continue;
      out.push({ ...c, requestId: grantToken(regionId, c.requestId) });
    }
    s.consents = out;
  }
  if (Array.isArray(s.captureEvents)) {
    s.captureEvents = s.captureEvents.map(e => {
      // Hostile captures carry no request. Receipt: `from` is the previous
      // owner, `to` the capturing requester.
      if (!e.requestId || isParticipant(slot, e.from, e.to)) return e;
      changed = true;
      return { ...e, requestId: grantToken(regionId, e.requestId) };
    });
  }
  return changed ? { ...state, snapshot: JSON.stringify(snap) } : state;
}
