// Spoken unit replies, synthesised by the browser.
//
// The bank gives us Westwood's voices, which say Westwood's words. These packs
// want their own, and recording a hundred and forty units is not a thing this
// project can ship. So the lines live here as text and the browser speaks them:
// no asset to download, no licence to track, and every unit says something that
// is actually about itself.
//
// `docs/fusions/VOICE-SCRIPT.md` is the same casting written for a human to
// read. If real recordings ever arrive they replace this at `reply()` and the
// text stays as the script.

/** How a faction sounds. Rates and pitches are the Web Speech ranges, not playbackRate. */
export interface SpokenVoice {
  /** Preferred browser voices, best first; matched loosely against the voice name. */
  prefer?: string[];
  /** BCP-47 tag used to pick a voice when none of `prefer` is installed. */
  lang: string;
  /** 0 to 2; 1 is the voice's own pitch. */
  pitch: number;
  /** 0.1 to 10; 1 is the voice's own speed. */
  rate: number;
}

/** What a unit says when you click it, and when you give it an order. */
export interface SpokenLines { select: string[]; order: string[] }

// Voice names as the common platforms actually ship them: Windows (Microsoft
// George/Hazel/Susan, and the newer Ryan/Sonia/Libby), macOS (Daniel/Serena/
// Kate/Samantha/Alex) and Chrome's own bundled pair. A faction asks for a
// register rather than one voice, because almost no machine has all of these.
const GB_MALE = ['Microsoft George', 'Microsoft Ryan', 'Daniel', 'Oliver', 'Google UK English Male'];
const GB_FEMALE = ['Microsoft Hazel', 'Microsoft Sonia', 'Microsoft Libby', 'Serena', 'Kate', 'Google UK English Female'];
const GB_FEMALE_ALT = ['Microsoft Susan', 'Microsoft Libby', 'Kate', 'Serena', 'Microsoft Hazel'];
const US_ANY = ['Microsoft Aria', 'Microsoft Guy', 'Google US English', 'Samantha', 'Alex', 'Microsoft Zira', 'Microsoft David'];

/**
 * A faction's register, keyed `pack:factionOrSide`.
 *
 * Irregular Warfare is told apart by radio discipline, not by origin: all four
 * forces are cast in one locale and differ in how fast and how formally they
 * speak. Mandate Force is the exception the genre has used since 1995.
 */
export const SPEECH_VOICES: Record<string, SpokenVoice> = {
  // --- Irregular Warfare: one locale, four levels of procedure.
  'irregular:cadres': { lang: 'en-GB', prefer: GB_MALE, pitch: 1, rate: 0.95 },
  'irregular:coastal': { lang: 'en-GB', prefer: GB_FEMALE_ALT, pitch: 0.95, rate: 1.05 },
  'irregular:vanguard': { lang: 'en-GB', prefer: GB_MALE, pitch: 1.15, rate: 0.85 },
  'irregular:mandate': { lang: 'en-US', prefer: US_ANY, pitch: 0.85, rate: 1.2 },
  // --- Holdouts: British, regional, played absolutely straight.
  'holdout:preppers': { lang: 'en-GB', prefer: GB_MALE, pitch: 0.9, rate: 0.85 },
  'holdout:hoa': { lang: 'en-GB', prefer: GB_FEMALE, pitch: 1.3, rate: 1.15 },
  'holdout:pirates': { lang: 'en-GB', prefer: GB_MALE, pitch: 0.65, rate: 0.8 },
  'holdout:vantage': { lang: 'en-GB', prefer: GB_FEMALE_ALT, pitch: 1.05, rate: 1.1 },
};

/**
 * Lines keyed `pack:faction` (the faction's fallback, used by anything without
 * its own entry) and `pack:unit` (that unit's own). A unit's entry wins.
 */
