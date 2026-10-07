/**
 * Challenge 1: "Resy goes offline". Restaurant data + the scattered evidence of tonight's book.
 */
export const restaurant = {
  name: "Lupa Trattoria",
  outageSince: "1:12 PM",
  now: "2:05 PM",
  turnMinutes: 90,
  slots: ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"],
  tables: [
    { id: "T1", seats: 2 }, { id: "T2", seats: 2 }, { id: "T3", seats: 2 }, { id: "T4", seats: 2 },
    { id: "T5", seats: 4 }, { id: "T6", seats: 4 }, { id: "T7", seats: 4 }, { id: "T8", seats: 4 },
    { id: "T9", seats: 6 }, { id: "T10", seats: 8 },
  ],
};

export type Channel = "email" | "sms" | "voicemail" | "instagram" | "staff" | "google" | "manual";
export type Message = { id: string; channel: Channel; from: string; received: string; text: string };

export type Booking = {
  id: string;
  name: string;
  partySize: number;
  time: string; // HH:MM
  phone: string | null;
  notes: string;
  sources: string[]; // message ids
  status: "verified" | "unverified" | "requested" | "cancelled";
  table: string | null;
  vip: boolean;
};

export const messages: Message[] = [
  { id: "m1", channel: "email", from: "notifications@resy.com", received: "Mon 4:12 PM", text: "New reservation: Sarah Kim, party of 2, Tonight 7:00 PM. Phone (917) 555-0142. Notes: Anniversary" },
  { id: "m2", channel: "email", from: "notifications@resy.com", received: "Tue 9:30 AM", text: "New reservation: David Okafor, party of 4, Tonight 7:30 PM. Phone (646) 555-0199." },
  { id: "m3", channel: "email", from: "notifications@resy.com", received: "Tue 11:02 AM", text: "New reservation: Marco Bellini, party of 6, Tonight 8:00 PM. Phone (212) 555-0123. Notes: one guest has a severe nut allergy" },
  { id: "m4", channel: "sms", from: "(917) 555-0142", received: "1:20 PM", text: "Hi! Just confirming our anniversary dinner tonight at 7, it's Sarah. Could we get a quiet table?" },
  { id: "m5", channel: "voicemail", from: "(347) 555-0177", received: "1:25 PM", text: "Hi this is Jenny Liu, I booked for 2 at 6:30 tonight through Resy but the app is down and I can't see my reservation, can someone call me back to make sure we're still on?" },
  { id: "m6", channel: "email", from: "notifications@resy.com", received: "Wed 8:45 AM", text: "Cancellation: Tom Reyes, party of 2, Tonight 6:00 PM has been cancelled by the guest." },
  { id: "m7", channel: "instagram", from: "@foodie_amara", received: "1:40 PM", text: "hey!! any chance you have a table for 3 tonight around 8? resy isn't loading 😭" },
  { id: "m8", channel: "email", from: "notifications@resy.com", received: "Wed 2:15 PM", text: "New reservation: Priya Shah, party of 2, Tonight 6:00 PM. Phone (718) 555-0161." },
  { id: "m9", channel: "staff", from: "Luis (host, morning shift)", received: "1:45 PM", text: "Took a phone booking before Resy died: Chen family, 5 people, 8:30, number 917-555-0110. Didn't get to enter it." },
  { id: "m10", channel: "sms", from: "(646) 555-0199", received: "1:50 PM", text: "This is David, we have 4 at 7:30 tonight. Can we make it 5 people? My brother is in town" },
  { id: "m11", channel: "google", from: "Google Business message", received: "1:52 PM", text: "Do you take walk-ins tonight? Resy says error" },
  { id: "m12", channel: "email", from: "james.w@whitfieldcapital.com", received: "1:55 PM", text: "Hello, this is James Whitfield's assistant. Mr. Whitfield has a table for 8 at 7:00 PM tonight for a client dinner. Please confirm the private corner is still arranged." },
  { id: "m13", channel: "voicemail", from: "(212) 555-0123", received: "1:58 PM", text: "Hola, soy Marco Bellini, tengo reserva para seis a las ocho. Solo quería recordarles lo de la alergia a las nueces, es grave. Gracias." },
  { id: "m14", channel: "sms", from: "(718) 555-0161", received: "2:01 PM", text: "Priya here — so sorry, need to cancel tonight 6pm, kid is sick" },
  { id: "m15", channel: "email", from: "deals@wine-distributor.com", received: "2:02 PM", text: "Fall portfolio tasting next Tuesday — reserve your spot! 20% off Barolo cases." },
  { id: "m16", channel: "instagram", from: "@nyc_dates", received: "2:04 PM", text: "Table for 2 at 7pm tonight possible?" },
];
