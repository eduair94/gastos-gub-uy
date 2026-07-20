// Locked tuning constants for the tender-anticipation feature (Fase 1 + 2).
export const MIN_EVENTS = 3;            // fewer distinct events → not a recurrence
export const RUBRO_LEVEL = 3;           // clase; fallback subfamilia (2)
export const EVIDENCE_TOP = 5;          // leaf articles kept as evidence per group
export const MIN_DISP_DAYS = 15;        // expected-window half-width floor
export const MAX_DISP_DAYS = 180;       // …and ceiling
export const DISPLAY_THRESHOLD = 0.35;  // appears on the page
export const ALERT_THRESHOLD = 0.60;    // fires external channels (Fase 2)