export const SPEECH_LINES: Record<string, SpokenLines> = {
  // ================================================== Irregular Warfare

  // --- Valley Cadres: no call signs, no brevity, no net discipline at all.
  'irregular:cadres': {
    select: ['Yeah?', "Who's asking?", "I'm here, I'm here.", 'What?'],
    order: ['Go on then.', "We're moving.", 'Yeah, alright.', 'On our way up.'],
  },
  'irregular:fighter': { select: ['Rifle up.', "I'm about."], order: ['Heading over.', 'Yeah, alright.'] },
  'irregular:gunner': { select: ['Gun team.', 'Belt is on.'], order: ['Setting up there.', 'Give us a minute.'] },
  'irregular:rpgteam': { select: ['Launcher.', 'Tube on the shoulder.'], order: ['Getting closer first.', 'Need it nearer than that.'] },
  'irregular:mortarteam': { select: ["Tube's up.", 'Say again the grid?'], order: ['Dropping.', 'Rounds on the way.'] },
  'irregular:sapper': { select: ['Charge is set.', 'Clear back.'], order: ['Thirty seconds.', 'Digging it in.'] },
  'irregular:charger': { select: ["I'm carrying it.", 'Careful.'], order: ['Going in.', "Don't follow me."] },
  'irregular:quadteam': { select: ["She's up.", 'Got eyes.'], order: ['Hold still.', 'Coming overhead.'] },
  'irregular:pickup': { select: ['Pickup.', 'Gun in the back.'], order: ['Going round.', 'Hold on.'] },
  'irregular:gunwagon': { select: ['Recoilless.', 'Wagon here.'], order: ['Bracing it first.', 'Lining up.'] },
  'irregular:bus': { select: ['Bus is loaded.', 'Everyone on?'], order: ['Driving on.', 'Mind the plate.'] },
  'irregular:chargetruck': { select: ['Loaded.', 'Very loaded.'], order: ['Driving it in.', 'Clear the road.'] },

  // --- Coastal Syndicate: a commercial maritime net. Procedural, bored, paid.
  'irregular:coastal': {
    select: ['Station calling, go ahead.', 'Receiving you.', "What's the cargo?"],
    order: ['Understood, under way.', "We'll want paying for that.", 'Running now.', "That's a long way out."],
  },
  'irregular:crew': { select: ['Crew.', 'On deck.'], order: ['Moving across.', 'Understood.'] },
  'irregular:smuggler': { select: ['Quietly.', 'Nobody saw me.'], order: ['I know a way.', 'Round the back.'] },
  'irregular:quadbought': { select: ['Off the shelf, this.', 'Airborne.'], order: ['Overhead shortly.', 'Battery is fine.'] },
  'irregular:technical': { select: ['Twin gun.', 'Both barrels up.'], order: ['Rolling.', 'Give us the road.'] },
  'irregular:surveydrone': { select: ['Survey platform, airborne.', 'Camera is running.'], order: ['Tracking out.', 'Orbit set.'] },
  'irregular:skiff': { select: ["Skiff's away.", 'Outboard is warm.'], order: ['Coming round.', 'Running in.'] },
  'irregular:dhow': { select: ['Hold is empty.', 'Ready to load.'], order: ['Making way.', 'Slow, but moving.'] },
  'irregular:trawler': { select: ['Nets are in.', 'Trawler, go ahead.'], order: ['Bringing her about.', 'Steady on.'] },

  // --- Northern Vanguard: correct to the point of stiffness. New procedure, worn proudly.
  'irregular:vanguard': {
    select: ['Unit reporting.', 'Awaiting instruction.', 'Section ready.'],
    order: ['Order received and understood.', 'Executing as instructed.', 'Moving to the position given.', 'It will be done.'],
  },
  'irregular:regular': { select: ['Rifleman, reporting.', 'In position.'], order: ['Advancing as ordered.', 'Understood.'] },
  'irregular:atgmteam': { select: ['Launcher is prepared.', 'Target is observed.'], order: ['Firing.', 'Repositioning the launcher.'] },
  'irregular:manpadteam': { select: ['Air watch, reporting.', 'Tracking.'], order: ['Engaging aircraft.', 'Moving the air watch.'] },
  'irregular:raider': { select: ['Assault section.', 'Selected and ready.'], order: ['We will take it.', 'Moving to assault.'] },
  'irregular:quadmunition': { select: ['Munition is fitted.', 'Platform is armed.'], order: ['Releasing on the target.', 'Running in now.'] },
  'irregular:oldtank': { select: ['Tank crew, reporting.', 'Older, but serviceable.'], order: ['Advancing.', 'Turret is coming round.'] },
  'irregular:carrier': { select: ['Carrier, ready.', 'Section is aboard.'], order: ['Moving the section.', 'Ramp will be down.'] },
  'irregular:guntruck': { select: ['Air defence truck.', 'Barrels are elevated.'], order: ['Taking the new position.', 'Understood.'] },
  'irregular:rockettruck': { select: ['Rocket battery.', 'Rails are loaded.'], order: ['Firing the full rack.', 'Displacing after.'] },
  'irregular:strikedrone': { select: ['Platform is airborne.', 'Ground control, reporting.'], order: ['Running in.', 'Attacking as instructed.'] },

  // --- Mandate Force: NATO brevity through a headset, and every minute billed.
  'irregular:mandate': {
    select: ['Send it.', 'Go for lead.', 'Standing by.'],
    order: ['Solid copy.', 'Moving, out.', 'Tasking acknowledged.', 'Wilco.'],
  },
  'irregular:rifleman': { select: ['Rifleman, up.', 'Set.'], order: ['Moving.', 'Copy, moving.'] },
  'irregular:missileteam': { select: ['Anti-armour, up.', 'Missile team.'], order: ['Tube is hot.', 'Repositioning.'] },
  'irregular:marksmanteam': { select: ['Set.', 'I have the angle.'], order: ['Sending.', 'Moving to a new hide.'] },
  'irregular:pioneer': { select: ['Breach team.', 'Charge is on.'], order: ['Stand clear.', 'Moving to the breach.'] },
  'irregular:mrap': { select: ['MRAP, up.', 'Crew is set.'], order: ['Rolling.', 'Copy, rolling.'] },
  'irregular:ifv': { select: ['Fighting vehicle, up.', 'Dismounts aboard.'], order: ['Moving to drop them.', 'Copy.'] },
  'irregular:mbt': { select: ['Tank, up.', 'Gun is loaded.'], order: ['Advancing.', 'On the move.'] },
  'irregular:spg': { select: ['Guns, go ahead.', 'Battery ready.'], order: ['Fire mission accepted.', 'Rounds complete shortly.'] },
  'irregular:patroldrone': { select: ['Patrol platform, on station.', 'Sensor is good.'], order: ['Re-tasking.', 'Moving the orbit.'] },
  'irregular:gunship': { select: ['Gun is hot.', 'Overhead.'], order: ['Inbound, thirty seconds.', 'Off target.'] },
  'irregular:lift': { select: ['Lift is turning.', 'Ready for pickup.'], order: ['Inbound to the zone.', 'Copy the landing site.'] },
  'irregular:cutter': { select: ['Cutter, standing by.', 'Deck is clear.'], order: ['Making way.', 'Copy, coming about.'] },

  // --- Under the regular doctrine the Cadres have an air force. It shows.
  'irregular:conscript': { select: ['Signed up Tuesday.', 'Still learning this.'], order: ['Right, moving.', 'Which way was it?'] },
  'irregular:ironclad': { select: ['Welded her myself.', 'Plenty of plate.'], order: ['Slowly does it.', 'She goes where she goes.'] },
  'irregular:pipegun': { select: ['Pipe battery.', 'Mind the muzzle.'], order: ['Pointing it that way.', 'Takes a minute to shift.'] },
  'irregular:cropduster': { select: ['Still smells of fertiliser.', 'Duster, up.'], order: ['Coming across low.', 'One pass, that is all.'] },
  'irregular:bargebattery': { select: ['Barge battery.', 'Gun on a barge, aye.'], order: ['Under tow.', 'She will get there.'] },
  'irregular:marine': { select: ['Marine, ready.', 'Boots are wet.'], order: ['Going ashore.', 'Understood.'] },
  'irregular:quayside': { select: ['Quay ironside.', 'Plated at the yard.'], order: ['Rolling out.', 'Understood.'] },
  'irregular:harbourgun': { select: ['Harbour gun.', 'Laid and ready.'], order: ['Traversing.', 'On the new bearing.'] },
  'irregular:charterstriker': { select: ['Chartered, not owned.', 'Striker, up.'], order: ['Running in.', 'Invoice to follow.'] },
  'irregular:trawlerside': { select: ['Trawler ironside.', 'Plated over the nets.'], order: ['Making way.', 'Coming about.'] },
  'irregular:lineregular': { select: ['Line regular, reporting.', 'Dressed and ready.'], order: ['Advancing in order.', 'As instructed.'] },
  'irregular:pattern7': { select: ['Pattern Seven, reporting.', 'Crew is correct.'], order: ['Advancing.', 'Executing as instructed.'] },
  'irregular:pattern9': { select: ['Pattern Nine, howitzer.', 'Battery is laid.'], order: ['Fire mission understood.', 'Rounds will follow.'] },
  'irregular:pattern4': { select: ['Pattern Four, airborne.', 'Strike flight ready.'], order: ['Attacking as instructed.', 'Running in.'] },
  'irregular:pattern3': { select: ['Pattern Three, gunboat.', 'Standing by.'], order: ['Making way.', 'Understood.'] },
  'irregular:fusilier': { select: ['Fusilier, up.', 'Ready.'], order: ['Moving.', 'Copy that.'] },
  'irregular:lancertank': { select: ['Lancer, up.', 'Gun is loaded.'], order: ['Advancing.', 'Solid copy.'] },
  'irregular:lancergun': { select: ['Field gun ready.', 'Laid and loaded.'], order: ['Fire mission copied.', 'Shifting trails.'] },
  'irregular:lancerjet': { select: ['Lancer flight, airborne.', 'Fast mover, up.'], order: ['Running in.', 'Off target.'] },
  'irregular:lancership': { select: ['Corvette, standing by.', 'Bridge, go ahead.'], order: ['Making way.', 'Coming about.'] },

  // Base and economy units belong to no faction's character; they just work.
  'irregular:rig': { select: ['Rig is ready.', 'Where do you want it?'], order: ['Driving out.', 'Finding level ground.'] },
  'irregular:tanker': { select: ['Tanker.', 'Empty at the moment.'], order: ['Going to collect.', 'On the route.'] },
  'irregular:fixer': { select: ['Fixer.', 'What is broken?'], order: ['On my way over.', "I'll have a look."] },

  // ================================================== Holdouts

  // --- The Compound: twelve years of preparation, and no plan whatsoever.
  'holdout:preppers': {
    select: ['Been ready for this.', 'Twelve years, this.', 'Told you.'],
    order: ['Right you are.', 'On it.', 'Mind the wire.', "That's what the wire's for."],
  },
  'holdout:survivalist': { select: ['Kit is packed.', 'Been packed since Tuesday.'], order: ['Moving out.', 'Bringing the good tins.'] },
  'holdout:bowman': { select: ['Silent, me.', "Bolt's nocked."], order: ["Won't hear a thing.", "Didn't even know I was there."] },
  'holdout:shotgunner': { select: ['Nobody comes through.', 'Not on the list.'], order: ['Is he on the list?', 'Manning the other gate.'] },
  'holdout:tubeteam': { select: ['Tube crew.', 'Angle is set. Roughly.'], order: ['Dropping one.', 'Should go about there.'] },
  'holdout:eggdrone': { select: ["Drone's up.", "Battery's at forty."], order: ['Eggs away.', "That's the last of the free range."] },
  'holdout:bugout': { select: ['Bug-out truck.', 'Tank is full. Always.'], order: ['This is the drill, this.', 'Taking the back lanes.'] },
  'holdout:quadbike': { select: ['Quad bike.', 'Not road legal.'], order: ['Across the field.', 'Through the hedge.'] },
  'holdout:ploughbus': { select: ["She's taxed. Probably.", 'Mind the step.'], order: ['Ploughing on.', 'Nothing stops this.'] },
  'holdout:gaswagon': { select: ['All aboard!', 'Forty bottles back there.'], order: ['Driving on!', 'No brakes to speak of!'] },

  // --- Pelican Point: the law is whatever was minuted. Never shouts. Always wins.
  'holdout:hoa': {
    select: ['Yes, hello.', 'I did write to you about this.', 'Speaking.'],
    order: ["I'll be raising this.", 'Noted.', "That's going in the minutes.", "Well, I'm going anyway."],
  },
  'holdout:resident': { select: ['I am a resident.', 'I have concerns.'], order: ['I shall go and look.', 'This is exactly what I meant.'] },
  'holdout:blower': { select: ["Blower's charged!", 'Two-stroke, this.'], order: ['Onto the verge!', 'It will blow back, you know.'] },
  'holdout:officer': { select: ['Enforcement.', 'Afternoon.'], order: ['Serving notice.', "That's a breach, that is.", "He's had his warning."] },
  'holdout:strimmerteam': { select: ['Edges.', "It's over the line."], order: ['By a good inch.', 'Taking it back to the line.'] },
  'holdout:chair': { select: ['Chair speaking.', 'Do go on.'], order: ['Motion carried.', "I'll take that as a yes.", "You'll find that's within my remit."] },
  'holdout:noisedrone': { select: ['Decibel meter is live.', 'Recording from above.'], order: ['Measuring over there.', 'That is well over the limit.'] },
  'holdout:committeesuv': { select: ['Committee vehicle.', 'Parked considerately.'], order: ['Proceeding.', 'Indicating properly.'] },
  'holdout:mower': { select: ["She's got a cup holder.", 'Ride-on, this.'], order: ['Mowing through.', 'Stripes, mind.'] },
  'holdout:sprinklerrig': { select: ['Sprinkler rig.', 'Mains pressure.'], order: ['Watering that way.', 'Hosepipe ban does not apply.'] },

  // --- Gull Reach: a protection racket with a slipway. Everything is negotiable.
  'holdout:pirates': {
    select: ['Aye.', "What's in it for us?", 'Hm.'],
    order: ['If you like.', "That'll cost you.", "We'll have a look.", "Tide's with us."],
  },
  'holdout:deckhand': { select: ['Deckhand.', 'Aye.'], order: ['Going over.', 'If you like.'] },
  'holdout:boarder': { select: ["Grapple's ready.", "We'll be having that."], order: ["It's ours now.", 'Mind the paint.'] },
  'holdout:navigator': { select: ['I know these waters.', "There's a channel."], order: ['Trust me.', 'Shorter way round.'] },
  'holdout:gullcam': { select: ["Bird's up.", "Can't hear a—"], order: ['GET OFF.', 'Eyes on. Mostly.'] },
  'holdout:flatbed': { select: ['Flatbed.', 'Room on the back.'], order: ['Rolling.', 'Strapped down. Loosely.'] },
  'holdout:harpoontruck': { select: ['Harpoon truck.', 'Line is spooled.'], order: ['Taking a shot.', 'Reeling it in.'] },
  'holdout:gunskiff': { select: ['Skiff.', 'Gun is mounted. Bolted, even.'], order: ['Running out.', 'Coming round.'] },
  'holdout:jetski': { select: ['Ski.', 'Borrowed, this.'], order: ['Away!', 'Hold my pint.'] },
  'holdout:tender': { select: ['Tender.', 'Slow and sure.'], order: ['Making way.', "Tide's with us."] },
  'holdout:mothership': { select: ['She will start. Eventually.', "One engine's plenty."], order: ["Don't rush her.", 'Under way. Technically.'] },

  // --- Vantage Risk Group: hired by a client they will not name, billing by the quarter hour.
  'holdout:vantage': {
    select: ['Vantage, go ahead.', 'Operator standing by.', 'How can I help?'],
    order: ['Copy, tasking accepted.', "That's chargeable.", 'Raising a work order.', 'Within scope.'],
  },
  'holdout:operator': { select: ['Operator.', 'On the clock.'], order: ['Proceeding.', "That's a variation."] },
  'holdout:teamlead': { select: ['Team lead.', "I'll need that confirmed."], order: ['Proceeding.', 'Logging the movement.'] },
  'holdout:liaison': { select: ["I'll need that in writing.", 'Let me check the contract.'], order: ["That's not what we agreed.", 'I shall raise it with the client.'] },
  'holdout:breacher': { select: ['Entry team, ready.', "Door's coming off."], order: ['That door was chargeable.', 'Making entry.'] },
  'holdout:armouredsuv': { select: ['Armoured vehicle, ready.', 'Fully certified.'], order: ['Moving.', 'Mileage noted.'] },
  'holdout:protected': { select: ['Protected carrier.', 'Passengers secure.'], order: ['Moving the detail.', 'Copy.'] },
  'holdout:recovery': { select: ['Asset recovery.', 'What are we recovering?'], order: ['Recovering it.', 'That belongs to the client now.'] },
  'holdout:aaturretveh': { select: ['Counter-drone truck.', 'Spectrum is clear.'], order: ['Repositioning.', 'Jammer is live.'] },
  'holdout:observer': { select: ['Platform on station.', 'Recording.'], order: ['Re-tasking.', 'Imagery is billable.'] },
  'holdout:chopper': { select: ['Charter is turning.', 'Airframe is on the clock.'], order: ['Overhead shortly.', 'Flight time noted.'] },
  'holdout:gunship': { select: ['Escort, airborne.', 'Overhead.'], order: ['Running in.', 'Airframe is on the clock.'] },
  'holdout:launch': { select: ['Fast launch, ready.', 'Standing by.'], order: ['Making way.', 'Copy.'] },

  // --- Under the regular doctrine everyone fields a real army. Nobody is ready.
  'holdout:musteredneighbour': { select: ['Mustered, apparently.', 'I was asked to come.'], order: ['Right, going.', 'Is this where I stand?'] },
  'holdout:containercrawler': { select: ['Container on tracks.', 'Welded last winter.'], order: ['Crawling on.', 'Slow, this.'] },
  'holdout:potatogun': { select: ['Potato battery.', 'Hairspray is loaded.'], order: ['Firing.', 'Surprisingly effective.'] },
  'holdout:microlight': { select: ['Microlight, up.', 'Bombs are in a bag.'], order: ['Coming across.', 'Dropping by hand.'] },
  'holdout:pontoonbattery': { select: ['Pontoon battery.', 'Floating. For now.'], order: ['Under tow.', 'Do not rock it.'] },
  'holdout:harbourregular': { select: ['Harbour regular.', 'Signed on this morning.'], order: ['Going over.', 'Aye.'] },
  'holdout:slipwayside': { select: ['Slipway ironside.', 'Plated at the yard.'], order: ['Rolling.', 'If you like.'] },
  'holdout:winchmortar': { select: ['Winch mortar.', 'Cranking it up.'], order: ['Dropping one.', 'Give us a minute.'] },
  'holdout:seaplane': { select: ['Requisitioned, this.', 'Floats are down.'], order: ['Taking off.', 'Coming across.'] },
  'holdout:harbourclad': { select: ['Harbour ironclad.', 'Heavy, her.'], order: ['Making way.', "Tide's with us."] },
  'holdout:volunteer': { select: ['Association volunteer.', 'I did put my name down.'], order: ['Proceeding.', 'This was not in the newsletter.'] },
  'holdout:mowermk7': { select: ['Mark Seven.', 'Two cup holders.'], order: ['Mowing through.', 'Stripes, mind.'] },
  'holdout:hosebattery': { select: ['Hose battery.', 'Mains pressure.'], order: ['Opening the valve.', 'Mind the fence.'] },
  'holdout:autogyro': { select: ['Autogyro, up.', 'Surveillance flight.'], order: ['Overhead.', 'Photographing it all.'] },
  'holdout:committeelaunch': { select: ['Committee launch.', 'Minuted, this voyage.'], order: ['Making way.', 'Noted.'] },
  'holdout:vrifleman': { select: ['Vantage rifleman.', 'On the clock.'], order: ['Moving.', 'Within scope.'] },
  'holdout:guardian': { select: ['Guardian, ready.', 'Certified and insured.'], order: ['Moving.', 'Mileage noted.'] },
  'holdout:vfieldgun': { select: ['Field gun, ready.', 'Laid and loaded.'], order: ['Firing.', 'Ammunition is chargeable.'] },
  'holdout:vairwing': { select: ['Air wing, airborne.', 'Flight hours running.'], order: ['Running in.', 'Billed from takeoff.'] },
  'holdout:vpatrolship': { select: ['Patrol ship, standing by.', 'Bridge, go ahead.'], order: ['Making way.', 'Copy.'] },

  // Base and economy units, both comic and not.
  'holdout:van': { select: ['Site van.', 'Where do you want it?'], order: ['Driving out.', 'Mind the cones.'] },
  'holdout:skiploader': { select: ['Skip loader.', 'Empty skip.'], order: ['Going to collect.', 'On the round.'] },
  'holdout:handyman': { select: ['Handyman.', "I'll have a look at it."], order: ['On my way.', 'Need a part for that.'] },
};

