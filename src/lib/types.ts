export type ResourceType = "ems" | "fire" | "rescue" | "utility" | "shelter" | "police";

export type Resource = {
  id: string;
  name: string;
  type: ResourceType;
  lat: number;
  lng: number;
};

export type RawReport = {
  id: string;
  text: string;
  source: "911" | "311" | "sms" | "social" | "sensor" | "radio" | "manual";
  minutesAgo: number;
  lat?: number;
  lng?: number;
};

export type Judgment = {
  category: string;
  categoryProbs: Record<string, number>;
  categoryConfidence: number;
  severity: number; // 0..4
  severityConfidence: number;
  lifeThreat: number; // probability
  vulnerable: number;
  credible: number;
  duplicateOf: string | null;
  duplicateConfidence: number;
  mock: boolean;
};

export type Extraction = {
  summary: string;
  language: string;
  peopleAffected: number | null;
  locationHint: string;
  lat: number | null;
  lng: number | null;
  mock: boolean;
};

export type TriagedReport = {
  report: RawReport;
  judgment: Judgment;
  extraction: Extraction;
};

export type Incident = {
  id: string;
  reports: TriagedReport[];
  category: string;
  severity: number;
  lifeThreat: number;
  vulnerable: number;
  credible: number;
  priority: number; // 0..100
  needsHuman: boolean;
  reasons: string[];
  summary: string;
  lat: number;
  lng: number;
  status: "open" | "dispatched" | "dismissed";
  assignedResource: string | null;
};
