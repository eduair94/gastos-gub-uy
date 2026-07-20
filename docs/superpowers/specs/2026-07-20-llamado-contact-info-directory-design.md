# Contacto de la unidad compradora — panel + directorio

**Fecha:** 2026-07-20
**Estado:** diseño aprobado (a la espera de revisión del spec escrito)
**Origen:** pedido de usuario — el llamado [1357118](https://conlatuya.checkleaked.cc/llamados/1357118#benchmarks)
muestra en el portal oficial un contacto (Noelia García · compras.sancarlos@asse.com.uy ·
42669166 INT 151/152) que en conlatuya está ausente. "Favor incluir en lo posible. Crear un listado
con esta información como se hizo con la lista de proveedores respectivos."

## Hallazgo clave (define todo el enfoque)

**El contacto ya está ingerido — no es un feed gap.** Verificado contra la DB en vivo:

- `releases.parties[].contactPoint` del release `tender` de ese llamado (ocid `ocds-yfs5dr-1357118`)
  contiene exactamente:
  ```json
  { "name": "Noelia García", "telephone": "42669166 INT 151/152",
    "faxNumber": "42669166 INT 151/152", "email": "compras.sancarlos@asse.com.uy" }
  ```
  en el party con rol `procuringEntity` (Hospital de San Carlos).
- Es masivo: **532.041 / 2.173.278 releases (~24%)** tienen un `parties[].contactPoint.email`.
- Está en la etapa **llamado**: muestra de 20k → 19.796 `tender` + 204 `tenderUpdate`. Las
  adjudicaciones (`award`) no lo traen; heredan el contacto del release `tender` hermano (mismo `ocid`).
- El dato **se descarta al proyectar `open_calls`**: `src/jobs/open-calls/project.ts` sólo mapea
  `buyer.{id,name}` y `procuringEntity.{id,name}`; nunca toca `parties[].contactPoint`. `sync.ts` ni
  siquiera selecciona `parties` en `RELEASE_FIELDS`.

Conclusión: esto es "mostrar un dato que ya ingerimos", no un scrape. Sin probe, sin URL sibling,
sin `*ProbedAt`. El modelo `releases` ya modela `ContactPointSchema` (`shared/models/release.ts`).

## Objetivos

1. **Panel de contacto en la página del llamado** (`/llamados/[compraId]`) cuando el dato exista.
2. **El mismo contacto en la página de adjudicación/contrato** (`/contracts/[id]`), leído del release
   `tender` hermano que el endpoint de contrato ya resuelve.
3. **Directorio global buscable `/contactos`** — un contacto por organismo (dedupe), con búsqueda por
   organismo / persona / email, servido desde una colección precalculada.

## No objetivos

- No scrape del HTML de comprasestatales (el dato ya está en la DB).
- No contactos de **proveedores** (eso es otro subsistema: `supplier_contacts` + `enrich-supplier-contacts`).
  Acá el contacto es de la **unidad compradora** (procuringEntity/buyer).
- No editar/moderar contactos en UI. Sólo lectura.
- No re-derivar montos ni tocar `amount.*`.

## Realidad del dato (fuente de verdad)

- El contacto vive en el party con rol `procuringEntity`; fallback al party con rol `buyer` si el
  primero no tiene `contactPoint`.
- `telephone` y `faxNumber` suelen ser **idénticos** (como en el caso ejemplo) — colapsar: si
  `faxNumber === telephone`, no mostrar fax.
- Campos pueden venir parciales (sólo email, o sólo teléfono). Renderizar sólo los presentes.
- `buyer.id` **no tiene índice** (`releases.buyer.name` sí) — cualquier agregación liderada por
  `buyer.id`/`procuringEntity.id` sobre `releases` hace full-scan y puede timeoutear. Por eso el
  directorio se sirve de una **colección precalculada**, no de una query en vivo.

## Arquitectura

Tres piezas, un solo dataset (el `contactPoint` del tender).

### A. Panel en el llamado

**Modelo** `shared/models/open_call.ts` — nuevo subdocumento opcional:
```ts
contact?: { name?: string; telephone?: string; faxNumber?: string; email?: string } | undefined
```
Agregar a la interfaz (`shared/types/monitor.ts`) y al `OpenCallSchema` (subschema espejo de
`ContactPointSchema`). Forma guardada / `?: T | undefined` por `exactOptionalPropertyTypes`.

**Proyección** `src/jobs/open-calls/`:
- `sync.ts`: sumar `parties` a `RELEASE_FIELDS`.
- `project.ts`: `ReleaseLike` declara `parties?`. Elegir el party con rol `procuringEntity` (fallback
  `buyer`) que tenga `contactPoint`; mapear a `contact`, colapsando fax==tel y omitiendo vacíos.
- **Backfill:** el sync/refresh de open_calls re-proyecta desde `releases`; una corrida repuebla
  `contact` en los docs existentes. (El plan confirma el job/cron exacto de refresh de open_calls.)

**API** `app/server/api/open-calls/[compraId].get.ts` ya devuelve el doc completo → `contact` viaja
gratis una vez en el modelo. Verificar que no emita subobjeto vacío.

**Frontend** nuevo `app/components/CallContact.vue`:
- Estilo lista, espeja las filas de proveedores de `CallBenchmarks.vue` (`rb__rankrow`: fila con
  border-top, hover `--surface-sunken`).
- Filas: 👤 nombre · ✉ email (`mailto:` + botón copiar) · ☎ teléfono (`tel:` sanitizado + copiar) ·
  🏛 organismo (`buyer.name`). Sólo filas con dato.
- Colores neutros/celeste — **no gold** (gold = plata, per `app/DESIGN.md`). Consistente con el
  tratamiento celeste de errores-carga.
- i18n es/en: grupo `llamados.contact*` en ambos `app/i18n/locales/{es,en}.json`.
- Ubicación: en `.calldetail__aside` de `app/pages/llamados/[compraId].vue`, como `<section class="panel">`.
  `v-if="call.contact"`.

### B. Herencia en la adjudicación

`app/server/api/contracts/[id].get.ts` ya resuelve el release `tender` hermano (para pedir prestada
su `description`). Extender ese lookup para adjuntar `contact` desde `parties[].contactPoint` del
tender (misma selección de party que en A). Esto cubre **todos** los contratos, sin depender de que
exista un doc `open_call` para esa compra.

`app/pages/contracts/[id].vue` renderiza `<CallContact>` con el `contact` adjunto, `v-if` presente.
Mismo componente que A (reutilizado).

### C. Directorio global `/contactos`

**Colección precalculada** `procurement_contacts` (modelo nuevo, forma guardada, `{ collection }` explícito):
```
organismId        // procuringEntity.id (o buyer.id) — clave de agrupación
organismName
contactName?      // persona más reciente vista para ese organismo
email?            // principal (más frecuente/reciente)
telephone?
faxNumber?
variants[]        // otros {name,email,telephone} vistos para el organismo (dedupe)
llamadosCount     // nº de llamados con este contacto
lastSeenAt        // fecha del release tender más reciente
sampleCompraId    // un compraId de ejemplo para linkear
sampleOcid
```
Clave única: `organismId`. Índices (vía `scripts/ensure-indexes.ts` — un `Schema.index()` solo no
construye nada, `autoIndex` off): `{ organismId: 1 }` único, índice `$text` sobre
`organismName + contactName + email`, y `{ llamadosCount: -1 }` para el orden por defecto.

**Job de refresh** `src/jobs/refresh-contacts.ts` (patrón de los otros `refresh-*`):
- Agrega `releases` con `tag ∈ {tender, tenderUpdate}` y `parties.contactPoint.email` presente.
- Por cada release toma el party procuringEntity/buyer con contactPoint → agrupa por `organismId`,
  dedupe de variantes, cuenta, guarda el más reciente.
- **Subir `MONGO_SOCKET_TIMEOUT_MS` antes de `connectToDatabase()`** (full pass sobre ~532k, sin
  índice en `parties.contactPoint`) — trap documentado en CLAUDE.md.
- Upsert idempotente en `procurement_contacts`. Registrable como `npm run refresh-contacts` +
  entrada en el cron server (`src/`), diario o semanal (cambia lento).

**API** `app/server/api/contactos/index.get.ts`:
- Lista paginada desde `procurement_contacts`. Query params: `q` (búsqueda `$text`), `page`, `limit`,
  orden por `llamadosCount` desc por defecto. Devuelve `{ data, total, page }`.

**Página** `app/pages/contactos/index.vue`:
- Directorio buscable espejando el patrón de la lista de proveedores (`app/pages/suppliers/index.vue`):
  input de búsqueda + lista + paginación. Cada fila: organismo, persona, email (mailto+copiar),
  teléfono (tel+copiar), nº llamados, link a un llamado de ejemplo.
- i18n es/en (`contactos.*`).
- **Nav:** agregar entrada "Contactos" (a decidir en el plan: dropdown Análisis, o junto a
  Proveedores). Título/SEO propios (per Lighthouse: un solo audit por proceso, metas por ruta).

## Privacidad / legal

El contacto es la **función oficial de compras** publicada por el propio Estado en
comprasestatales.gub.uy (dato público de contacto institucional, ya accesible). Se muestra tal cual,
sin enriquecimiento externo ni inferencia. No aplica el tratamiento de datos personales sensibles;
es equivalente a republicar un dato de contacto oficial que ya figura en el portal público. Nota
explícita en el código donde se renderiza. (A diferencia del cold-email a proveedores, acá no hay
envío ni opt-out: es visualización de dato público.)

## Verificación (repo sin test runner)

- **Typecheck root:** `npx tsc --noEmit` (compila `src/` + `shared/`) tras tocar modelo/proyección/job.
- **Script de aserción** `tests/unit/`: `projectOpenCall` con un `ReleaseLike` que trae
  `parties[].contactPoint` → assert `contact` mapeado + fax==tel colapsado + party procuringEntity
  preferido sobre buyer.
- **En vivo:** `curl :3600/api/open-calls/1357118` → assert `contact.email == compras.sancarlos@asse.com.uy`.
  `curl :3600/api/contactos?q=san%20carlos` → assert la fila del Hospital de San Carlos.
  Render de `/llamados/1357118` y `/contracts/<id de esa compra>` muestran el panel.
- **Job:** correr `refresh-contacts` en dev/167, verificar `procurement_contacts` poblada y el count
  del organismo ejemplo.
- Typecheck del lado Nuxt puede estar roto mientras corre el dev server — validar con curl, no build.

## Preguntas abiertas (para el plan)

1. Job/cron exacto que refresca `open_calls` hoy (para el backfill del campo `contact`).
2. Cobertura de `open_calls`: ¿histórico completo o sólo llamados recientes/abiertos? (No afecta al
   directorio, que se arma de `releases`; sí define para qué llamados aparece el panel.)
3. Ubicación en el nav de `/contactos` (Análisis vs. junto a Proveedores).
4. ¿El directorio agrupa por `procuringEntity.id` o por `buyer.id`? (En el caso ejemplo coinciden
   `29-54`; confirmar en el plan si divergen y cuál es la clave estable.)
