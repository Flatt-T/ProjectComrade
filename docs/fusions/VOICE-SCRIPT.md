# Voice script: Irregular Warfare and Holdouts

The Fusion Engine has no voices of its own. Every spoken line in the game today is freeware
Westwood audio out of the Tiberian Dawn and Red Alert banks, and a faction is given character
by which of those replies it draws on and how fast it says them — see `VOICES` and
`UNIT_VOICES` in [`packages/fusion/src/audio.ts`](../../packages/fusion/src/audio.ts).

This file is the script those stand-ins stand in for: what each faction would say if the
project had voices of its own. Record it, or run it through a text-to-speech service, and the
lines drop into a new bank keyed by the same reply names.

Before adding any recorded or generated audio, add a `rights/ledger.jsonl` entry for it.
`tests/unit/rights-validation.test.ts` enforces that every asset has provenance, a licence and
a distribution class, and generated speech carries its own terms about commercial use and
voice likeness. A TTS service's output is not automatically yours to ship.

## How the lines map

Each unit answers twice: **select** (you clicked it) and **order** (you told it to do
something). Write four takes of each line so the game can vary them; the engine looks for
`NAME`, `NAME.V00`, `NAME.V01`, `NAME.V02` and `NAME.V03`.

Keep them short. A reply that runs past about a second and a half steps on the next one.

---

# Irregular Warfare

The four forces are told apart by **radio discipline**, not by accent — that is the real
audible difference between a militia and a professional army, and it reads instantly in play.
Cast them all as native speakers of the same language; what changes is procedure, not origin.

Nobody in this pack is cast to sound like a real nationality, ethnicity or religious group.
The factions are invented and must stay that way: the moment a voice tells you which real
group a faction "really" is, the invented name has stopped doing its job.

## Valley Cadres — no procedure at all

No call signs, no brevity codes, no net discipline. Recorded close to the microphone, a little
too loud, with someone else audible in the background. They sound like people, not soldiers.

| Line | Delivery |
| --- | --- |
| "Yeah?" | Flat, mid-chew |
| "Who's asking?" | Not hostile, just genuinely asking |
| "I'm here, I'm here." | Slightly out of breath |
| "Go on then." | Resigned |
| "We're moving." | Already walking away from the mic |
| "Tell him we're moving." | To someone else in the room |
| "On our way up." | Wind noise |
| "Yeah, alright." | The most common answer to any order |

**Mortar Crew** — "Tube's up." / "Say again the grid?" / "Dropping."
**Sapper** — "Charge is set." / "Clear back." / "Thirty seconds."
**Quadcopter Team** — quiet, close, far too pleased with itself: "She's up." / "Got eyes." /
"Hold still." A small rotor whine under every line.

## Coastal Syndicate — a commercial maritime net

Channel discipline, but it is a business, not an army. Call-and-response, procedural, bored.
Think harbour traffic rather than a command net.

| Line | Delivery |
| --- | --- |
| "Station calling, go ahead." | By the book, uninterested |
| "Receiving you." | |
| "What's the cargo?" | The only question that matters |
| "Understood, under way." | |
| "That's a long way out." | Mild complaint, complies anyway |
| "We'll want paying for that." | Deadpan |
| "Running now." | |

**Smuggler** — almost whispered: "Quietly." / "Nobody saw me." / "I know a way."
**Gun Skiff** — outboard motor under everything: "Skiff's away." / "Coming round."
**Armed Trawler** — "Nets are in." / "Bringing her about."

## Northern Vanguard — doctrinaire and over-formal

Correct to the point of stiffness, like a manual translated slightly too literally. Full
pro-words where a word would do. They are proud of the procedure because the procedure is new.

| Line | Delivery |
| --- | --- |
| "Unit reporting." | Formal, upright |
| "Awaiting instruction." | |
| "Section ready." | |
| "Order received and understood." | All five words, every time |
| "Executing as instructed." | |
| "Moving to the position given." | |
| "It will be done." | Flat conviction |

**ATGM Team** — "Launcher is prepared." / "Target is observed." / "Firing."
**MANPAD Team** — "Air watch, reporting." / "Tracking." / "Engaging aircraft."
**Strike Drone** — no voice. A ground controller reads it out instead, over a speaker:
"Platform is airborne." / "Running in."

## Mandate Force — NATO brevity through a headset

Clipped, compressed, filtered. Big-town American, the register the genre has used since 1995.
Every line sounds like it is costing someone money, because it is.

| Line | Delivery |
| --- | --- |
| "Send it." | Headset-close, no warmth |
| "Go for lead." | |
| "Standing by." | |
| "Solid copy." | |
| "Moving, out." | |
| "Tasking acknowledged." | |
| "On it." | |
| "Wilco." | |

**Marksman** — "Set." / "I have the angle." / "Sending."
**Pioneer** — "Breach team." / "Charge is on." / "Stand clear."
**Attack Helicopter** — rotor wash and intercom hiss: "Gun is hot." / "Inbound, thirty
seconds." / "Off target."

---

# Holdouts

