# Resumen IA de pliegos (multi-proveedor) + Comparativa de servicios de alertas

**Fecha:** 2026-07-21 · **Estado:** aprobado, en implementación

Dos features relacionadas, un mismo encargo: posicionar la plataforma (gratuita, de
transparencia) frente a los servicios pagos de alertas de licitaciones, y **igualar la
función estrella de gubly** (resumen de pliegos con IA) sin costo, usando cuotas gratuitas.

- **A · Resumen IA de pliegos** — encender la función ya construida, apuntarla a claves
  gratuitas (Gemini + Groq como respaldo), priorizar qué pliegos resumir dentro del tope
  diario, y arreglar el listado de llamados que muestra licitaciones ya vencidas.
- **B · Comparativa de alertas** — página nueva que compara gubly / proveedoruy / clearbid
  (+ otros que aparezcan) de forma objetiva y con fuentes, más una recomendación editorial
  claramente marcada a favor de proveedoruy por UX + validación jurídica.

---

## Feature A — Resumen IA de pliegos, con cuotas gratuitas

### Estado actual (ya construido, apagado)

- `src/jobs/pliego/summarize.ts` — descarga los PDF del pliego, extrae texto (`unpdf`),
  pide a Gemini un resumen estructurado en español y lo cachea en `open_calls.aiSummary`.
- `app/server/api/open-calls/[compraId]/summary.get.ts` — lee el resumen cacheado (solo
  lectura; la generación vive del lado cron).
- `app/components/PliegoSummary.vue` — render completo, **apagado** con
  `AI_SUMMARY_ENABLED = false` ("deferred: costly, not ready").
- Usa `GEMINI_API_KEY` (pago). No hay cron que lo corra.

### A1 · Escalera de modelos gratuitos (rotación) con respaldo

**Hecho clave sobre cuotas:** en el tier gratuito, los límites (RPM/TPM/RPD) son **por modelo
por proyecto**, no un pozo único para toda la clave — tanto en Gemini como en Groq. Cada id de
modelo tiene su propio cupo diario. Por eso **rotar entre modelos multiplica el techo diario
efectivo**. (Salvedad: siguen existiendo topes de proyecto/abuso; en Groq el cap real suele ser
tokens-por-día por modelo. Pero modelos distintos = cupos distintos.)

Por eso el resumidor no encadena dos modelos fijos sino una **escalera ordenada** que cruza
ambos proveedores. Al chocar 429 / tope de un modelo, avanza al siguiente:

1. **Gemini** (`FREE_GEMINI_API_KEY`), lista `PLIEGO_GEMINI_MODELS`
   (default `gemini-3.0-flash-lite, gemini-2.5-flash-lite, gemini-2.0-flash-lite`).
   Cada uno: **~15 RPM · 250k TPM · 1000 RPD** propios.
2. **Groq** (`FREE_GROQ_API_KEY`), lista `PLIEGO_GROQ_MODELS`
   (default `llama-3.3-70b-versatile, llama-3.1-8b-instant, openai/gpt-oss-20b`). Compatible OpenAI.

**Algoritmo por resumen:** recorrer la escalera en orden; para cada modelo intentar la
generación. Si devuelve 429 con `retryDelay` largo (muro diario) → marcar ese modelo en
**cooldown** por el resto de la corrida del proceso y saltar al siguiente. Si es un 429/5xx
transitorio → el cliente ya reintenta con backoff. Si toda la escalera se agota → `null` (el
llamado queda sin `aiSummary` y se reintenta en la próxima corrida). El campo `model` guardado
registra **quién** lo produjo (`gemini-3.0-flash-lite`, `groq:llama-3.3-70b-versatile`, …) para
trazabilidad en DB y en el disclaimer. Un `ProviderRotator` compartido mantiene el set de
cooldowns entre llamados dentro de una misma corrida del cron (para no reintentar un modelo ya
agotado en cada pliego).

Resolución de clave: Gemini `FREE_GEMINI_API_KEY || GEMINI_API_KEY || GOOGLE_API_KEY`;
Groq `FREE_GROQ_API_KEY`.

