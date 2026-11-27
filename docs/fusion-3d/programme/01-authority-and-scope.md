# Fusion 3D programme mandate and scope

Owner instruction: Andrew Taylor, 18 November 2026. Planning baseline: `Flatt-T/ProjectComrade` at `84f411478f01ed62365a2e4d1d316eb57d9e193c`. This programme upgrades Fusion into a complete, visually coherent, fully animated 3D homage covering the released Command & Conquer series. Every faction's buildings and units, the meaningful variants of those entities, destructible and rebuildable bridges, and the series' terrain families must have an explicit disposition and implementation path. A small demonstration is an early quality gate; it is not the final scope.

## What the player must experience

Armies must feel different because their movement, weapons, economy, construction, abilities, information, and tactical choices differ. A faction is not complete when a generic tank has a different name and colour. Buildings need readable production and damage states. Infantry move and fight as animated characters; tracked, wheeled, walking, flying and naval units visibly behave as their classes require. Terrain creates operational choices through elevation, cover where the rules define it, choke points, resource locations, approach routes, water, bridges and destructible infrastructure. The camera shows a real 3D world, with live geometry, lighting and animation, while keeping strategic readability on desktop and mobile.

## Three separate rules contracts

| Contract | Binding purpose | Change rule |
| --- | --- | --- |
| Classic compatibility | Existing selected TD, RA1 and Dune 2000 fidelity targets, with Classic RA2 under its existing separate gate | Keep original version-specific simulation and presentation promises. New Fusion graphics do not establish Classic fidelity or authorize a native-engine replacement. |
| Fusion homage | New coherent cross-era RTS using versioned, authored rules and full 3D presentation | Preserve each source identity and document every deliberate translation, omission, normalization or balance change. New factions and mechanics are built here. |
| Persistent Fusion world | Existing durable world, ownership, economy, alliances, protection, transport and regional authority | Extend through compatible schemas and approved migrations. Keep the same players and assets. A new renderer cannot reset the world or silently change saved rules. |

Frozen **legacy Fusion** profiles are compatibility versions used by existing Fusion skirmishes and persistent saves. They are distinct from native Classic adapters and from the new homage profile. A renderer upgrade may display a legacy profile, but cannot silently replace its numerical rules or saved content identity with the new cross-era rules.

The September direction to preserve native projection remains applicable to Classic. Andrew's 18 November request supersedes that restriction for Fusion. It also expands Fusion beyond the earlier supported pack list. Preserve existing Fusion custom packs and Dune-related content as compatibility content; do not describe Dune or unrelated homage packs as Command & Conquer titles.

## Scope of research and delivery

Research covers original C&C/Tiberian Dawn and The Covert Operations; Red Alert and its Counterstrike/Aftermath expansions; Tiberian Sun/Firestorm; Red Alert 2/Yuri's Revenge; Renegade; Generals/Zero Hour; C&C 3/Kane's Wrath; Red Alert 3/Uprising; C&C 4; Remastered; Sole Survivor; released browser/mobile interpretations and their verified updates. Record platform-exclusive missions, campaign-only entities, civilians, neutral structures, summons, transformations, deployable forms, upgrades, support powers and faction/country/general variants. Record cancelled games and prototypes as historical research with no invented playable catalogue. The research specialist's era matrix fixes the title/version denominator and exposes any unresolved source gaps.

The delivery obligation includes all verified buildings and units relevant to this content programme, with an explicit rule for campaign-only and non-RTS material. Original campaigns, actors, dialogue, cinematics, mission scripts, a Renegade FPS mode and every historical game mode are not implicitly promised by a request for all factions' units/buildings/terrain. Their source-exclusive content remains inventoried. A proposed exclusion from content needs an explicit owner decision; a worker may not silently omit it because it is difficult. Balance availability, campaign availability and whether an entity exists are different fields.

## Source identity and homage identity

Use immutable `sourceGame/sourceVersion/sourceFaction/sourceEntityId` identities in the research ledger. Keep a separate `fusionDefinitionId`, approved display name, art identity, capability set and licensing/provenance record. The same tank name across eras does not imply the same entity. An upgraded or transformed state must record whether it shares a runtime entity and how state transitions work. Cross-faction ownership is not the same as access to another faction's production technology.

## Authority order and conflict handling

1. Apply current user instructions and explicit later owner decisions.
2. Apply this programme's scope and accepted decision register for the new Fusion work.
3. Apply current mode-specific gameplay contracts, especially the 13 November Engineer/shield amendment and COMRADE 18–20A, except where explicitly superseded for this upgrade.
4. Apply the task's accepted contracts, linked reference build, current repository ADRs and evidence.
5. Treat code, issue status, old assistant statements, community explanations and a video as evidence to inspect; none can silently replace a binding requirement.

If two sources conflict, open a decision record containing both passages, versions, affected tasks, proposed resolution and the narrow work that can continue. Do not change a requirement to make a failing test pass. Do not re-ask Andrew about facts already decided in the conversation or project records. Routine reversible implementation choices remain delegated to the responsible specialist. Mark genuinely new gameplay defaults as proposed until the relevant design gate accepts them.

## Existing persistent rules that must survive

Retain fixed player faction selection and approved mixed-force acquisition; exact stable entity ownership through barter, packing, carrier transport and recovery; deliberate offline shields and their existing eligibility/stacking rules; protection of allies already inside, no entry/re-entry while the applicable shield is active; explicit one-use current-owner consent for allied Engineer capture; eligible hostile capture only when protection permits it; protected newcomer/recovery MCV and existing end conditions; no allied base building rights or transfer of a whole base by implication; existing sell-all recovery and asset binding; regional journals, fencing, idempotence, content fingerprints, save/resume, replay and crash recovery. Exact current amendments and exceptions are read from COMRADE 18/19 and the implementing tickets before changes.

## Rights and distribution are part of the content contract

EA's official source releases are useful research inputs. Code licences, art/audio/map permissions, brand use and public commercial distribution are separate decisions. EA's published community mod policy has commercial restrictions. Existing ads/payment functions therefore need a concrete compatibility decision before a C&C-derived public release. Original 3D modelling by itself does not settle permission for copied designs or branding. Continue engine, generic tools, original test assets and properly permitted research while a particular asset or product route is unresolved. Record the exact licence/permission and distribution route per shipped component; do not treat a GitHub repository, purchase of a game or the word homage as blanket clearance.

Sources: [EA source release announcement](https://www.ea.com/games/command-and-conquer/news/steam-workshop-support), [EA modding guidelines](https://www.ea.com/games/command-and-conquer/news/modding-faq), [current project contract](https://linear.app/thunderchild-creative/project/project-comrade-browser-rts-classics-5a03f7da47c3), [COMRADE 19](https://linear.app/thunderchild-creative/document/comrade-19-persistent-world-review-resolutions-acceptance-tests-and-ai-680e18701e45).

## Meaning of completion

A named model, catalogue row, green unit suite, screenshot or merged PR is partial evidence. A content row closes only with source reconciliation, implemented behaviour, required real-time 3D model and animations, terrain/visibility/ownership interactions, provenance, performance and independent review on the candidate build. A title closes only when its whole approved denominator reconciles. The programme closes only when all mandatory titles, terrain and shared systems pass, including migration and playable multiplayer journeys. This is an evidence-controlled process; no prompt can guarantee an AI's absolute accuracy.