Now the funny one. Play it absolutely straight — none of these people think they are a joke,
and that is the joke. British, regional, recorded dry and close.

## The Compound — twelve years of preparation, no plan

Slow, certain, deeply pleased to finally be needed. Every line delivered with the confidence
of a man who has read one book twice.

| Line | Delivery |
| --- | --- |
| "Been ready for this." | Quiet satisfaction |
| "Twelve years, this." | To nobody |
| "Told you." | He did tell you |
| "Right you are." | |
| "On it." | Not on it yet |
| "Bringing the good tins." | Deadly serious |
| "Mind the wire." | |
| "That's what the wire's for." | Explaining the wire again |

**Crossbow Enthusiast** — says "Silent, me" far too loudly. Also: "Bolt's nocked." / "Won't
hear a thing." / "Didn't even know I was there."
**Gate Warden** — "Nobody comes through." / "Not on the list." / "Is he on the list?"
**Egg Drone Crew** — "Drone's up." / "Battery's at forty." / "Eggs away." / "That's the last
of the free range."
**Plough Bus** — diesel rattle: "She's taxed. Probably." / "Mind the step."
**Gas Bottle Wagon** — far too cheerful: "All aboard!" Then nothing, ever again.

## Pelican Point Residents' Association — the law is whatever was minuted

Brisk, clipped, impeccably polite and completely immovable. Never shouts. The threat is
always procedural.

| Line | Delivery |
| --- | --- |
| "Yes, hello." | Not a greeting |
| "I did write to you about this." | She did |
| "Speaking." | |
| "I'll be raising this." | |
| "Noted." | It is not noted favourably |
| "That's going in the minutes." | The real threat |
| "Well, I'm going anyway." | |
| "This is exactly what I meant." | Vindicated |

**Leaf-Blower Brigade** — two-stroke engine under everything: "Blower's charged!" / "Onto the
verge!" / "It'll blow back, you know."
**Bylaw Enforcement Officer** — flat, bored, unbothered: "Enforcement." / "Afternoon." /
"Serving notice." / "That's a breach, that is." / "He's had his warning."
**Strimmer Team** — "Edges." / "It's over the line." / "By a good inch."
**Chair of the Committee** — never raises her voice, never hurries, always wins: "Chair
speaking." / "Do go on." / "Motion carried." / "All those in favour." / "I'll take that as a
yes." / "You'll find that's within my remit."
**Ride-On Mower** — engine rev, then, with enormous pride: "She's got a cup holder."

## Gull Reach — a protection racket with a slipway

Rough, slow, salt-damaged, entirely unbothered. Everything is negotiable and nothing is free.

| Line | Delivery |
| --- | --- |
| "Aye." | |
| "What's in it for us?" | First question, every time |
| "Hm." | Agreement, technically |
| "If you like." | |
| "That'll cost you." | |
| "We'll have a look." | They will take it |
| "Tide's with us." | |

**Boarding Party** — grapple and rope under the lines: "Grapple's ready." / "We'll be having
that." / "It's ours now." / "Mind the paint."
**Navigator** — "I know these waters." / "There's a channel." / "Trust me."
**Gull-Cam Crew** — seagulls, constantly, drowning them out: "Bird's up." / "Can't hear a—" /
"GET OFF."
**The Mothership** — one labouring engine: "She'll start. Eventually." / "One engine's
plenty." / "Don't rush her."

## Vantage Risk Group — hired by a client they will not name

Immaculate, corporate, billing by the quarter hour. Everything is in scope or it is a
variation. Warm telephone manner, no warmth at all.

| Line | Delivery |
| --- | --- |
| "Vantage, go ahead." | Call-centre bright |
| "Operator standing by." | |
| "How can I help?" | He cannot |
| "Copy, tasking accepted." | |
| "That's chargeable." | Said pleasantly |
| "Raising a work order." | |
| "Within scope." | Relieved |
| "That's a variation." | Delighted |

**Team Lead** — "Team lead." / "I'll need that confirmed." / "Proceeding."
**Client Liaison** — "I'll need that in writing." / "Let me check the contract." / "That's not
what we agreed."
**Breaching Specialist** — "Entry team, ready." / "Door's coming off." / "That door was
chargeable."
**Escort Gunship** — rotor and radio compression: "Airframe is on the clock." / "Overhead."
**Observation Platform** — synthesised, flat: "Platform on station." / "Recording."

---

## Recording notes

- **Mono, 22,050 Hz** matches the existing bank and keeps the download small. The engine
  resamples anything else, so higher rates only cost bandwidth.
- **Close and dry.** No reverb. The game adds its own space; a wet take fights it.
- **Peak around -6 dBFS**, no limiting. Replies are mixed on the `voice` gain node against
  effects, and a hot take will duck the whole battlefield.
- **Four takes per line**, deliberately varied in delivery. Repetition is what makes RTS unit
  chatter grating, and four is the number the engine looks for.
- **Leave the handles alone.** Name the files after the reply they replace (`ACKNO.V00` and so
  on) and the existing table picks them up with no code change.
