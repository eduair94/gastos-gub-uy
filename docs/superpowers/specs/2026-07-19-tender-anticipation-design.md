# Anticipación de llamados — design spec

**Fecha:** 2026-07-19
**Rama:** feat/supplier-cold-email-campaign (feature nueva, rama propia a crear)
**Estado:** aprobado (diseño) — pendiente escribir plan de implementación

## Contexto y motivación

Trexia.ai (SaaS uruguayo B2G) vende "anticipación": mostrarle a un proveedor las
licitaciones **antes** de que se publiquen. Su único diferencial real ("Compras
Futuro") no es IA predictiva sino lectura de dato público:

1. **PAC (Plan Anual de Contratación)** — dato legalmente obligatorio (Art. 24
   Ley 19.355 + Dec. 339/021) con el campo "fecha estimada de publicación del
   llamado". No está en el feed OCDS. → Fase 5, fuera de este spec.
2. **Recurrencia** de compras periódicas por organismo × rubro. → **Este spec.**
3. Inferencia de vencimiento de contrato. → Fase 4, fuera de este spec.

gastos-gub ya replica **todo el ciclo reactivo** de Trexia (detección `open_calls`,
matching `watches` + `watchMatchesCall`, alertas multicanal `notifications`,
benchmarks, estimación de oferta, resumen de pliego). El único gap es la capa
**predictiva**: todo el stack actual solo muestra un llamado **después** de que el
feed OCDS lo publicó (`firstSeenAt`). El feed no trae señal pre-publicación
(`tender.status` solo vale `active`/`cancelled`, 0 planning, 0 contracts), así que
la anticipación hay que **derivarla** de la recurrencia histórica.

Este spec cubre **Fase 1 (recurrencia, solo lectura) + Fase 2 (alertas anticipadas)**.

## Alcance

**Incluido:**
- Job de rollup mensual que detecta recurrencia `buyer.id × nodo-rubro` sobre el
  histórico `releases` y escribe una colección `tender_forecast`.
- Endpoints de lectura: uno público (panorama general), uno gated (matcheado a los
  watches del usuario).
- Página pública `/analytics/anticipacion` + sección "Próximos para vos" en
  `/app/calendario` + card reusable en `/products/{code}` y perfil de comprador.
- Tipo de evento de alerta `anticipado` reutilizando el fan-out multicanal
  existente, opt-in por watch (`anticipatedAlerts`, default OFF).

**Fuera de alcance (fases posteriores, no en este spec):**
- PAC / `plan_anual` (Fase 5) — ingestión nueva.
- Vencimiento/renovación de contrato (Fase 4) — señal inferida.
- Estacionalidad avanzada / ML / "probable ganador" enriquecido (Fase 3).
- Onboarding por RUT + auto-watches (Fase 6).

## Decisiones de diseño (locked)

| # | Decisión | Elección |
|---|---|---|
| 1 | Opt-in de la alerta `anticipado` | Reusar `watches` + nuevo flag `anticipatedAlerts` (default **false**) |
| 2 | Superficie de UI | **Ambas**: página pública `/analytics/anticipacion` + sección "para vos" en `/app/calendario` |
| 3 | Granularidad de recurrencia | Nodo rubro **medio** (SICE nivel 2–3) para la cadencia; artículos **hoja** como evidencia |

## Arquitectura

Cuatro unidades, cada una con un propósito y una interfaz clara:

```
releases (histórico OCDS)
   │  COLLSCAN mensual (allowDiskUse; buyer.id no indexado)
   ▼
[U1] src/jobs/refresh-tender-forecast.ts   ── compute-then-swap por dataVersion
   │  escribe
   ▼
tender_forecast (colección nueva)
   │                              │
   │ .find() por índice           │ al terminar el job: enqueue alertas
   ▼                              ▼
[U2] endpoints lectura         [U3] fan-out anticipado → notifications
   │  (público + mine)            │  (reusa dispatchers dispatch*.ts)
   ▼                              ▼
[U4] UI (página + calendario + card)   canales push/telegram/email/inapp
```

### U1 — Job de recurrencia `src/jobs/refresh-tender-forecast.ts`

Clon estructural de `src/jobs/refresh-dept-indicators.ts` (mismo patrón
compute-then-swap-by-`dataVersion`, mismo workaround de `buyer.id` no indexado).

**Entrada:** colección `releases`. COLLSCAN con `allowDiskUse`, proyectando solo
los campos necesarios (`buyer.id`, `buyer.name`, `tender.tenderPeriod.startDate`,
`awards[].date`, `awards[].suppliers`, `items`/`classification.id`,
`procurementMethodDetails`, `sourceYear`, `tag`/kind).

**Definición de "evento":** una publicación de llamado. Usar la fecha de la
**fase-tender** (`tender.tenderPeriod.startDate`); fallback `awards[].date` si no
hay fecha de tender. Separar fase-tender vs fase-award con el helper `releaseKind()`
de `src/jobs/open-calls/project.ts` (`TENDER_KINDS`/`AWARD_KINDS`). Predecimos la
cadencia de **publicación de llamado**, por eso el evento es la fecha del llamado,
no la de adjudicación.

**Agrupamiento:** `buyer.id × nodoRubro`, donde `nodoRubro` es el ancestro SICE de
nivel medio (2–3) del `classification.id` de cada item — reusando los ancestros que
ya folda `enrichProjectionWithCatalog` (open-calls) / la jerarquía de
`sice_rubro`/`sice_catalog`. Nivel exacto: el ancestro a `RUBRO_LEVEL = 3` (con
fallback a un nivel más alto si el código no llega a nivel 3). Esto densifica la
señal frente a agrupar por hoja (muchos `buyer×hoja` tienen <3 eventos).

**Cómputo por grupo:**
- Recolectar el array de fechas de evento, ordenar, deduplicar por `compraId`
  (un mismo llamado no cuenta dos veces).
- Intervalos inter-evento (días) → `medianDays`, `cvDays` (desvío/media).
- Histograma de mes-del-año → `seasonalMonths` (meses dominantes).
- `eventCount` = nº de eventos distintos.
- `lastEventDate` = fecha del último evento.
- `expectedWindow = { start: lastEventDate + medianDays − disp, end: + disp }`,
  con `disp = clamp(medianDays × cvDays, MIN_DISP, MAX_DISP)`. Nunca fecha puntual.
- `evidenceItems`: los ≤5 `classification.id` hoja más frecuentes del grupo, con
  su label SICE y su count.
- `incumbentSupplier`: el `{id, name}` del proveedor del último evento adjudicado
  (`awards[].suppliers[].id/name` — `awards.suppliers.id` **sí** está indexado).
- `expectedAmount`: `{currency, p25, p50}` leído de `item_price_baseline` para las
  hojas de evidencia (NO de `open_call.estimatedValue`, que la proyección nunca
  puebla, ni de montos crudos afectados por enmiendas de adjudicación).
- `confidence` ∈ [0,1] (ver Scoring).

**Salida:** `replaceOne` por grupo con `dataVersion` fresco; al final
`deleteMany({ dataVersion: { $ne } })`. Fuera de `busyWith()` como los demás
rollups.

**Filtros de emisión (no escribir el doc si):**
- `eventCount < MIN_EVENTS` (=3).
- `confidence < DISPLAY_THRESHOLD`.
- Existe un `open_call` vivo de ese `buyer × nodoRubro` cuya `tenderPeriod` cae
  dentro de `expectedWindow` (ya es reactivo → no duplicar). Cross-check contra
  `open_calls`.

### Colección `tender_forecast`

Modelo Mongoose nuevo `shared/models/tender_forecast.ts` (registro HMR-safe como el
resto):

```ts
interface ITenderForecast {
  buyerId: string;            // '80-1', etc.
  buyerName: string;
  rubroNodeId: string;        // código SICE del nodo medio
  rubroLabel: string;
  rubroLevel: number;         // nivel del nodo (típ. 3)
  rubroAncestors: string[];   // códigos ancestro (para matchear watch.categories)
  evidenceItems: { classificationId: string; label: string; count: number }[];
  cadence: {
    medianDays: number;
    cvDays: number;           // coef. variación de intervalos
    seasonalMonths: number[]; // 1..12 dominantes
    eventCount: number;
  };
  lastEventDate: Date;
  expectedWindow: { start: Date; end: Date };
  confidence: number;         // 0..1
  incumbentSupplier?: { id?: string; name?: string };
  expectedAmount?: { currency: string; p25: number; p50: number };
  basis: 'recurrence';        // extensible a 'expiry' | 'recurrence+expiry'
  dataVersion: string;
  generatedAt: Date;
}
```

Índices: `{ buyerId:1, rubroNodeId:1 }` unique, `{ dataVersion:1 }`,
`{ 'expectedWindow.start':1 }`, `{ rubroAncestors:1 }` (para el matcheo a watches),
`{ confidence:-1 }`.

### U2 — Endpoints de lectura

- `GET /api/analytics/anticipacion` — **público**, SSR (como el resto de
  `/analytics/*`). Solo `.find()` por índice, nada agregado en el request path.
  Query: `rubro`, `buyer`, `windowBefore` (fecha), `minConfidence` (default
  `DISPLAY_THRESHOLD`), paginado, orden por `expectedWindow.start` asc. Devuelve el
  doc + labels ya resueltos.
- `GET /api/app/anticipacion/mine` — **gated** (usuario autenticado). Carga los
  `watches` del usuario, construye una `OpenCallMatchView` **sintética** por
  forecast y filtra con el matcher existente (ver U3). Devuelve los forecasts que
  matchean, ordenados por ventana.

### U3 — Alertas anticipadas (Fase 2)

**Reuso del matcher.** `watchMatchesCall(watch, call)` (`shared/matching/match.ts`)
espera una `OpenCallMatchView { classificationSet, searchText, buyerId,
estimatedValue?, procurementMethodDetails? }`. Se construye una **vista sintética**
por forecast — sin tocar el matcher:

```ts
const view: OpenCallMatchView = {
  classificationSet: [...forecast.rubroAncestors,
                      ...forecast.evidenceItems.map(e => e.classificationId)],
  searchText: normalizeText([forecast.rubroLabel,
                      ...forecast.evidenceItems.map(e => e.label)].join(' ')),
  buyerId: forecast.buyerId,
  estimatedValue: forecast.expectedAmount?.p50,
  procurementMethodDetails: undefined,
};
```

Así `watch.categories` (códigos rubro) y `watch.keywords` disparan igual que con un
llamado real, y `watch.buyers` refina.

**Opt-in.** Extender `watches`: nuevo campo `anticipatedAlerts: boolean`
(default `false`) en `shared/models/watch.ts` **y** en `IWatch`
(`shared/types/monitor.ts`). Solo se consideran watches con `active:true` **y**
`anticipatedAlerts:true`.

**Fan-out.** Al terminar el job de forecast (o en un paso encadenado
`src/jobs/matching/anticipated.ts`), para cada forecast con
`confidence ≥ ALERT_THRESHOLD`, matchear contra los watches elegibles y enqueue
filas idempotentes en `notifications`.

**Cambios en `notifications` (`shared/models/notification.ts` + `INotification`):**
- Extender `NotificationType` a `'alert' | 'reminder' | 'award' | 'anticipado'`.
- `compraId`: un forecast **no tiene** compraId (el llamado no existe). Relajar el
  `required` a condicional: requerido salvo `type === 'anticipado'`. Añadir campo
  opcional `forecastId?: string` (el `_id` de `tender_forecast`).
- `dedupeKey` para anticipado:
  `anticipado:{channel}:{uid}:{buyerId}:{rubroNodeId}:{expectedWindow.start ISO}`
  → no re-alerta la misma ventana en re-corridas del job.

**Canales / anti-fatiga.**
- `inapp` (inbox): siempre, si el flag está ON.
- `push` / `telegram` / `email`: solo si `confidence ≥ ALERT_THRESHOLD`
  (umbral más alto que el de la página) — clave contra fatiga.

**Dispatchers.** Los `src/jobs/alerts/dispatch*.ts` drenan por `{status, channel}`.
Añadir una rama: si `type === 'anticipado'`, cargar el `tender_forecast` por
`forecastId` y construir la tarjeta con el builder anticipado (abajo), en vez de
cargar el `open_call` por `compraId`.

**AlertCard variante anticipada** (`shared/alerts/build-alert-content.ts`).
Extender `AlertCard` con campos opcionales `anticipated?: boolean` y
`expectedWindow?: { start: Date; end: Date }`, y añadir un builder
`buildAnticipatedCard(forecast, opts): AlertCard` que produce:
- `objeto`: "Próximo llamado probable: {rubroLabel} — {buyerName}".
- `deadline`: null (no aplica "cierra en X"); en su lugar los renderers muestran
  "esperado ~{ventana}" cuando `anticipated`.
- `url`: deep-link a `/analytics/anticipacion?buyer=…&rubro=…` (no `/llamados/…`,
  que no existiría).
- copy explícito: **"esperado, aún no publicado — estimación por patrón histórico"**.

`renderPushPayload` / `renderTelegramHtml` / `cardMetaLine` ganan una rama
`anticipated` que reemplaza la línea de deadline por la ventana esperada.

### U4 — UI

- **Pública** `app/pages/analytics/anticipacion.vue`: tabla filtrable
  (rubro/organismo/ventana). Cada fila muestra la **evidencia** (últimos eventos:
  fecha, incumbente, monto típico), la ventana esperada como **rango** ("~Q3 2026"
  / "agosto–octubre 2026"), y un badge de confianza. Entra al dropdown "Análisis"
  del nav (junto a partidos/intendencias/errores-carga). Nota de cobertura honesta
  (estilo `/analytics/partidos` y `CallBidEstimate`).
- **Personalizada:** sección "Próximos para vos" en `app/pages/app/calendario.vue`,
  alimentada por `/api/app/anticipacion/mine`. Toggle `anticipatedAlerts` por watch
  en la UI de gestión de watches.
- **Card reusable** `app/components/AnticipatedTenderCard.vue`: en `/products/{code}`
  y en el perfil de comprador — "Este organismo suele licitar este rubro cada ~N
  meses; próximo esperado ~{ventana}; último ganador: {incumbente}; monto típico
  {p50}".

## Scoring y anti-falso-positivo

- **`MIN_EVENTS = 3`** — una compra única no es recurrencia.
- **`confidence`** base `∝ 1/(1 + cvDays)` (cadencia apretada → alta; errática →
  baja/suprimida). Bonus si `procurementMethodDetails` dominante es `Licitación`
  (competitiva, recurrente) vs penalización si es mayormente `Compra Directa`
  one-off. Bonus leve por `eventCount` alto.
- **Dos umbrales:** `DISPLAY_THRESHOLD` (aparece en la página) < `ALERT_THRESHOLD`
  (dispara push/telegram/email). Valores iniciales a calibrar (p. ej. 0.35 / 0.60).
- **Supresión por ya-abierto:** si `open_calls` ya tiene un llamado vivo del grupo
  dentro de la ventana → no emitir.
- **Ventana en rango**, nunca fecha puntual.
- **Hit-rate testeable:** guardar los forecasts para poder medir, a posteriori, si
  el llamado predicho efectivamente se publicó dentro de la ventana. Métrica de
  calidad interna (y diferencial que ningún competidor publica). No bloquea el MVP.

## Cron wiring

En `src/cronserver.ts`, replicando el bloque `deptIndicatorsExpression`:

```ts
const tenderForecastExpression = "0 5 1 * *"; // mensual, tras dept-indicators
cron.schedule(tenderForecastExpression, async () => {
  try {
    this.logger.info("Starting tender-forecast refresh...");
    await this.runJobProcess("jobs/refresh-tender-forecast");
    this.logger.info("Tender-forecast refresh completed successfully");
  } catch (error) { /* log */ }
}, { scheduled: true, timezone: "America/Montevideo" });
```

Más una ruta manual `/cron/tender-forecast` (espejo de la de product-variants) para
dispararlo a demanda. Fuera de `busyWith()`.

## Honestidad de datos (caveats en la UI)

- El feed OCDS UY: **91% de `status` null**, 0 planning, 0 contracts → la señal es
  **derivada**, no leída. Copy siempre: "estimación por patrón histórico", nunca
  hecho ni fecha garantizada.
- Excluye compras centralizadas / convenios marco / prórrogas → hay rubros
  **sistemáticamente ciegos**. Mostrar cobertura.
- Monto desde `item_price_baseline` (ya reconciliado por enmiendas de adjudicación,
  ver memoria award-amendments), nunca montos crudos ni `estimatedValue`.
- Encuadre ético: **todo sale de datos 100% públicos** — reconstrucción de lo que
  el Estado ya publicó, estructurado. Sin información privilegiada.

## Verificación (repo sin tests unitarios formales)

Patrón del repo: script `tsx` de aserción + curl contra el dev server (`:3600`),
más `tsc` acotado a la raíz. Plan de verificación por fase:
- **Job:** script `tsx` que corre `refresh-tender-forecast` contra la DB live y
  asserta invariantes (todos los docs `eventCount≥3`, `expectedWindow.start >
  lastEventDate`, `confidence∈[0,1]`, dataVersion único). Spot-check de 3–5 grupos
  conocidos (rubro recurrente de una Intendencia) contra el histórico crudo.
- **Endpoints:** `curl` a `/api/analytics/anticipacion` y (autenticado)
  `/api/app/anticipacion/mine`.
- **Matcher sintético:** aserción `tsx` de que un forecast conocido matchea un watch
  con la categoría de su rubro y NO uno con categoría ajena.
- **Alertas:** enqueue idempotente (correr el fan-out dos veces → sin duplicados por
  `dedupeKey`); una fila `anticipado` renderiza en cada canal sin romper el
  dispatcher (compraId ausente).

## Plan de fases (recordatorio; este spec = Fase 1+2)

1. **Fase 1** — job + colección + endpoints + página pública + card. Solo lectura.
2. **Fase 2** — flag `anticipatedAlerts`, fan-out `anticipado`, variante AlertCard,
   sección "para vos" en calendario.
3. Fase 3 — estacionalidad fina + monto + probable ganador; encender `aiSummary`.
4. Fase 4 — vencimiento/renovación inferido (`basis: 'expiry'`).
5. Fase 5 — ingestión del PAC (`plan_anual`) → "6 meses" literal.
6. Fase 6 — onboarding por RUT + auto-watches.
