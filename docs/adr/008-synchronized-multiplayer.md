# ADR 008 — Synchronized multiplayer via a WebSocket connection manager

Status: Implemented for Fusion Engine styles (Dune, RA2); Vanilla Conquer path below remains the plan for Classic C&C
Date: 2026-10-23
Builds on ADR 007 (lobby presence + configuration)

## Update — 2026-10-23: shipped for the Fusion Engine

Dune Style and Red Alert 2 Style run on the Comrade Fusion Engine (ADR 010), which was
built deterministic and command-driven from the start, so lockstep needed no engine
surgery:

- `LockstepSession` (`packages/fusion/src/session.ts`) groups ticks into 3-tick turns and
  schedules each human's commands two turns ahead. The simulation advances a turn only when
  every human's packet for it has arrived. AI opponents run inside the simulation, so they
  are identical on every client.
- Every packet carries a state checksum; a mismatch at the same tick flags a desync.
- The service relays `turn` messages in order to the other room members and records each
  player's last turn. If a player leaves mid-match it sends one final `surrender` turn, so
  every client removes that player on the same tick.
- The browser connection buffers turn packets until the battle subscribes, closing the
  start-up race between clients.
- Verified by unit tests (jitter, drops, malformed commands) and by the release smoke test,
  which plays two real browsers in one match and compares checksums.

The rest of this ADR is the plan for bringing the same to Classic C&C on Vanilla Conquer.

## Why the naive approach does not work

A tempting shortcut is: boot a two-house `GAME_NORMAL` COMRADE scenario on both
clients, mark both houses `IsHuman` (so the engine's AI does not auto-command them),
and relay each player's orders through the lobby WebSocket, applying them via the
`comrade_bridge` order functions.

This fails determinism. The engine processes **local** mouse/sidebar input directly
every frame (`Map.Input()` → `Keyboard_Process()` in `Main_Loop`), issuing commands to
the local player's house **immediately**. Deterministic lockstep requires every
client to apply every command on the **same frame** — local commands must be delayed
and ordered identically to remote ones. Applying local input instantly while remote
input arrives later guarantees divergence. Gating `Main_Loop` frame advance from JS
does not fix this, because the native input has already mutated local-only state.

## The correct design: reuse the engine's own lockstep

Tiberian Dawn was built for IPX lockstep and that machinery is still in the tree:

- `QueueClass<EventClass, MAX_EVENTS> OutList` — commands this client has generated.
- `QueueClass<EventClass, MAX_EVENTS*8> DoList` — commands to execute, from all peers.
- `Queue_AI()` — the per-frame executor that drains `DoList` deterministically.
- `tiberiandawn/ipxmgr.cpp`, `ipxgconn.cpp` — the IPX transport, compiled only when
  the CMake `NETWORKING` option is ON (it is **OFF** for the WASM build), and
  unavailable in a browser regardless (no UDP / SDL_net).

Every player command already flows through `OutList` → transport → `DoList` → `Queue_AI`
with a fixed command latency so all machines execute a given command on the same frame.
The only missing piece for the browser is the **transport**.

### Work items

1. **ComradeConnManager (new, `engines/adapters/td-ra/comrade_net.cpp`).**
   Implement the connection-manager surface the TD multiplayer loop calls
   (`Send_Packet`, `Get_Packet`, `Num_Connections`, global-channel send/receive,
   timing/queue accessors) against a browser WebSocket via `EM_ASM`. Outgoing packets
   are handed to JS and sent on the room socket; incoming packets are buffered in JS
   and drained here. Model its queue/timing semantics on `IPXManagerClass` so the
   existing `Queue_AI` sync (`ProcessTimer`, command-latency, `Wait_For_Players`-style
   gating) works unchanged.

2. **Build wiring.** Add a WASM-only CMake path that compiles the multiplayer loop and
   the new manager while keeping UDP/IPX out. Either define `NETWORKING` for WASM with
   `ipxmgr`/`ipxgconn` replaced by `comrade_net.cpp`, or factor a thin
   `ConnManClass` interface the native IPX manager and the new WS manager both satisfy.

3. **Multiplayer boot.** Replace the single-house `GAME_NORMAL` COMRADE auto-start
   (the `init.cpp` patch in `tools/build-engine.py`) with a multiplayer game mode
   (`GAME_IPX`/skirmish-network) when the lobby signals a networked match: assign
   `MULTI1..MULTI4` houses to the lobby's players, seed the shared scenario and the
   shared random seed, and run the sync handshake before frame 0.

4. **Scenarios.** Author `COMRADE.INI` variants with `MULTI1..MULTI4` start waypoints
   (the map roster already parameterises base positions in `tools/create-map.py`).

5. **Service relay (`apps/service`).** Add a per-room packet relay: forward each
   client's lockstep packets to the other room members, preserving order, with the
   existing rate/size caps. This is a thin broadcast — the lockstep logic stays in the
   engine. `PlayerOrder` in `packages/contracts` already models the command payload.

6. **Verification.** Export a per-frame state checksum from the bridge (sum over
   object cells + strengths + house credits). Two clients must report identical
   checksums every frame; a mismatch is a desync. Add a two-headless-client CI check
   that plays a scripted command sequence and asserts checksum equality, plus
   first-divergence logging (the `tests/parity` harness is the home for this).

### Risks

- **Determinism under WASM/Emscripten.** TD's sim is integer/deterministic by design,
  but the Emscripten build must avoid host-time or float nondeterminism in the sim
  path. The checksum harness is how we prove it before shipping.
- **Latency model.** A fixed 2–3 frame command latency over WebSocket is the starting
  point; adaptive latency and a pause-and-resync path for stalls come after basic sync.

## Status today
The lobby coordinates presence and configuration and starts all clients into the same
configured scenario (each an independent local sim). The `welcome` message advertises
`gameplay: 'lobby-presence'` so nothing claims shared play. This ADR is the plan to
turn that into true synchronized multiplayer; none of the work items above are
implemented yet.
