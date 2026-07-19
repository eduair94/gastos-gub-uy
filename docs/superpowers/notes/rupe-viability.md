# RUPE viability spike (Task 9)

**Question:** Does RUPE (Registro Único de Proveedores del Estado, run by ARCE) expose a
supplier contact **email** through any surface we can access without login or ToS-restricted
scraping — enough to justify a `resolvers/rupe.ts` `ContactResolver`?

**Verdict: DEFER.** No viable open source. Both public surfaces (open-data CSV and the public
RUT/name lookup) expose only identity/address/status fields — never an email or phone. RUPE does
collect an email per supplier (it's used to issue login credentials at registration), but that
email lives inside the authenticated "gestión" area, which is out of scope for this project
(global constraint: "No scraping of anything behind a login/paywall").

## What was checked

### 1. Open-data dataset on catalogodatos.gub.uy — EXISTS, no email field

ARCE publishes a RUPE dataset per year, monthly CSVs, under CKAN at catalogodatos.gub.uy:

- https://catalogodatos.gub.uy/dataset/arce-registro-unico-de-proveedores-del-estado-rupe-2026
  (and equivalent `-2025`, `-2024`, `-2023`, `-2022`, `-2021`, `-2020` dataset pages)
- Data dictionary (fetched and read directly):
  `https://catalogodatos.gub.uy/dataset/cbe2defd-d214-4e5b-9b52-424f3688b2cf/resource/343f18f0-2c9a-4189-a73a-210c0e1f18ba/download/diccionario_datos_rupe.csv`
- Monthly resource, e.g.:
  `https://catalogodatos.gub.uy/dataset/cbe2defd-d214-4e5b-9b52-424f3688b2cf/resource/7ff5648a-ffff-46c8-b326-57bf9cdacd38/download/rupe-enero-2026.csv`

The data dictionary lists **exactly 7 fields**, verified verbatim from the CSV:

| field | description |
|---|---|
| `pais_prov` | País del proveedor |
| `identificacion_prov` | Identificación del proveedor |
| `denominacion_social_prov` | Denominación social del proveedor |
| `domicilio_fiscal` | Domicilio fiscal del proveedor |
| `localidad_prov` | Localidad del proveedor |
| `departamento_prov` | Departamento del proveedor |
| `estado_prov` | Estado en que se encuentra el registro del proveedor en RUPE |

No `correo`/`email`/`contacto`/`telefono` field exists anywhere in the dictionary. The monthly
CSV itself is >10MB (couldn't be fully fetched inline) but its header necessarily matches the
dictionary — CKAN validates monthly resources against the same schema. License is "Licencia de
DAG de Uruguay" (open reuse permitted), which is moot here since there's no email to reuse.

### 2. Public RUT/name lookup on comprasestatales.gub.uy — EXISTS, no-login, same limited fields

- https://www.comprasestatales.gub.uy/rupe/clientes/publicos/BusquedaPublicaDeProveedoresCliente.jsf

Confirmed via direct fetch: this is a public search form (no login wall) that filters by
"Nro. ident." or "Denominación social" and returns a results table with columns **País,
Identificación, Denominación social, Domicilio fiscal, Estado del proveedor** — the same field
set as the open dataset, just served live instead of as a monthly CSV dump. No email/phone
column is rendered.

Separately, the path structure (`.../rupe/clientes/publicos/...` vs. a sibling
`.../rupe/clientes/publicos/LoginCliente.jsf`) confirms RUPE has a distinct authenticated
"gestión" area for suppliers/buyers — that's where any richer contact data (including the
registration email) would live, per §3 below.

### 3. Email is collected by RUPE, but only surfaces behind login

- https://www.gub.uy/tramites/inscripcion-proveedor-estado-registro-unico-proveedores-estado-rupe

The registration trámite confirms suppliers *do* submit an email at sign-up: "El sistema le
enviará al correo electrónico registrado un usuario y contraseña" (the system emails the
registered address a username and password). That email is tied to the supplier's own login
credentials for the gestión system, not published.

- https://www.gub.uy/agencia-reguladora-compras-estatales/politicas-y-gestion/planes/registro-unico-proveedores-del-estado
  states only that "los proveedores tienen acceso a la información que de ellos conste en el
  registro, sin necesidad de solicitud previa" (suppliers can see their *own* record) — i.e.
  self-service access, not third-party/public access to other suppliers' contact data.

No terms-of-use document explicitly says "scraping forbidden," but that's beside the point: there
is no email exposed on either open surface to scrape. Reaching the email requires the
authenticated ARCE "clientes" gestión portal (`LoginCliente.jsf`), which this project's plan
explicitly excludes (global constraint in
`docs/superpowers/plans/2026-07-19-supplier-contact-enrichment.md`: "No scraping of anything
behind a login/paywall").

## Recommendation

**Defer — do not implement `resolvers/rupe.ts`.** Reason: neither the open-data CSV
(`catalogodatos.gub.uy`, dictionary verified) nor the public no-login RUT lookup
(`comprasestatales.gub.uy/rupe/clientes/publicos/BusquedaPublicaDeProveedoresCliente.jsf`)
carries an email or phone field — both are limited to país/identificación/denominación
social/domicilio fiscal/localidad/departamento/estado. The email RUPE does hold per supplier is
only reachable via the authenticated gestión login, which is out of scope.

If this is revisited later, the only legitimate path would be an official data-sharing agreement
with ARCE (not scraping) for bulk contact-email export — that's a business/legal track, not an
engineering resolver, and should not be scheduled as a follow-up code task.

Not implemented: `ContactResolver` at `name: "rupe"` (would have matched
`src/jobs/enrich/types.ts`'s `ResolverInput`/`ResolverResult` shape at confidence ~0.95 had a
source existed).
