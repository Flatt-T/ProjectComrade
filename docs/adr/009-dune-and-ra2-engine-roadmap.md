# ADR 009 — Dune 2000 and Red Alert 2 engine roadmap

Status: Superseded by ADR 010 — the owner chose independent gameplay replication on the Comrade Fusion Engine instead of porting separate engines
Date: 2026-10-23

## Context

The product brief asks for a "Dune Style" option and Red Alert 2 alongside Classic C&C
and Red Alert. The current platform vendors only **Vanilla Conquer**, which contains
Tiberian Dawn and Red Alert. There is **no Dune or RA2 engine in this repository**, so
these are not a matter of wiring up existing code — each needs a separate engine sourced
and WASM-ported. This ADR records the realistic path so the roster claims stay honest.

## Red Alert (nearest term — separate ADR-007 item)
RA shares the Vanilla Conquer engine, already compiled to `vanillara.wasm` and served.
Making it playable needs an RA freeware content pack (the mirror at
`openra.ppmsite.com/ra-packages.zip` responds), an RA `comrade_bridge`, an RA
scenario-boot patch and an authored RA map. Tracked in ADR 007; not covered further here.

## Dune 2000

Dune 2000 (Westwood, 1998) has **no official source release**. Options, best first:

1. **OpenRA D2K mod (recommended).** OpenRA ships a Dune 2000 mod (GPLv3, C#/.NET). It
   is a different engine and language from Vanilla Conquer and does not compile to WASM
   as-is; a browser port means either a Blazor/WASM .NET build of the relevant subset or
   a reimplementation of its simulation against this project's bridge contract. Large,
   but the game rules and the content pipeline (CnCNet freeware D2K content) are known
   and legally distributable.
2. **gruntmods / D2K+ engine reimplementations.** Community engines exist but licensing
   and WASM suitability vary; each needs its own rights review against
   `rights/ledger.jsonl` before vendoring.

Either way Dune 2000 is a **new engine integration**, not a content/skin change: its own
vendored source + provenance, its own adapter implementing the same C-ABI surface as
`comrade_bridge` (snapshot + order injection), its own content pack and maps, and its own
WASM build target in `tools/build-engine.py`.

## Red Alert 2

Red Alert 2 (Westwood, 2000) runs on the **Westwood RA2/YR engine, which has no source
release and no mature open reimplementation** comparable to Vanilla Conquer. It is **not
freeware**. There is therefore no lawful path to a browser port of RA2 from vendored
source today. The nearest adjacent, legally clean target would be an open RA2-style mod
on an open engine (e.g. an OpenRA-based total conversion), which is a reimagining, not
original RA2. RA2 should remain **declared but gated** in the style roster (`STYLES` in
`packages/contracts`, `playable: false`) until such a base exists and passes rights
review.

## Shared requirements for adding any engine

1. Vendor the engine source under `engines/vendor/` with a provenance/rights entry in
   `rights/ledger.jsonl`.
2. Add a build target to `tools/build-engine.py` producing a WASM module that exports
   `FS`, `callMain`, and the `comrade_*` bridge functions.
3. Write an adapter implementing the bridge contract: a `*_snapshot()` JSON exporter and
   a `*_order(...)` injector, mirroring `engines/adapters/td-ra/comrade_bridge.cpp`.
4. Add a content pack + manifest and at least one authored map, hash-pinned like the TD
   pack, with a rights entry.
5. Mark the style `playable: true` in `STYLES` and extend the engine selection in
   `packages/client-runtime/src/engine.ts`.

## Decision
Keep Dune 2000 and RA2 declared in the roster but `playable: false`. Pursue Dune 2000 via
the OpenRA D2K route when engine-porting capacity exists; keep RA2 gated pending a
lawful open base. Neither is achievable as a content/skin change on the current engine.
