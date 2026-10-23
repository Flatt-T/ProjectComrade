# ADR 007 — Lobby flow, map roster, game-style roster and the path to synchronized multiplayer

Status: Accepted (lobby + maps shipped; RA/Dune and synchronized play planned)
Date: 2026-10-23
Supersedes parts of ADR 006 (single authored map, briefing-only front end)

## Context

ADR 006 delivered a single-player Tiberian Dawn slice: real Vanilla Conquer compiled
to WebAssembly, a C-ABI order bridge, bundled hash-pinned freeware content and one
authored map. The product brief additionally asks for registration-free lobbies,
shareable game links, public/invite-only rooms, map/side/player-count/settings
selection, multiple game styles (Classic C&C, Red Alert, Dune), and multiplayer.

This ADR records what is now shipped and the concrete, honest plan for the rest.

## Decision — shipped in this change

### 1. Registration-free lobby front end
`apps/web` is now a two-view app: a **war room** and the **battlefield**.

- Callsign entry (no account), persisted in `localStorage`.
- Live **public games** list over the existing WebSocket (`/ws`); rooms broadcast as
  `rooms` summaries whenever membership or options change.
- **Create game** (random `word-nnnn` code) or **join by code**.
- **Shareable invite link** `…/?room=CODE`; opening it pre-fills the join code.
- In-room **host configuration**: game style, battlefield, visibility
  (public/invite-only), max players (2–4), starting credits, tech level.
- Per-player **side selection** (GDI/Nod) and **ready-up**; the host starts the match.
- On start, every client in the room launches the configured scenario.

The room coordinator (`apps/service/src/rooms.ts`) now owns room options, host-only
configuration, a public-room listing, faction changes and a working `start`
transition. Contracts (`packages/contracts`) gained `RoomOptions`, `MatchSettings`,
`GameStyle`/`STYLES`, `MapInfo`, `RoomSummary` and their validators.

### 2. Map roster
`tools/create-map.py` now authors four symmetric battlefields
(Tiberium Crossing, Canyon Clash, Tiberium Isles, Desert Standoff) across temperate,
winter and desert theatres, each with its base-centred home waypoint so the camera
opens on the player's base. `tools/pack-maps.py` copies the INI/BIN pairs into the
content pack and regenerates `manifest.json` with a `maps` registry and fresh hashes.

The client mounts the **chosen** map's INI/BIN as the active `COMRADE.INI`/`COMRADE.BIN`
and applies the faction swap and the economy/tech settings to the INI before mount —
the same mechanism ADR 006 used for the Nod faction swap, generalized.

### 3. Game-style roster
`STYLES` declares Classic C&C (playable), Red Alert (engine built, content pending)
and Red Alert 2 / Dune (planned). Only playable styles are offered to the host; the
rest are declared so the roster is visible and extendable, per the brief's "ability to
add more easily".

## Honest status of the two large remaining items

### Synchronized multiplayer — NOT yet real
Today the lobby is **presence + configuration**: players share a room, pick sides and
all drop into the configured scenario, but each runs an **independent local
simulation**. There is no shared game state. The `welcome` message advertises
`gameplay: 'lobby-presence'` precisely so clients do not claim otherwise.

Making matches genuinely shared requires **deterministic lockstep**, which is a
multi-week effort, not a one-day task:

1. **Determinism audit of Vanilla Conquer under WASM.** Confirm the TD simulation is
   bit-deterministic given identical seed + ordered command stream (no wall-clock, no
   `rand()` outside the game RNG, no float divergence across clients). Add a headless
   frame-hash export to the bridge for divergence detection.
2. **Command-only networking.** Players exchange `PlayerOrder`s (the contract already
   exists), never state. Orders are stamped with an execution tick and relayed by the
   service to every peer in the room.
3. **Lockstep scheduler.** A fixed command-latency window (e.g. execute tick N's orders
   at N+2): no client advances a tick until all peers' orders for it have arrived.
   Bridge gains `comrade_schedule_tick(orders)` / `comrade_step()` so the host page,
   not `Main_Loop`'s own timer, drives simulation advance.
4. **Multi-house scenarios.** Author MULTI1..MULTI4 start locations and boot the engine
   into `GAME_GLYPHX_MULTIPLAYER`/network mode rather than the single-house
   `GAME_NORMAL` COMRADE boot patched in `tools/build-engine.py`.
5. **Resync & recovery.** Divergence → pause, request a full state snapshot from the
   host, rehydrate. Drop/rejoin handling. Replay capture from the command log.

The service transport (`/ws`, rate-limited, capacity-bounded) and the `PlayerOrder`
contract are the foundation these build on.

### Red Alert and Dune styles — engine built, not yet playable
`vanillara.wasm` is compiled and served, but to make RA playable needs, in order:
1. A hash-pinned **RA freeware content pack** (equivalent to the TD OpenRA/CnCNet pack)
   and an RA `manifest.json`, added to `tools/prepare-content.py`.
2. An **RA scenario-boot patch** in `tools/build-engine.py` mirroring the TD
   `COMRADE.INI` auto-start, plus an RA build of `comrade_bridge.cpp` (the current
   bridge is in `tiberiandawn/` and uses TD types).
3. At least one authored RA skirmish map and RA entries in `STYLES`/the pack.

Dune 2000 and RA2 require separate gated engines (no GPL upstream equivalent is
vendored) and remain out of scope until those are sourced.

### HD sprites — out of scope
The product renders the authentic 640×400 framebuffer scaled 2×. Redrawn HD artwork is
a large, separate art pipeline, not an engine change.

## Consequences
- The brief's registration-free lobby, link sharing, room options, side selection and a
  real map roster are delivered and verified in-browser.
- The platform is honest about what "multiplayer" means today and has a concrete,
  staged plan to reach synchronized play.
- Adding a game style is a declarative change to `STYLES` plus its content/bridge work;
  adding a map is a `create-map.py` entry plus `pack-maps.py`.
