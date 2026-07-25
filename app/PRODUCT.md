# Con la tuya, contribuyente — product brief

## Product

**Con la tuya, contribuyente** is a public, evidence-first web application for
understanding Uruguayan government procurement. It normalizes procurement data,
connects public registries and makes it practical to answer a simple question:
where did public money go, and does the record merit a closer look?

The name is an Uruguayan idiom: public spending happens on the taxpayer's dime.
The voice is plain, precise and occasionally wry. It is never promotional,
partisan or accusatory.

## People and jobs

- Citizens need understandable records without learning OCDS or procurement law.
- Journalists and watchdogs need traceable facts, source links and useful leads.
- Suppliers need to find opportunities and verify how their public record appears.
- Analysts need consistent identifiers, filters and machine-readable context.

Every public surface should help a reader find a record, understand what is
known, distinguish sourced facts from derived analysis and continue to the
official evidence.

## Core capabilities

- Explore contracts, suppliers, buyers, products, calls and public spending.
- Cross-reference supplier records with DEI and RUPE data.
- Surface contact channels and business locations with their provenance.
- Show anomalies and patterns as screening signals, never as verdicts.
- Publish source-backed investigations and reusable public-data views.
- Offer an authenticated monitoring area when authentication is configured.

## Evidence contract

- Official procurement and registry data are the base layer.
- Derived figures are visibly distinct from attributed or quoted claims.
- Every contract detail links to the official government page using the OCID.
- Missing data remains missing; the interface does not invent certainty.
- Anomaly labels describe a pattern detected in data, not wrongdoing.
- External contact and map data display their source and last update when known.
- Potentially corrupt source amounts remain inspectable, but never become an
  unqualified all-time headline.

## Supplier contacts and map

The supplier directory combines procurement identity, contact enrichment and
registry location. A map point represents an available geospatial record, not a
guarantee that the supplier operates at that exact physical point.

The map is a discovery surface:

- the same directory filters govern both table and map;
- location search centers the map and the radius shows the scan area;
- visible suppliers load by viewport/radius rather than as one global payload;
- selecting a supplier opens a complete business record in one interaction;
- the record combines available contact, registry, activity and procurement
  context, with direct links to original sources and the full supplier profile.

Contact values may come from supplier websites, public registries or map
providers. Their provenance must remain visible. Internal enrichment versions,
scores and provider identifiers are operational metadata and are not presented
as business facts.

## Product principles

1. **Evidence before interpretation.** Put facts, dates and sources first.
2. **Public money is legible.** Amounts use one shared visual magnitude language.
3. **Structure carries meaning.** Hierarchy, rules and tables reveal relationships.
4. **One action, one result.** Avoid intermediate popups and needless second clicks.
5. **Dense, not cramped.** Expert depth remains scannable for a first-time reader.
6. **Uruguay first.** Spanish is canonical and locale behavior defaults to Uruguay.
7. **Accessible by default.** Keyboard, contrast, responsive layout and reduced
   motion are requirements, not polish.

## Platform and operating constraints

- Nuxt 3 SSR, Vue 3, Vuetify 4 and Pinia.
- Spanish and English locale files must keep identical key order.
- Public pages render meaningful data in SSR HTML with `useFetch`.
- MongoDB-backed endpoints must use bounded queries and geospatial indexes for
  location workloads.
- Vuetify components are auto-resolved and tree-shaken; they are not registered
  eagerly.
- Theme values mirror CSS tokens manually; update both sources together.
- The app remains useful when optional auth, geocoding or enrichment services are
  unavailable.

## Success looks like

A reader can arrive with a name, RUT, place or suspicion, narrow the record,
understand what the public data does and does not say, and leave with an
authoritative source or a reproducible lead.