### A2 · Mover el resumidor a `shared/` (llamable desde cron y desde la API)

Hoy el resumidor vive en `src/jobs` (CommonJS/tsx). El botón manual (A4) necesita generarlo
desde Nitro (ESM). Ambos deben compartir una sola implementación.

Mover a `shared/` (dependencias seguras para el bundle de Nitro: `fetch` global + `unpdf`,
que es de los mismos autores que Nitro):

- `shared/ai/gemini-client.ts`  (movido tal cual desde `src/jobs/ai/`)
- `shared/ai/groq-client.ts`    (nuevo — ver A1)
- `shared/ai/json-schema.ts`    (nuevo — `geminiToJsonSchema()`: convierte el `GeminiSchema`
  MAYÚSCULAS al JSON Schema minúsculas que consume el `response_format:{type:"json_schema"}`
  de Groq. **Una sola fuente de verdad de la forma del resumen**, sin duplicar el esquema.)
- `shared/ai/rotator.ts`        (nuevo — `ProviderRotator`: escalera ordenada de
  `{provider, model}` + set de cooldowns; `generateStructured(prompt, schema)` recorre la
  escalera saltando modelos en cooldown, delega en el cliente Gemini/Groq según el provider, y
  devuelve `{data, modelUsed}` o lanza si se agota. Recibe las listas por env.)
- `shared/services/pliego-extractor.ts` (movido desde `src/services/`)
- `shared/pliego/summarize.ts`  (núcleo: `summarizeOpenCall(compraId, rotator?)` usa el rotator
  A1; acepta uno inyectado para compartir cooldowns entre pliegos de una corrida)

`src/jobs/pliego/summarize.ts`, `src/jobs/pliego-summary.ts`, `src/jobs/score-anomalies-ai.ts`
y cualquier otro consumidor pasan a re-exportar / importar desde `shared/`. Agregar `unpdf`
a `app/package.json` (Nitro resuelve desde `app/node_modules`).

### A3 · Encender el render

`PliegoSummary.vue` → `AI_SUMMARY_ENABLED = true`. Los estados (con-resumen / generando /
sin-pliego / no-disponible) ya existen y quedan intactos.

### A4 · Botón manual "Resumir con IA"

En la página del llamado, cuando **no hay** resumen todavía pero **sí hay** pliego:
botón que hace `POST /api/open-calls/[compraId]/summary` (nuevo `summary.post.ts`):

- Rate-limit por IP reutilizando el limiter existente del server (keyed a `cf-connecting-ip`,
  salteando loopback SSR — mismo patrón que el resto de la API). Tope conservador por IP
  (ej. 5/min, 30/día) para proteger las 1000 RPD gratuitas.
- Genera con el resumidor compartido (A2), cachea en el doc, devuelve el resumen.
- Timeout de request + errores amables ("no pudimos generar el resumen, probá más tarde").
- Idempotente: si ya existe `aiSummary` al llegar, lo devuelve sin regenerar.

`PliegoSummary.vue` gana el estado "generar bajo demanda": botón → POST → muestra el resumen
o el error. El disclaimer indica el modelo usado.

### A5 · Cron eager priorizado

Nueva tarea en `src/cronserver.ts` (patrón `runJobProcess("jobs/pliego-summary", ["--eager"])`
+ su `CronJobStatus`), varias corridas por día. `runEager` en `pliego-summary.ts` cambia su
query a:

```
status ∈ {open, clarification, amended}
  ∧ aiSummary no existe
  ∧ documents.0 existe
  ∧ tenderPeriod.endDate ≥ ahora        // solo licitaciones aún postulables
sort: { "tenderPeriod.endDate": 1 }      // vencimiento más próximo primero (más urgente)
limit: PLIEGO_EAGER_LIMIT
```

Usa el índice compuesto ya existente `{status:1, "tenderPeriod.endDate":1}`. **Priorización:**
resume primero lo que cierra antes y todavía se puede presentar — así el presupuesto diario
se gasta en llamados accionables, nunca en vencidos.

