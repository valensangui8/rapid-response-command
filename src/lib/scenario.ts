import type { RawReport, Resource, ResourceType } from "./types";

/**
 * ⚡ EDIT THIS FILE EACH ROUND ⚡
 * Everything scenario-specific lives here: name, categories (Jev Choice options),
 * which resource type handles each category, available resources, and demo reports.
 */

export const scenario = {
  name: "Flash flood + power outage — Lower Manhattan & South Brooklyn",
  briefing:
    "A 3-inch/hour cloudburst hit NYC at 4:40 PM. Subway stations are flooding, Con Ed reports outages in Red Hook and the Lower East Side, and 911 call volume is 4x normal.",

  /** Jev Choice options: key -> description the model reads. */
  categories: {
    medical: "Someone is injured, sick, or needs medical care or medical equipment power",
    rescue: "People trapped (water, vehicle, elevator, building) and need physical extraction",
    fire: "Fire, smoke, explosion, gas leak, or electrical sparking",
    flooding: "Water entering streets, basements, or stations without people trapped",
    power: "Power outage or downed lines with no immediate injury",
    shelter: "People displaced or needing a safe place to stay, cooling/warming, food or water",
    info: "Question, rumor, or general information with no physical emergency",
  },

  /** Which responder type handles each category. */
  routing: {
    medical: "ems",
    rescue: "rescue",
    fire: "fire",
    flooding: "rescue",
    power: "utility",
    shelter: "shelter",
    info: null,
  } as Record<string, ResourceType | null>,

  resources: [
    { id: "EMS-4", name: "EMS Unit 4 (Bellevue)", type: "ems", lat: 40.7392, lng: -73.9754 },
    { id: "EMS-11", name: "EMS Unit 11 (Downtown)", type: "ems", lat: 40.7128, lng: -74.006 },
    { id: "EMS-31", name: "EMS Unit 31 (Park Slope)", type: "ems", lat: 40.6721, lng: -73.9776 },
    { id: "FD-L10", name: "FDNY Ladder 10", type: "fire", lat: 40.7101, lng: -74.0127 },
    { id: "FD-E202", name: "FDNY Engine 202 (Red Hook)", type: "fire", lat: 40.6779, lng: -74.0096 },
    { id: "RES-1", name: "FDNY Rescue 1 (boat team)", type: "rescue", lat: 40.7633, lng: -73.9913 },
    { id: "RES-2", name: "FDNY Rescue 2 (Brooklyn)", type: "rescue", lat: 40.6681, lng: -73.9416 },
    { id: "CE-7", name: "Con Ed Crew 7", type: "utility", lat: 40.7181, lng: -73.9857 },
    { id: "CE-9", name: "Con Ed Crew 9", type: "utility", lat: 40.6765, lng: -74.0046 },
    { id: "SH-PS20", name: "Shelter PS 20 (LES)", type: "shelter", lat: 40.7196, lng: -73.9875 },
    { id: "SH-RHCC", name: "Red Hook Community Center", type: "shelter", lat: 40.6772, lng: -74.0063 },
  ] satisfies Resource[],

  reports: [
    { id: "r1", source: "911", minutesAgo: 2, lat: 40.6745, lng: -74.0091, text: "my grandmother is on oxygen machine and power went out 20 min ago, battery says 30 min left, 4th floor Red Hook houses building 7, elevator not working" },
    { id: "r2", source: "social", minutesAgo: 3, lat: 40.7135, lng: -74.0081, text: "WATER POURING DOWN the stairs at chambers st station people still on the platform 😱😱 #nycflood" },
    { id: "r3", source: "911", minutesAgo: 3, lat: 40.7138, lng: -74.0077, text: "Caller at Chambers St station reports approx 15 people on downtown platform, water ankle deep and rising, train stopped in tunnel" },
    { id: "r4", source: "sms", minutesAgo: 4, lat: 40.6748, lng: -74.0088, text: "mi abuela usa oxigeno y no hay luz en Red Hook edificio 7 piso 4 por favor ayuda" },
    { id: "r5", source: "social", minutesAgo: 5, text: "heard the Brooklyn Bridge is collapsing because of the water, everyone get off now!!" },
    { id: "r6", source: "311", minutesAgo: 6, lat: 40.7181, lng: -73.9845, text: "Basement flooding at 145 Ludlow, about 6 inches, no one inside, landlord not answering" },
    { id: "r7", source: "911", minutesAgo: 6, lat: 40.6402, lng: -73.9718, text: "Car stalled in water under the Ocean Pkwy underpass, driver and child still inside, water up to the doors" },
    { id: "r8", source: "radio", minutesAgo: 7, lat: 40.6786, lng: -74.0118, text: "Engine 202 on scene Van Brunt, sparking transformer on pole, wires down across sidewalk, requesting Con Ed" },
    { id: "r9", source: "sms", minutesAgo: 8, lat: 40.7168, lng: -73.9897, text: "我们在东百老汇大楼没有电，电梯停了，楼里有很多老人，需要水" },
    { id: "r10", source: "social", minutesAgo: 8, lat: 40.6789, lng: -74.0121, text: "big sparks and a bang on van brunt st near the pier, smells like burning" },
    { id: "r11", source: "311", minutesAgo: 9, text: "Is the F train running? I need to get home to Carroll Gardens" },
    { id: "r12", source: "911", minutesAgo: 10, lat: 40.7203, lng: -73.9873, text: "Man fell on wet stairs at Delancey St, head bleeding, conscious but confused" },
    { id: "r13", source: "sensor", minutesAgo: 10, lat: 40.6763, lng: -74.0144, text: "FloodNet sensor RH-03: water depth 14 in, rising 2 in / 10 min" },
    { id: "r14", source: "sms", minutesAgo: 11, lat: 40.5755, lng: -73.9707, text: "Я в Брайтон-Бич, подвал затоплен, мы с мужем на первом этаже, вода поднимается, муж в инвалидной коляске" },
    { id: "r15", source: "social", minutesAgo: 12, text: "Con Ed says power will be out for 3 days in all of Brooklyn, stock up on everything" },
    { id: "r16", source: "911", minutesAgo: 12, lat: 40.7055, lng: -74.0137, text: "Elevator stuck between floors at 2 Rector St office building, 4 people inside, power out, one woman having panic attack" },
    { id: "r17", source: "311", minutesAgo: 13, lat: 40.6771, lng: -74.0059, text: "Where can families from Red Hook Houses go? Our apartments have no power and no water pressure, we have 3 kids" },
    { id: "r18", source: "social", minutesAgo: 14, lat: 40.7132, lng: -74.0084, text: "still stuck at chambers, MTA staff just told us to go up the north stairs, some people refusing" },
    { id: "r19", source: "sms", minutesAgo: 15, lat: 40.6315, lng: -74.0274, text: "Bay Ridge here, just a few puddles, all fine, power on" },
    { id: "r20", source: "911", minutesAgo: 16, lat: 40.6879, lng: -73.9809, text: "Smell of gas in the lobby at 85 Flatbush Ext after the basement flooded, residents evacuating on their own" },
    { id: "r21", source: "sms", minutesAgo: 17, lat: 40.6608, lng: -73.9905, text: "Kanpe nan sous-sol, dlo ap monte, gen yon timoun malad avèk lafyèv, nou pa ka sòti" },
    { id: "r22", source: "radio", minutesAgo: 18, lat: 40.7129, lng: -74.0079, text: "Transit police at Chambers: platform evacuation 60% complete, need additional units at north exit for crowd control" },
    { id: "r23", source: "social", minutesAgo: 19, text: "Someone said the shelters are turning people away because they're full?? Is this true" },
    { id: "r24", source: "311", minutesAgo: 20, lat: 40.7214, lng: -73.9835, text: "Dialysis patient at 50 Clinton St needs transport to appointment tomorrow, no power, worried about the morning" },
  ] satisfies RawReport[],
};

export type Scenario = typeof scenario;
