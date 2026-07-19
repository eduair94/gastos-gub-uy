# Comparativa de compras por partido — mapa + evaluación descriptiva

**Fecha:** 2026-07-19
**Estado:** diseño para aprobación
**Contexto:** extiende el overlay de mandatos políticos ([shared/political-mandates.ts](../../../shared/political-mandates.ts)) con una página de comparación departamental y un mapa coropleta.

---

## 1. Objetivo y encuadre (load-bearing)

Responder "¿cómo se ven las compras públicas de cada departamento, agrupadas por el partido que gobernó?" — como **comparación descriptiva sobre datos abiertos**, nunca como ranking de "qué partido gestiona mejor".

**Los datos NO soportan causalidad partidaria.** Por diseño:
- Es descriptivo, no evaluativo. No hay score de "buena/mala gestión".
- Los flags de anomalía son estadísticos, no corrupción probada ni responsabilidad partidaria.
- Gasto alto ≠ mala gestión (refleja tamaño/necesidad).
- Cada superficie lleva cita de fuente + disclaimer, reusando el tono del overlay de mandatos.
- **Se mantiene FUERA de las superficies de anomalías / `aiVerdict`** — es contexto, no acusación.

**No-objetivos (YAGNI):** sin scorecard partidario, sin proyección electoral, sin datos fuera del open data de compras + registro electoral público ya curado.

---

## 2. Arquitectura (visión)

```
releases (2.17M)  ──┐
                    ├─►  refresh-dept-indicators.ts  ──►  dept_indicators (colección)
anomalies (6.4k)  ──┘         (job mensual)                    │
                                                               ▼
                              /api/analytics/party-comparison.get.ts
                              (lee rollup + agrupa por partido vía mandateForBuyer)
                                                               │
                                                               ▼
                              app/pages/analytics/partidos.vue
                              ├─ MapChoropleth.vue  (SVG inline, toggle partido/métrico, selector año)
                              └─ paneles comparativos (3 vistas por partido + confounders)

app/assets/geo/uruguay-dept-paths.ts  ◄── scripts/build-uruguay-geo.mjs (1 vez, offline)
```

Cada unidad tiene un propósito único y una interfaz clara:
- **Job** → escribe el rollup. No sabe de UI ni de partidos.
- **Endpoint** → lee rollup + aplica la capa partido (determinística). No agrega sobre `releases`.
- **MapChoropleth** → componente genérico: recibe geometría + valor/color por `buyerId`, emite hover. No sabe de política.
- **Página** → orquesta, aplica encuadre y caveats.

**Por qué precompute y no live:** `buyer.id` no está indexado → toda agregación por depto es COLLSCAN de 2.17M docs. El job mensual [refresh-organism-groups.ts](../../../src/jobs/refresh-organism-groups.ts) ya resuelve esto agrupando toda la colección de una pasada con `allowDiskUse`. Copiamos el patrón. El endpoint solo lee el rollup (barato).

---

## 3. Datos: colección `dept_indicators`

Un documento por **departamento × año** (19 × ~20 años ≈ 380 docs) + filas agregadas nacionales opcionales. Compute-then-swap por `dataVersion` (igual que organism_group_stats).

```ts
// shared/models/dept_indicators.ts
interface IDeptIndicatorYear {
  buyerId: string          // '80-1' … '98-1'
  year: number             // sourceYear
  // --- volumen (ya derivable de organism_group_stats, se recomputa acá por cohesión) ---
  total: number            // Σ amount.primaryAmount (priced+capped, >0 && <=5e10)
  contracts: number        // registros priced
  totalRecords: number     // TODOS los registros del depto/año (con y sin precio)
  // --- indicador 1: método de compra ---
  directCount: number      // "Compra Directa" + "Compra por Excepción"
  tenderCount: number      // "Licitación Abreviada/Pública" + "Concurso de Precios"
  methodKnown: number      // registros con methodDetails no-null (denominador de %directa)
  // --- indicador 2: transparencia de precio ---
  pricedRecords: number    // registros con amount.hasAmounts (== contracts)
  // --- indicador 3: concentración de proveedores ---
  top5Share: number | null // Σtop5 proveedor / Σgasto del depto/año (COTA SUPERIOR — ver §5)
  supplierCount: number
  // --- indicador 4: densidad de anomalías (⚠ descriptivo) ---
  anomalyCountRank3: number // flags severityRank>=3 cuyo release ∈ este depto/año
}
```