**Respeto de cuotas gratuitas:** ritmo ~10 RPM (`AI_TRIAGE_RPM`/nuevo `PLIEGO_RPM`, < 15 RPM);
`MAX_INPUT_CHARS` 60k (~18k tokens → ~180k tokens/min a 10 RPM, bajo el techo de 250k TPM);
`PLIEGO_EAGER_LIMIT` por corrida + pocas corridas/día → total < 1000 RPD. Cuando Gemini choca
el muro diario, la cadena A1 desvía a Groq automáticamente.

### A6 · Arreglo del listado de llamados (bug "vencidas hoy")

**Causa raíz:** `app/server/api/open-calls/index.get.ts` filtra por estado vivo por defecto,
pero ordena por `tenderPeriod.endDate` ascendente. Cuando el sync todavía no pasó un llamado
de `open` a `closed` (lag de estado), su `endDate` ya pasó y el orden ascendente lo **sube al
tope** de la lista. Por eso se ven licitaciones vencidas hoy arriba de todo.

**Fix:** por defecto excluir `tenderPeriod.endDate < inicioDeHoy`. Los llamados **sin**
`endDate` se siguen mostrando (no ocultar por dato ausente). Usar `$and` con
`{ $or: [ { "tenderPeriod.endDate": { $gte: hoy } }, { "tenderPeriod.endDate": { $exists: false } } ] }`
(nunca object-spread sobre dos filtros que comparten clave punteada — se pisan; ver memoria).
Toggle opt-in "Mostrar vencidas" en `app/pages/llamados/index.vue` → query `includeExpired=1`
que saltea el filtro (o `status=all`, que ya existe). i18n es/en para el label.

### A7 · Entorno

`.env.example` documenta, con sus límites gratuitos (por modelo por proyecto):
`FREE_GEMINI_API_KEY`, `FREE_GROQ_API_KEY`, `PLIEGO_GEMINI_MODELS` (CSV),
`PLIEGO_GROQ_MODELS` (CSV), `PLIEGO_EAGER_LIMIT`, `PLIEGO_RPM`. (`PLIEGO_AI_MODEL` legacy
sigue soportado como primer modelo Gemini si está seteado.)

---

## Feature B — Comparativa de servicios de alertas de licitaciones

Recurso para proveedores del Estado: **cuál servicio pago de alertas elegir.** La plataforma
actúa de árbitro neutral (conlatuya **no** figura como columna). Objetividad primero, opinión
después y claramente marcada.

### B1 · Página

`app/pages/comparativa.vue` → ruta `/comparativa`. Entrada en el nav (front-of-bar, cerca de
`llamados`). Forma de página de contenido del repo: hero + secciones, `useSeo` (title/desc/
jsonLd es/en), i18n. Componentes Vuetify ajustados al framework: `v-table` (matriz),
`v-chip`, `v-icon`, `v-card` (tarjetas de proveedor + tarjeta de recomendación), respetando
los tokens de diseño (`var(--s-N)`, oro = dinero, escala magnitud) de `app/DESIGN.md`.

### B2 · Datos curados estáticos

`app/data/comparativa-alertas.ts` — mismo patrón que `investigaciones-empresas.ts`:
tipos bilingües (`Bi { es, en }`), docblock de objetividad, una entrada por proveedor con:

```
name, url, tagline: Bi
pricing: { plan, priceText, amount, currency, period, notes: Bi }[]
features: { emailAlerts, whatsappTelegram, aiSummary, savedSearches, mobileApp, apiAccess: TriState }
coverage: Bi          // qué fuentes monitorea (ACCE/SICE, intendencias, privados…)
legalValidation: Bi   // reclamo de validación jurídica, textual, o "ninguna"
uxNotes: Bi           // observaciones objetivas de usabilidad
sources: string[]     // URLs exactas donde se verificó cada dato
verifiedOn: string    // fecha de verificación
confidence: 'alta' | 'media' | 'baja'
```

`TriState = 'si' | 'no' | 'desconocido'` (nunca inventar; "desconocido" es un valor válido).

