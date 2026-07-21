// Single source of truth for the string RUPE addresses are geocoded by, shared
// between geocode-rupe.ts (which sends it to the proxy) and load-rupe.ts (which
// compares it against the last-geocoded value to decide whether an address
// changed and must be re-geocoded). They MUST agree or every reload would either
// churn geocodes or leave them stale.

export interface RupeAddressParts {
  domicilioFiscal?: string | null;
  localidad?: string | null;
  departamento?: string | null;
}

/**
 * Compose the geocoder query from the RUPE address parts, or null when there is
 * nothing to geocode. Appends ", Uruguay" so the Google proxy biases in-country.
 * Duplicate locality/department tokens already embedded in the fiscal address
 * are harmless — the geocoder tolerates redundancy.
 */
export function rupeGeocodeQuery(d: RupeAddressParts): string | null {
  const parts = [d.domicilioFiscal, d.localidad, d.departamento]
    .map((x) => (x ?? "").trim())
    .filter(Boolean);
  if (!parts.length) return null;
  return `${parts.join(", ")}, Uruguay`;
}