/** Whether a pack scripts any spoken lines, so the setting is worth offering. */
export function packHasSpeech(packId: string): boolean {
  return Object.keys(SPEECH_VOICES).some(k => k.startsWith(`${packId}:`));
}

/**
 * Speaks unit lines through the browser's own synthesiser.
 *
 * Voices are installed on the player's machine, not shipped, so `prefer` is a
 * wish and `lang` is the fallback. A machine with no voice for a language says
 * nothing and the caller falls back to the sample bank.
 */
export class Speaker {
  private voices: SpeechSynthesisVoice[] = [];
  private chosen = new Map<string, SpeechSynthesisVoice | null>();

  static get supported() {
    return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
  }

  constructor() {
    if (!Speaker.supported) return;
    this.refresh();
    // Chrome populates the list asynchronously, and empties it again on some navigations.
    speechSynthesis.addEventListener('voiceschanged', this.refresh);
  }

  private refresh = () => {
    this.voices = speechSynthesis.getVoices();
    this.chosen.clear();
  };

  /** Whether anything can be spoken at all; false on a machine with no voices installed. */
  get ready() { return Speaker.supported && this.voices.length > 0; }

  /** The installed voice that best matches a faction's wishes, or null if none fits. */
  private pick(key: string, want: SpokenVoice): SpeechSynthesisVoice | null {
    const cached = this.chosen.get(key);
    if (cached !== undefined) return cached;
    const lang = want.lang.toLowerCase();
    const base = lang.split('-')[0];
    const named = (want.prefer ?? [])
      .map(n => this.voices.find(v => v.name.toLowerCase().includes(n.toLowerCase())))
      .find(v => !!v);
    const found = named
      ?? this.voices.find(v => v.lang.toLowerCase().replace('_', '-') === lang)
      ?? this.voices.find(v => v.lang.toLowerCase().startsWith(base))
      ?? this.voices.find(v => v.default)
      ?? this.voices[0]
      ?? null;
    this.chosen.set(key, found);
    return found;
  }

  /**
   * Say one line. Returns false when nothing was spoken, so the caller can fall
   * back to a sample. `volume` is 0-1 and is applied per utterance, because
   * speech does not pass through the Web Audio graph.
   */
  speak(text: string, key: string, want: SpokenVoice, volume: number): boolean {
    if (!this.ready || volume <= 0) return false;
    const voice = this.pick(key, want);
    if (!voice) return false;
    // A reply is news; the one it interrupts is not.
    speechSynthesis.cancel();
    const line = new SpeechSynthesisUtterance(text);
    line.voice = voice;
    line.lang = voice.lang;
    line.pitch = want.pitch;
    line.rate = want.rate;
    line.volume = volume;
    speechSynthesis.speak(line);
    return true;
  }

  /** Cut a line off mid-word, for muting and for leaving the match. */
  silence() {
    if (Speaker.supported) speechSynthesis.cancel();
  }

  dispose() {
    if (!Speaker.supported) return;
    speechSynthesis.removeEventListener('voiceschanged', this.refresh);
    speechSynthesis.cancel();
  }
}