**Origen de los datos:** salida del workflow `uy-tender-alert-competitor-research`
(run `wf_1e1d8e5f-fe0`, 13 proveedores, con fuentes por dato). Precios no confirmables se
marcan "consultar" / `confidence: baja`. **Prohibido inventar un precio o inflar un puntaje.**

**Clasificación de los 13 proveedores hallados (define qué entra y cómo):**

- **Núcleo comparable — UY-native, alcanzables, precio público** (tabla principal):
  - **Gubly** — Gratis (3 análisis IA/mes) · Pro **USD 25 + IVA/mes** · Empresarial a medida.
    Cobertura ARCE/comprasestatales. IA de pliegos SÍ. Validación jurídica: **ninguna**.
  - **ProveedorUY** — Prueba 10 días · Monitoreo **$ 990 + IVA/mes** · Gestión **$ 1.990 + IVA/mes**
    · Enterprise consultar. SICE. IA SÍ. **Única con asesoría jurídica** (estudio Grupo Deana,
    add-on pago). Moneda **inferida UYU, no etiquetada** → rotular.
  - **ClearBid** — Free · Pro **USD 25/mes** · Premium **USD 89/mes**. OCDS de ARCE.
    IA de pliegos **NO** (inteligencia de datos/estadística). Validación jurídica: ninguna.
  - **LicitaPro** — Prueba · Inicio **USD 7/mes** · Pro **USD 19/mes** · Empresarial **USD 89/mes**
    (por créditos). IA SÍ. Jurídica: ninguna.
  - **Licita Ya** — Prueba 14 días · desde **UYU 1.900/mes** (descuentos por período).
    IA de pliegos NO (búsqueda "con IA"). API pública SÍ. Jurídica: ninguna.
  - **Des@rrollo Soluciones** — Gratis (1 inciso) · **UYU 250/mes** · **UYU 2.500/año**.
    ARCE. IA NO. Alertas email + recordatorios. Jurídica: ninguna.
- **UY-native con precio opaco / venta consultiva** (listar, marcar "Consultar"):
  - **Trexia** — sin precio en sitio (prensa: "desde US$ 50/mes"), enterprise. Módulo
    "Compras Futuro" (anticipación). IA SÍ. Atribuir el precio a **prensa**, no al sitio.
- **Agregadores regionales — Uruguay es 1 de 13-17 países, fuente UY sin nombrar** (sección aparte):
  - **LatamCompra** (precio opaco, /precios 410), **B2BTenders** (USD 5-17/mes, listados UY de
    2023), **Licitaciones Pública** (gratis, foco Colombia). Marcar cobertura UY secundaria.
- **Fuera de alcance / no verificable** (nota al pie, NO como pares en la tabla):
  - **iaLicitaciones** — plataforma **española**, **no cubre Uruguay**, precios en EUR → excluir
    de la comparación, mencionar como "no aplica a Uruguay".
  - **LICITAIA** (sitio caído/geo-bloqueado) y **LicitaMatch/Neuratek** (NXDOMAIN) —
    **no verificables**; listar solo como "no se pudo verificar", sin datos afirmados.

**Caveats de objetividad obligatorios en la página** (de `synthesis.gaps`): precios **no
comparables** entre sí (3 monedas USD/UYU/EUR, +IVA vs bruto, por-créditos vs plano, "consultar")
→ mostrar la moneda junto a cada monto, sin convertir; ProveedorUY moneda inferida; su asesoría
jurídica es add-on pago; ningún proveedor cubre verificablemente BPS ni intendencias (todo
ARCE/comprasestatales donde se nombra la fuente); cifras de volumen ("233.000+", "+750.000", etc.)
atribuidas a cada vendor, no verificadas.

### B3 · Capa objetiva

- **Matriz** (`v-table`): proveedores × dimensiones (precio, prueba gratis, alertas email,
  WhatsApp/Telegram, resumen IA, cobertura, validación jurídica, app móvil, API). Cada celda
  con su fuente enlazada. Encabezado con "Verificado <fecha>" + "¿un dato cambió? avisanos".