Notas de esquema:
- `methodKnown` separado de `totalRecords` porque 69% del campo método es null globalmente ([filters.get.ts:36](../../../app/server/api/contracts/filters.get.ts)); el % directa se calcula sobre método-conocido y la cobertura se reporta aparte.
- No se guarda partido: el partido es determinístico vía `mandateForBuyer(buyerId, year)`; guardarlo duplicaría estado.

---

## 4. Job: `src/jobs/refresh-dept-indicators.ts`

Mensual (cron, hermano de refresh-organism-groups). Patrón: COLLSCAN filtrado a los 19 `INTENDENCIA_IDS` con `allowDiskUse` (igual que el fallback live de [intendencias.get.ts:77](../../../app/server/api/analytics/intendencias.get.ts)), un `$facet`:

1. **methodFacet** — `$match` deptos → `$group {buyerId, year, methodClass}` (clasifica methodDetails en direct/tender/other vía `$switch`) → conteos.
2. **priceFacet** — `$group {buyerId, year}` → `totalRecords` (todos) y `pricedRecords`/`total` (gated priced+capped).
3. **supplierFacet** — `$unwind awards` → `$unwind awards.suppliers` → `$group {buyerId, year, supplierName} sum` → en memoria: top-5 share por depto/año.
4. **anomalyStage** (separado, sobre `anomalies`) — cargar los ~6.4k flags rank>=3 (set chico), resolver `releaseId → release.buyer.id + sourceYear` (join por `releaseId` indexado sobre `release.id` único), bucketizar por depto/año. Barato.

Fold en memoria → upsert por `{buyerId, year}` → sweep stale por `dataVersion`.

Clasificación de método (única fuente, en shared/ para reuso):
```ts
// shared/procurement-method.ts
const DIRECT = ['Compra Directa', 'Compra por Excepción']
const TENDER = ['Licitación Abreviada', 'Licitación Pública', 'Concurso de Precios']
export function methodClass(details?: string): 'direct'|'tender'|'other'|'unknown'
```

---

## 5. Metodología de indicadores (definiciones exactas)

| Indicador | Fórmula | Caveat mostrado |
|---|---|---|
| Gasto per cápita | `total / poblaciónINE` (join cliente) | tamaño/necesidad, no calidad |
| Variación YoY | `(total_y − total_{y-1}) / total_{y-1}` | reporte incompleto en años recientes |
| % compra directa | `directCount / methodKnown` | 69% del país sin método declarado; cobertura mostrada aparte |
| % con precio (transparencia) | `pricedRecords / totalRecords` | bajo % = sub-reporte, NO ahorro |
| Concentración top-5 | `Σtop5 / total` | **cota superior**: el monto es por release, no prorrateado por proveedor → multi-proveedor doble-cuenta ([stats.get.ts:320](../../../app/server/api/contracts/stats.get.ts)) |
| Densidad anomalías | `anomalyCountRank3 / contracts` (por 1000) | ⚠ estadístico, no corrupción probada; sujeto a triage |

### Agregación por partido — 3 vistas explícitas (anti-distorsión de tamaño)

MVD = 37% del país y siempre FA → una suma agregada infla FA. Se muestran las tres y se explica:

- **(b) Mediana de departamentos gobernados** ← **vista por defecto**. Cada depto = 1 voto, neutral al tamaño. "El departamento mediano gobernado por PN tuvo X% compra directa."
- **(a) Suma agregada** — con etiqueta "dominado por el tamaño de MVD".
- **(c) Per-cápita ponderado** — Σgasto / Σpoblación de los deptos del partido.

### Panel de confounders (fijo, siempre visible)
MVD 37% y siempre FA · FA gobierna urbano / PN el interior rural (líneas base distintas) · términos departamentales ≠ presidenciales · N chico por partido-año · completitud de reporte varía por depto · correlación ≠ causa · flags = estadísticos.

---

## 6. Endpoint: `/api/analytics/party-comparison.get.ts`

Lee `dept_indicators`. Params: `year` (o `all`), `metric` (perCapita|directShare|priceCoverage|top5|anomalyDensity|total). Devuelve:
```ts
{
  departments: [{ buyerId, name, year, ...indicadores, party, holder }],  // party vía mandateForBuyer
  byParty: {
    [party]: { median: {...}, sum: {...}, perCapita: {...}, nDepts, population }
  },
  confounders: {...},   // constantes para el panel
  calculatedAt, source
}
```
El agrupamiento por partido usa `mandateForBuyer(buyerId, year)` (ya existe). Para `all`, se resuelve el partido por año y se pondera.