- **Gráfico de precios**: `ChartBlock` + `InvHBars` (barras horizontales, Chart.js del repo,
  theme-aware). Precio/mes de **planes comparables**; declarar mezcla de monedas (UYU/USD) y
  no-comparabilidad donde exista; omitir "consultar" del gráfico y notarlo.
- Opcional: barras de cobertura / cantidad de features por proveedor.

### B4 · Capa editorial (opinión, marcada)

Tarjeta distinta y rotulada **"Nuestra recomendación para PYMES"** a favor de **proveedoruy**
por UX + validación de estudio jurídico, pensada en el proveedor mayor, primerizo, que se
postula por primera vez. **Solo** apoyada en hechos que la investigación confirme (los
`provideruyStrengths` verificados). Lleva el sello:
**"Opinión propia · sin patrocinio · sin vínculo comercial"**.

### B5 · Descargos

Nota de metodología (cómo y cuándo se juntaron los precios, qué no es verificable), "cada
empresa puede pedir corrección", y la declaración de neutralidad — misma regla de objetividad
que las investigaciones del sitio. Los `gaps` no verificables de la investigación se rotulan
como tales en la página.

---

## Plan de implementación (orden)

**Fase A (no depende de la investigación) — se puede empezar ya:**

1. `shared/ai/gemini-client.ts` (mover) + `shared/ai/json-schema.ts` (`geminiToJsonSchema`).
2. `shared/ai/groq-client.ts` (nuevo, compatible OpenAI, structured).
3. `shared/services/pliego-extractor.ts` (mover) + `shared/pliego/summarize.ts` (núcleo con
   cadena Gemini→Groq). Wrappers/re-exports en `src/jobs/*`. `unpdf` a `app/package.json`.
4. `PliegoSummary.vue`: `AI_SUMMARY_ENABLED = true` + estado/botón "Resumir con IA".
5. `app/server/api/open-calls/[compraId]/summary.post.ts` (rate-limited, genera, cachea).
6. `pliego-summary.ts runEager`: query priorizada (A5) + pacing.
7. `cronserver.ts`: schedule + status del job eager.
8. `index.get.ts` (A6) filtro por defecto + toggle en `llamados/index.vue`.
9. `.env.example` (A7). Typecheck root (`npx tsc --noEmit`) + lint + assertion `tsx` para
   la cadena de proveedores (mock fetch: 429 de Gemini → cae a Groq).

**Fase B (depende de la salida de la investigación):**

10. `app/data/comparativa-alertas.ts` poblado desde el workflow.
11. `app/pages/comparativa.vue` (hero, matriz, gráficos, recomendación, descargos).
12. Nav en `app/layouts/default.vue` + i18n es/en (`comparativa.*`, `seo.comparativa.*`).
13. Verificación en dev server `:3600` (curl / navegación); build Nuxt con Node 18/20/22.

## Verificación (repo sin framework de tests)

- Typecheck root: `npx tsc --noEmit`. Lint: `npx eslint src shared scripts tests`.
- Assertion `tsx` en `tests/unit/` para la cadena de proveedores IA (fetch mockeado).
- Chequeos vivos: `curl` al dev server `:3600` (el entorno de build puede estar roto mientras
  corre el server).

## Riesgos / trampas

- `gemini-3.0-flash-lite` puede no existir aún con ese id exacto → env-overridable + fallback
  a `2.5-flash-lite`; verificar que resuelve antes de confiar en el cron.
- Mover módulos a `shared/`: confirmar que `unpdf` bundlea en Nitro (es unjs, debería) y no
  entra al bundle cliente (solo se usa en rutas server).
- 250k TPM: si a 10 RPM con inputs de 60k chars se acerca al techo, bajar RPM o input.
- Comparativa: riesgo legal/reputacional. Hechos con fuente y fecha; opinión separada y
  rotulada; sin patrocinio declarado. Nunca un dato sin verificar presentado como cierto.
- `$and` para filtros que comparten clave punteada (no object-spread — se pisan).
- Concurrencia: ramas compartidas en un solo working tree; stage explícito, nunca `git add -A`.