---

## 7. Mapa: coropleta SVG inline

### 7.1 Asset de geometría (offline, baked)
- Script único `scripts/build-uruguay-geo.mjs`: lee un GeoJSON de dominio público de los 19 departamentos (fuente: geoBoundaries URY ADM1 o Natural Earth, se commitea `scripts/data/uruguay-departments.source.geojson`), simplifica (topología-preservada), proyecta a coords de viewBox (Uruguay es chico → Mercator simple), emite `d` strings keyed por **nombre depto → buyerId** (join vía [uruguay-departments.ts](../../../app/utils/uruguay-departments.ts)).
- Salida commiteada: `app/assets/geo/uruguay-dept-paths.ts` →
  ```ts
  export const GEO_VIEWBOX = '0 0 800 900'
  export const DEPT_PATHS: Record<string, string>  // buyerId → SVG path d
  ```
- Sin fetch en runtime (CSP-limpio, offline). ~19 paths, pocos KB.

### 7.2 Componente `MapChoropleth.vue` (genérico, apolítico)
Props: `paths` (buyerId→d), `viewBox`, `colorFor(buyerId): string`, `labelFor(buyerId)`, `valueFor(buyerId)`. Render `<path v-for>` con `fill` = colorFor. Hover → resalta + emite `@hover(buyerId)` para tooltip externo. Leyenda por slot. Theme-able con tokens; sin dependencias externas.

Dos modos de color (los provee la página, no el componente):
- **Partido**: `mandateForBuyer(buyerId, year).partyColor` (categórico, reusa `PARTY_META`).
- **Métrico**: escala secuencial sobre el indicador elegido (celeste→gold del design system; nunca rojo=alerta salvo densidad-anomalías que sí puede usar rampa de alerta con disclaimer).

### 7.3 Layout de página `app/pages/analytics/partidos.vue`
```
[hero: título + encuadre descriptivo]
[método/caveats card]  [panel confounders]
[controls: toggle Partido|Métrico · selector métrica · selector año]
┌───────────────┬──────────────────────┐
│  MapChoropleth │  leyenda + tooltip    │
│  (SVG Uruguay) │  depto en hover:      │
│                │  partido, holder,     │
│                │  indicadores del año  │
└───────────────┴──────────────────────┘
[comparación por partido: 3 vistas (mediana/suma/percápita) — tabla + barras InvHBars]
[tabla depto×indicador, links a /buyers/{id} y /contracts filtrado]
[interconexión: /analytics/intendencias, /organismos]
```
Reusa `MandateChip`, `MandateTimeline`, `InvHBars`, `MoneyAmount`, patrones de intendencias.vue. i18n `partidos.*` + reusa `mandate.*`. Route en nav analytics.

---

## 8. Verificación (repo sin tests)
- tsx assertions: `methodClass()` sobre los strings canónicos; agregación por partido (mediana vs suma) con un fixture de 2 deptos; el join anomalía→depto.
- Job: correr `refresh-dept-indicators` contra DB live, chequear invariantes (`pricedRecords <= totalRecords`, `directCount+tenderCount <= methodKnown`, `top5Share <= 1`).
- Dev-server curl (puerto 3600): `/analytics/partidos` renderiza; `/api/analytics/party-comparison?year=2023` shape; el SVG paints 19 paths; toggle partido/métrico; hover tooltip. Sin 500, sin hydration.
- Screenshot del mapa en ambos modos.

## 9. Riesgos / caveats
- **Neutralidad** (load-bearing): copy revisado es/en; sin lenguaje de responsabilidad; fuera de anomalías. Densidad-anomalías con disclaimer reforzado y opción de ocultar.
- **top5 cota superior** — etiquetado explícito.
- **Método 69% null** — cobertura visible; deptos con baja cobertura marcados "dato parcial".
- **Geometría** — verificar que los 19 nombres del GeoJSON mapean a los 19 buyerId (join por nombre normalizado; test que cubra los 19).
- **COLLSCAN mensual** — aceptable (1×/mes, allowDiskUse); no correr en request path.
- **buyer.id sin índice** — el endpoint NUNCA agrega sobre releases; solo lee el rollup.

## 10. Fuera de alcance (fase 2+)
Auditar celdas 2020/25 vs CKAN; footnote entes en /organismos; animación temporal del mapa (timeline play); export CSV.
