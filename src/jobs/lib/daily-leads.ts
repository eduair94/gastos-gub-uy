/**
 * Los ocho carriles que producen una pista para la nota diaria.
 *
 * UNA PISTA NO ES UNA NOTA. Es un sujeto medido: un organismo, un proveedor, un rubro o una
 * compra, con su número, su ventana y los ocid que lo sostienen. El trabajo elige una pista,
 * la escribe y la verifica. Acá sólo se mide.
 *
 * LA NORMA DE CADA CARRIL ESTÁ ESCRITA A MANO Y NO LA GENERA EL MODELO. Un modelo que
 * redacta también la cita legal inventa artículos que suenan bien, y una cita legal falsa en
 * una nota sobre dinero público es el peor defecto posible. Acá la norma es un dato del
 * carril; el modelo sólo escribe prosa alrededor de hechos y de una norma que ya vienen dados.
 *
 * NINGÚN CARRIL AFIRMA UN INCUMPLIMIENTO. Varios miden cosas que son perfectamente legales
 * —gastar más un mes, ganar una licitación siendo nuevo, reiterar un gasto observado—. Lo que
 * publican es la medición y la pregunta que abre, nunca el veredicto.
 *
 * COSTO. Todo carril filtra por fecha primero, para que trabaje el índice `{tag:1, date:-1}`.
 * `buyer.id` NO tiene índice en este corpus: se agrupa por él sólo después de que la ventana
 * de fechas ya recortó el conjunto.
 */
import { AnomalyModel } from "../../../shared/models/anomaly";
import { CallBiddersModel } from "../../../shared/models/call_bidders";
import { mongoose } from "../../../shared/connection/database";
import { ReleaseModel } from "../../../shared/models/release";
import type { DailyLane, IDailyFact, IDailyQuery } from "../../../shared/types/daily-investigation";

/**
 * `reiteracion_docs` y `derived_casos` se leen por acceso directo a la colección, sin modelo.
 *
 * POR QUÉ. Las dos colecciones tienen datos en producción, pero los modelos que las declaran
 * viven en una rama todavía sin mergear. Importarlos ataría este trabajo a esa rama y lo
 * rompería en `master`. El acceso directo funciona en las dos y no arrastra nada.
 *
 * El carril que las usa se salta solo cuando la colección no existe.
 */
async function rawCollection(name: string): Promise<import("mongodb").Collection | null> {
  const db = mongoose.connection.db;
  if (!db) return null;
  const found = await db.listCollections({ name }).toArray();
  return found.length ? db.collection(name) : null;
}

/** El techo de plausibilidad del repo. Arriba de esto el monto es un artefacto de carga. */
const MAX_PLAUSIBLE_UYU = Number(process.env.ANALYTICS_MAX_RELEASE_UYU || 50_000_000_000);
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Lead {
  lane: DailyLane;
  /** Identifica al SUJETO. Es la clave de deduplicación. */
  subjectKey: string;
  subjectLabel: string;
  /** Para ordenar candidatas. Mayor primero. */
  score: number;
  amountUyu: number;
  contractCount: number;
  periodFrom: Date;
  periodTo: Date;
  facts: IDailyFact[];
  query: IDailyQuery;
  ocids: string[];
  /** La norma que el hecho pondría en juego. Escrita a mano por carril. */
  norm: string;
  normCite: string;
  /**
   * El organismo cuyo nombre se puede buscar en prensa, o null.
   *
   * NUNCA UN PROVEEDOR. shared/news-search.ts lo midió: buscar prensa por empresa devuelve
   * choques de motos en Cuba para «MOTOCICLO» y tokens cripto para «TA TA». Atribuirle eso a
   * una importadora uruguaya sería fabricar la asociación.
   */
  pressOrganism: string | null;
  reproduce: string;
}

/**
 * El método y el título del llamado, buscados en la etapa que los tiene.
 *
 * VERIFICADO SOBRE EL CORPUS (2026-08-17): los releases con `tag:'award'` traen
 * `tender: null` ENTERO. Ni `procurementMethodDetails` ni `procurementMethod` ni el título.
 * Los 45.696 awards de 2026 tienen cero. Los 15.754 `tender` los tienen todos.
 *
 * Dos carriles de este archivo devolvían cero pistas por preguntarle el método a la
 * adjudicación. El método hay que buscarlo en la etapa `tender` del MISMO ocid.
 */
async function tenderStageOf(ocid: string): Promise<{ method: string; title: string } | null> {
  const doc = await ReleaseModel.findOne(
    { ocid, "tender.procurementMethodDetails": { $nin: [null, ""] } },
    { "tender.procurementMethodDetails": 1, "tender.title": 1 },
  ).sort({ date: -1 }).lean() as { tender?: { procurementMethodDetails?: string; title?: string } } | null;
  if (!doc?.tender?.procurementMethodDetails) return null;
  return { method: doc.tender.procurementMethodDetails, title: doc.tender.title ?? "" };
}

/**
 * Un decimal en español rioplatense: coma, no punto.
 *
 * Los hechos medidos se muestran tal cual en la página, así que un «57.4×» acá sale publicado
 * con la convención inglesa. El verificador sólo mira la prosa del modelo; estas cadenas las
 * arma este archivo y son responsabilidad suya.
 */
function dec(x: number, digits = 1): string {
  return x.toFixed(digits).replace(".", ",");
}

function money(uyu: number): string {
  if (uyu >= 1e9) return `$ ${dec(uyu / 1e9)} mil millones`;
  if (uyu >= 1e6) return `$ ${dec(uyu / 1e6)} millones`;
  return `$ ${Math.round(uyu).toLocaleString("es-UY")}`;
}

function pct(x: number): string {
  return `${dec(x * 100)}%`;
}

/**
 * Suma el monto de cada COMPRA una sola vez después de un `$unwind`.
 *
 * LA TRAMPA QUE ESTO EVITA, y que ya rompió una medición de este archivo: al desplegar
 * `awards.items` un release con diez líneas produce diez documentos, y `$sum` sobre
 * `amount.primaryAmount` cuenta su monto diez veces. Un rubro de bioquímica clínica salió
 * con 64.831.787.822 pesos, unas 40 veces su valor real.
 *
 * La forma correcta: juntar el par (ocid, monto) en un `$addToSet` —que deduplica por el
 * objeto entero, y el par es estable por release— y recién ahí sumar.
 */
const SUM_DISTINCT_OCID = {
  $reduce: { input: "$pairs", initialValue: 0, in: { $add: ["$$value", "$$this.a"] } },
};
const PAIR_PUSH = { $addToSet: { o: "$ocid", a: "$amount.primaryAmount" } };

function slugSubject(...parts: (string | number | null | undefined)[]): string {
  return parts
    .filter(p => p !== null && p !== undefined && p !== "")
    .join(":")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9:]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/**
 * La clave de UNA empresa, no de una de sus grafías.
 *
 * El corpus guarda el mismo RUT de varias formas («R/214535370019», «214535370019»). Agrupar
 * por el id crudo parte una empresa en varias, y cada pedazo subcuenta. Los dígitos son lo
 * único estable. Es la misma función que usa build-derived-casos.
 */
function claveProveedor(supplierId: string, name: string): string {
  const digits = String(supplierId ?? "").replace(/\D/g, "");
  if (digits.length >= 8) return `rut:${digits}`;
  return `name:${String(name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
}

// ── Carril 1 · el mes de un organismo contra su propia mediana ───────────────

/**
 * NO MIDE UN INCUMPLIMIENTO. Un organismo puede gastar diez veces su mediana en un mes por
 * razones enteramente normales: una obra, una compra anual, una emergencia. Lo que publica la
 * nota es el salto y la pregunta de qué lo explica.
 */
const NORM_PICO = {
  norm: "Ninguna norma se incumple por concentrar gasto en un mes. Lo que el salto abre es una "
    + "pregunta sobre el procedimiento elegido: el monto de la contratación es lo que determina "
    + "qué procedimiento corresponde, y un mes atípico suele contener la compra más grande del año.",
  normCite: "TOCAF, artículo 33 — define qué procedimiento de contratación corresponde según el monto.",
};

export async function leadsPicoOrganismo(now: Date): Promise<Lead[]> {
  const windowEnd = now;
  const windowStart = new Date(now.getTime() - 30 * DAY_MS);
  const baselineStart = new Date(now.getTime() - 730 * DAY_MS);

  const rows = await ReleaseModel.aggregate<{
    _id: string;
    buyerName: string;
    recent: number;
    recentCount: number;
    monthly: number[];
    ocids: string[];
  }>([
    {
      $match: {
        tag: "award",
        date: { $gte: baselineStart, $lt: windowEnd },
        "amount.hasAmounts": true,
        "amount.primaryAmount": { $gt: 0, $lte: MAX_PLAUSIBLE_UYU },
        "buyer.name": { $nin: [null, ""] },
      },
    },
    // Un ocid puede publicar más de un award. El último registro representa la compra.
    { $sort: { date: -1, _id: -1 } },
    { $group: { _id: "$ocid", doc: { $first: "$$ROOT" } } },
    { $replaceWith: "$doc" },
    {
      $group: {
        _id: { buyer: "$buyer.name", month: { $dateToString: { format: "%Y-%m", date: "$date", timezone: "America/Montevideo" } } },
        buyerName: { $first: "$buyer.name" },
        total: { $sum: "$amount.primaryAmount" },
        n: { $sum: 1 },
        recentOcids: {
          $push: { $cond: [{ $gte: ["$date", windowStart] }, { ocid: "$ocid", amount: "$amount.primaryAmount" }, "$$REMOVE"] },
        },
        isRecent: { $max: { $cond: [{ $gte: ["$date", windowStart] }, 1, 0] } },
      },
    },
    {
      $group: {
        _id: "$_id.buyer",
        buyerName: { $first: "$buyerName" },
        monthly: { $push: "$total" },
        recent: { $sum: { $cond: [{ $eq: ["$isRecent", 1] }, "$total", 0] } },
        recentCount: { $sum: { $cond: [{ $eq: ["$isRecent", 1] }, "$n", 0] } },
        ocids: { $push: { $cond: [{ $eq: ["$isRecent", 1] }, "$recentOcids", "$$REMOVE"] } },
      },
    },
    { $match: { recent: { $gte: 5_000_000 }, "monthly.12": { $exists: true } } },
    { $limit: 400 },
  ]).allowDiskUse(true);

  const out: Lead[] = [];
  for (const row of rows) {
    const months = [...row.monthly].sort((a, b) => a - b);
    if (months.length < 13) continue;
    const median = months[Math.floor(months.length / 2)] ?? 0;
    if (median <= 0) continue;
    const ratio = row.recent / median;
    if (ratio < 4) continue;

    const flat = (row.ocids as unknown as Array<Array<{ ocid: string; amount: number }>>)
      .flat()
      .sort((a, b) => b.amount - a.amount);
    const topOcids = flat.slice(0, 12).map(o => o.ocid);

    out.push({
      lane: "pico-organismo",
      subjectKey: slugSubject("organismo", row.buyerName),
      subjectLabel: row.buyerName,
      score: Math.min(ratio, 60) * Math.log10(Math.max(row.recent, 10)),
      amountUyu: row.recent,
      contractCount: row.recentCount,
      periodFrom: windowStart,
      periodTo: windowEnd,
      facts: [
        { label: "Adjudicado en los últimos 30 días", value: money(row.recent), raw: Math.round(row.recent), provenance: "releases.amount.primaryAmount, tag award, un registro por ocid" },
        { label: "Mediana mensual de los 24 meses previos", value: money(median), raw: Math.round(median), provenance: `mediana de ${months.length} meses con gasto del mismo organismo` },
        { label: "Veces la mediana", value: `${dec(ratio)}×`, raw: Number(ratio.toFixed(1)), provenance: "cociente entre las dos filas anteriores" },
        { label: "Adjudicaciones en la ventana", value: String(row.recentCount), raw: row.recentCount, provenance: "cantidad de ocid distintos con award en los últimos 30 días" },
      ],
      query: { buyers: [row.buyerName], yearFrom: windowStart.getUTCFullYear(), yearTo: windowEnd.getUTCFullYear() },
      ocids: topOcids,
      ...NORM_PICO,
      pressOrganism: row.buyerName,
      reproduce: `npx tsx src/jobs/daily-investigation.ts --lane=pico-organismo --dry-run`,
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 25);
}

// ── Carril 2 · proveedor que entra grande ────────────────────────────────────

const NORM_NUEVO = {
  norm: "Ganar la primera adjudicación no es irregular y no requiere antecedentes: el registro "
    + "único de proveedores habilita a cualquier empresa inscripta. Lo que la medición abre es "
    + "una pregunta sobre el procedimiento por el que se eligió, no sobre la empresa.",
  normCite: "TOCAF, artículo 33 — define qué procedimiento corresponde según el monto de la contratación.",
};

export async function leadsProveedorNuevo(now: Date): Promise<Lead[]> {
  const windowStart = new Date(now.getTime() - 45 * DAY_MS);

  const recent = await ReleaseModel.aggregate<{
    _id: string;
    name: string;
    supplierId: string;
    total: number;
    n: number;
    ocids: string[];
    buyers: string[];
    firstDate: Date;
  }>([
    {
      $match: {
        tag: "award",
        date: { $gte: windowStart, $lte: now },
        "amount.hasAmounts": true,
        "amount.primaryAmount": { $gt: 3_000_000, $lte: MAX_PLAUSIBLE_UYU },
      },
    },
    { $sort: { date: -1, _id: -1 } },
    { $group: { _id: "$ocid", doc: { $first: "$$ROOT" } } },
    { $replaceWith: "$doc" },
    { $unwind: "$awards" },
    { $unwind: "$awards.suppliers" },
    { $match: { "awards.suppliers.id": { $nin: [null, ""] } } },
    {
      $group: {
        _id: "$awards.suppliers.id",
        name: { $first: "$awards.suppliers.name" },
        total: { $sum: "$amount.primaryAmount" },
        n: { $sum: 1 },
        ocids: { $addToSet: "$ocid" },
        buyers: { $addToSet: "$buyer.name" },
        firstDate: { $min: "$date" },
      },
    },
    { $match: { total: { $gte: 5_000_000 } } },
    { $sort: { total: -1 } },
    { $limit: 120 },
    { $addFields: { supplierId: "$_id" } },
  ]).allowDiskUse(true);

  const out: Lead[] = [];
  for (const row of recent) {
    // ¿Existía antes de la ventana? Usa el índice {awards.suppliers.id:1, date:-1}.
    const before = await ReleaseModel.countDocuments({
      "awards.suppliers.id": row.supplierId,
      date: { $lt: windowStart },
    }).limit(1);
    if (before > 0) continue;

    const priorAny = await ReleaseModel.countDocuments({ "awards.suppliers.id": row.supplierId }).limit(200);

    out.push({
      lane: "proveedor-nuevo",
      subjectKey: slugSubject("proveedor", claveProveedor(row.supplierId, row.name)),
      subjectLabel: row.name,
      score: Math.log10(Math.max(row.total, 10)) * 12,
      amountUyu: row.total,
      contractCount: row.n,
      periodFrom: windowStart,
      periodTo: now,
      facts: [
        { label: "Adjudicado a la empresa en su primera aparición", value: money(row.total), raw: Math.round(row.total), provenance: "releases.amount.primaryAmount sumado por awards.suppliers.id" },
        { label: "Adjudicaciones", value: String(row.n), raw: row.n, provenance: "ocid distintos con award a esta empresa" },
        { label: "Registros previos de la empresa en el corpus", value: String(Math.max(priorAny - row.n, 0)), raw: Math.max(priorAny - row.n, 0), provenance: "conteo sobre awards.suppliers.id anterior a la ventana" },
        { label: "Organismos que le compraron", value: String(row.buyers.filter(Boolean).length), raw: row.buyers.filter(Boolean).length, provenance: "buyer.name distintos en la ventana" },
      ],
      query: { supplierIds: [row.supplierId] },
      ocids: row.ocids.slice(0, 12),
      ...NORM_NUEVO,
      // Prensa por proveedor está PROHIBIDA (ver el comentario del tipo Lead). Se busca por
      // el organismo comprador, que sí produce señal.
      pressOrganism: row.buyers.filter(Boolean)[0] ?? null,
      reproduce: `npx tsx src/jobs/daily-investigation.ts --lane=proveedor-nuevo --dry-run`,
    });
    if (out.length >= 20) break;
  }
  return out.sort((a, b) => b.score - a.score);
}

// ── Carril 3 · un proveedor concentra un rubro ───────────────────────────────

const NORM_CONCENTRACION = {
  norm: "Concentrar un rubro no es por sí solo una infracción: puede reflejar un mercado con un "
    + "solo proveedor capaz. La ley de defensa de la competencia sí prohíbe acordar o coordinar "
    + "ofertas entre competidores, y esa es una conducta distinta que esta medición no observa.",
  normCite: "Ley 18.159, artículo 4º BIS, numeral 4 — incorporado por la Ley 19.833 de 2019. Lo investiga la Comisión de Promoción y Defensa de la Competencia.",
};

export async function leadsConcentracionRubro(now: Date): Promise<Lead[]> {
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "America/Montevideo", year: "numeric" }).format(now));
  const from = new Date(Date.UTC(year, 0, 1) + 3 * 60 * 60 * 1000);

  const rows = await ReleaseModel.aggregate<{
    _id: { code: string; supplier: string };
    codeDesc: string;
    supplierName: string;
    supplierTotal: number;
    n: number;
    ocids: string[];
  }>([
    {
      $match: {
        tag: "award",
        date: { $gte: from, $lte: now },
        "amount.hasAmounts": true,
        "amount.primaryAmount": { $gt: 0, $lte: MAX_PLAUSIBLE_UYU },
      },
    },
    { $sort: { date: -1, _id: -1 } },
    { $group: { _id: "$ocid", doc: { $first: "$$ROOT" } } },
    { $replaceWith: "$doc" },
    { $unwind: "$awards" },
    { $unwind: "$awards.items" },
    { $match: { "awards.items.classification.id": { $nin: [null, ""] } } },
    { $unwind: "$awards.suppliers" },
    {
      $group: {
        _id: { code: "$awards.items.classification.id", supplier: "$awards.suppliers.id" },
        codeDesc: { $first: "$awards.items.classification.description" },
        supplierName: { $first: "$awards.suppliers.name" },
        pairs: PAIR_PUSH,
        ocids: { $addToSet: "$ocid" },
      },
    },
    { $addFields: { supplierTotal: SUM_DISTINCT_OCID, n: { $size: "$ocids" } } },
    { $match: { supplierTotal: { $gte: 8_000_000, $lte: MAX_PLAUSIBLE_UYU } } },
    {
      $group: {
        _id: "$_id.code",
        codeDesc: { $first: "$codeDesc" },
        codeTotal: { $sum: "$supplierTotal" },
        suppliers: { $push: { name: "$supplierName", id: "$_id.supplier", total: "$supplierTotal", n: "$n", ocids: "$ocids" } },
      },
    },
    { $match: { "suppliers.1": { $exists: true } } },
    { $limit: 500 },
  ]).allowDiskUse(true);

  const out: Lead[] = [];
  for (const row of rows as unknown as Array<{ _id: string; codeDesc: string; codeTotal: number; suppliers: Array<{ name: string; id: string; total: number; n: number; ocids: string[] }> }>) {
    const sorted = [...row.suppliers].sort((a, b) => b.total - a.total);
    const top = sorted[0];
    if (!top || row.codeTotal <= 0) continue;
    const share = top.total / row.codeTotal;
    if (share < 0.8 || sorted.length < 3) continue;

    out.push({
      lane: "concentracion-rubro",
      subjectKey: slugSubject("rubro", row._id, claveProveedor(top.id, top.name)),
      subjectLabel: `${row.codeDesc ?? row._id} · ${top.name}`,
      score: share * Math.log10(Math.max(row.codeTotal, 10)) * 14,
      amountUyu: top.total,
      contractCount: top.n,
      periodFrom: from,
      periodTo: now,
      facts: [
        { label: `Adjudicado a ${top.name} en el rubro, ${year}`, value: money(top.total), raw: Math.round(top.total), provenance: "releases.amount.primaryAmount por awards.items.classification.id" },
        { label: "Total del rubro en el año", value: money(row.codeTotal), raw: Math.round(row.codeTotal), provenance: "suma de todos los proveedores del mismo código; una compra con más de un adjudicatario suma a cada uno, lo que subestima la participación y nunca la exagera" },
        { label: "Participación de la empresa", value: pct(share), raw: Number((share * 100).toFixed(1)), provenance: "cociente entre las dos filas anteriores" },
        { label: "Empresas que vendieron el rubro", value: String(sorted.length), raw: sorted.length, provenance: "proveedores distintos con adjudicación en el código" },
        { label: "Código de catálogo", value: String(row._id), provenance: "awards.items.classification.id (catálogo SICE)" },
      ],
      query: { categoryId: [String(row._id)], yearFrom: year, yearTo: year },
      ocids: top.ocids.slice(0, 12),
      ...NORM_CONCENTRACION,
      pressOrganism: null,
      reproduce: `npx tsx src/jobs/daily-investigation.ts --lane=concentracion-rubro --dry-run`,
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 25);
}

// ── Carril 4 · alerta de precio que la revisión automática no pudo explicar ──

const NORM_ANOMALIA = {
  norm: "Una alerta estadística no prueba irregularidad y no basta para afirmar sobrepago: el "
    + "precio unitario puede diferir por unidad de medida, por calidad o por plazo de entrega. "
    + "Lo que la medición señala es un precio fuera del rango histórico del mismo artículo.",
  normCite: "TOCAF, artículo 33 — define qué procedimiento corresponde según el monto. La razonabilidad del precio la evalúa el ordenador del gasto.",
};

export async function leadsAnomaliaSinExplicar(now: Date): Promise<Lead[]> {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const rows = await AnomalyModel.find({
    "aiVerdict.explainable": "no",
    firstDetectedAt: { $gte: since },
    severityRank: { $gte: 3 },
  })
    .sort({ severityRank: -1, firstDetectedAt: -1 })
    .limit(60)
    .lean();

  const out: Lead[] = [];
  for (const a of rows as unknown as Array<Record<string, any>>) {
    const supplierName = a.metadata?.supplierName ?? null;
    const buyerName = a.metadata?.buyerName ?? null;
    const item = a.metadata?.itemDescription ?? a.description ?? "artículo sin descripción";
    const release = await ReleaseModel.findOne({ id: a.releaseId }, { ocid: 1, "buyer.name": 1 }).lean() as { ocid?: string; buyer?: { name?: string } } | null;
    const ocid = release?.ocid;
    if (!ocid) continue;

    out.push({
      lane: "anomalia-sin-explicar",
      subjectKey: slugSubject("anomalia", ocid),
      subjectLabel: `${item}${supplierName ? ` · ${supplierName}` : ""}`,
      score: (a.severityRank ?? 0) * 10 + Math.min(Number(a.metadata?.zScore ?? 0), 20),
      amountUyu: Number(a.detectedValue ?? 0),
      contractCount: 1,
      periodFrom: since,
      periodTo: now,
      facts: [
        { label: "Precio unitario detectado", value: money(Number(a.detectedValue ?? 0)), raw: Number(a.detectedValue ?? 0), provenance: "anomalies.detectedValue" },
        { label: "Rango esperado del mismo artículo", value: `${money(Number(a.expectedRange?.min ?? 0))} – ${money(Number(a.expectedRange?.max ?? 0))}`, provenance: "anomalies.expectedRange, construido sobre item_price_baselines" },
        { label: "Severidad", value: String(a.severity ?? ""), raw: a.severityRank ?? 0, provenance: "anomalies.severity / severityRank" },
        { label: "Revisión automática", value: "no pudo explicarlo", provenance: "anomalies.aiVerdict.explainable = 'no'" },
      ],
      query: { ocids: [ocid], allStages: true },
      ocids: [ocid],
      ...NORM_ANOMALIA,
      pressOrganism: buyerName ?? release?.buyer?.name ?? null,
      reproduce: `npx tsx src/jobs/daily-investigation.ts --lane=anomalia-sin-explicar --dry-run`,
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 20);
}

// ── Carril 5 · licitación con una sola oferta ────────────────────────────────

const NORM_UNICO = {
  norm: "Ninguna norma se incumple por recibir una sola oferta. Es el primero de los indicadores "
    + "de riesgo que usan los organismos de control en el mundo, y lo que abre es una pregunta "
    + "sobre el pliego y el plazo, no un expediente.",
  normCite: "TOCAF, artículo 33 — define cuándo corresponde cada procedimiento de contratación.",
};

export async function leadsOferenteUnico(now: Date): Promise<Lead[]> {
  const since = new Date(now.getTime() - 60 * DAY_MS);
  // MEDIDO: limitar a los 200 sondeos más nuevos devolvía CERO pistas. La cola reciente de
  // call_bidders es casi toda Compra Directa, y este carril sólo mira los procedimientos que
  // existen para producir competencia. Hay que recorrer bastante más para juntar veinte.
  const rows = await CallBiddersModel.find({ found: true, count: 1, probedAt: { $gte: since } })
    .sort({ probedAt: -1 })
    .limit(900)
    .lean() as unknown as Array<Record<string, any>>;

  const out: Lead[] = [];
  for (const cb of rows) {
    // El método vive en la etapa `tender`; el monto, en la `award`. Hay que leer las dos.
    const stage = await tenderStageOf(cb.ocid);
    if (!stage) continue;
    // Sólo los procedimientos que EXISTEN para producir competencia. Una compra directa con
    // un solo oferente no dice nada: es su forma normal.
    if (!/licitaci|concurso/i.test(stage.method)) continue;

    const release = await ReleaseModel.findOne(
      { ocid: cb.ocid, tag: "award", "amount.hasAmounts": true },
      { ocid: 1, "buyer.name": 1, "amount.primaryAmount": 1, date: 1 },
    ).sort({ date: -1 }).lean() as Record<string, any> | null;
    if (!release) continue;

    const method = stage.method;
    const amount = Number(release.amount?.primaryAmount ?? 0);
    if (!(amount > 1_000_000) || amount > MAX_PLAUSIBLE_UYU) continue;

    out.push({
      lane: "oferente-unico",
      subjectKey: slugSubject("oferente-unico", cb.ocid),
      subjectLabel: stage.title || String(cb.ocid),
      score: Math.log10(Math.max(amount, 10)) * 11,
      amountUyu: amount,
      contractCount: 1,
      periodFrom: since,
      periodTo: now,
      facts: [
        { label: "Procedimiento", value: String(method), provenance: "releases.tender.procurementMethodDetails" },
        { label: "Ofertas publicadas", value: "1", raw: 1, provenance: "call_bidders.count, leído del bloque «Proveedores participantes» de la ficha oficial" },
        { label: "Monto adjudicado", value: money(amount), raw: Math.round(amount), provenance: "releases.amount.primaryAmount" },
        { label: "Organismo", value: String(release.buyer?.name ?? "sin dato"), provenance: "releases.buyer.name" },
      ],
      query: { ocids: [cb.ocid], allStages: true },
      ocids: [cb.ocid],
      ...NORM_UNICO,
      pressOrganism: release.buyer?.name ?? null,
      reproduce: `npx tsx src/jobs/daily-investigation.ts --lane=oferente-unico --dry-run`,
    });
    if (out.length >= 20) break;
  }
  return out.sort((a, b) => b.score - a.score);
}

// ── Carril 6 · el precio de un artículo salta de un año al otro ──────────────

const NORM_SALTO = {
  norm: "Ninguna norma fija el precio de un artículo, y un salto interanual puede reflejar "
    + "inflación, tipo de cambio, cambio de unidad de medida o un producto distinto bajo el "
    + "mismo código. La medición compara medianas del mismo código de catálogo, nada más.",
  normCite: "TOCAF, artículo 33 — la razonabilidad del precio la evalúa el ordenador del gasto en cada contratación.",
};

export async function leadsSaltoPrecio(now: Date): Promise<Lead[]> {
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "America/Montevideo", year: "numeric" }).format(now));
  const prev = year - 1;

  const rows = await ReleaseModel.aggregate<{
    _id: string;
    desc: string;
    cur: number[];
    prevYear: number[];
    ocids: string[];
    total: number;
  }>([
    {
      $match: {
        tag: "award",
        sourceYear: { $in: [prev, year] },
        "amount.hasAmounts": true,
        "amount.primaryAmount": { $gt: 0, $lte: MAX_PLAUSIBLE_UYU },
      },
    },
    { $sort: { date: -1, _id: -1 } },
    { $group: { _id: "$ocid", doc: { $first: "$$ROOT" } } },
    { $replaceWith: "$doc" },
    { $unwind: "$awards" },
    { $unwind: "$awards.items" },
    {
      $match: {
        "awards.items.classification.id": { $nin: [null, ""] },
        "awards.items.unit.value.amount": { $gt: 0 },
      },
    },
    {
      $group: {
        _id: "$awards.items.classification.id",
        desc: { $first: "$awards.items.classification.description" },
        cur: { $push: { $cond: [{ $eq: ["$sourceYear", year] }, "$awards.items.unit.value.amount", "$$REMOVE"] } },
        prevYear: { $push: { $cond: [{ $eq: ["$sourceYear", prev] }, "$awards.items.unit.value.amount", "$$REMOVE"] } },
        ocids: { $addToSet: { $cond: [{ $eq: ["$sourceYear", year] }, "$ocid", "$$REMOVE"] } },
        pairs: { $addToSet: { $cond: [{ $eq: ["$sourceYear", year] }, { o: "$ocid", a: "$amount.primaryAmount" }, "$$REMOVE"] } },
      },
    },
    { $addFields: { total: SUM_DISTINCT_OCID } },
    { $match: { "cur.9": { $exists: true }, "prevYear.9": { $exists: true }, total: { $gte: 5_000_000, $lte: MAX_PLAUSIBLE_UYU } } },
    { $limit: 600 },
  ]).allowDiskUse(true);

  const median = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] ?? 0;
  };

  const out: Lead[] = [];
  for (const row of rows) {
    const a = median(row.prevYear);
    const b = median(row.cur);
    if (a <= 0 || b <= 0) continue;
    const ratio = b / a;
    if (ratio < 2.5) continue;

    out.push({
      lane: "salto-precio",
      subjectKey: slugSubject("precio", row._id, String(year)),
      subjectLabel: row.desc ?? String(row._id),
      score: Math.min(ratio, 25) * Math.log10(Math.max(row.total, 10)) * 2,
      amountUyu: row.total,
      contractCount: row.cur.length,
      periodFrom: new Date(Date.UTC(prev, 0, 1)),
      periodTo: now,
      facts: [
        { label: `Precio unitario mediano ${prev}`, value: money(a), raw: Math.round(a), provenance: `mediana de ${row.prevYear.length} líneas del mismo código` },
        { label: `Precio unitario mediano ${year}`, value: money(b), raw: Math.round(b), provenance: `mediana de ${row.cur.length} líneas del mismo código` },
        { label: "Variación", value: `${dec(ratio)}×`, raw: Number(ratio.toFixed(1)), provenance: "cociente entre las dos medianas" },
        { label: "Código de catálogo", value: String(row._id), provenance: "awards.items.classification.id (catálogo SICE)" },
      ],
      query: { categoryId: [String(row._id)], yearFrom: prev, yearTo: year },
      ocids: row.ocids.slice(0, 12),
      ...NORM_SALTO,
      pressOrganism: null,
      reproduce: `npx tsx src/jobs/daily-investigation.ts --lane=salto-precio --dry-run`,
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 25);
}

// ── Carril 7 · el Tribunal de Cuentas observó y el organismo pagó igual ──────

const NORM_REITERACION = {
  norm: "Reiterar un gasto observado es un acto previsto por la ley: el ordenador puede "
    + "disponerlo bajo su responsabilidad. Observado no quiere decir ilegal. Lo que la medición "
    + "muestra es que el control previo se pronunció en contra y el gasto se ejecutó igual.",
  normCite: "TOCAF, artículo 114 — habilita al ordenador a reiterar el gasto observado bajo su responsabilidad.",
};

export async function leadsReiteracionNueva(now: Date): Promise<Lead[]> {
  const since = new Date(now.getTime() - 45 * DAY_MS);
  const col = await rawCollection("reiteracion_docs");
  if (!col) return [];
  const rows = await col.find({
    observed: true,
    fetchedAt: { $gte: since },
    primaryAmount: { $gt: 2_000_000, $lte: MAX_PLAUSIBLE_UYU },
  })
    .sort({ primaryAmount: -1 })
    .limit(60)
    .toArray() as unknown as Array<Record<string, any>>;

  return rows.map((r): Lead => ({
    lane: "reiteracion-nueva",
    subjectKey: slugSubject("reiteracion", r.ocid),
    subjectLabel: `${r.buyerName ?? "organismo sin dato"} · ${(r.supplierNames ?? [])[0] ?? "proveedor sin dato"}`,
    score: Math.log10(Math.max(Number(r.primaryAmount ?? 0), 10)) * 13,
    amountUyu: Number(r.primaryAmount ?? 0),
    contractCount: 1,
    periodFrom: since,
    periodTo: now,
    facts: [
      { label: "Monto de la compra reiterada", value: money(Number(r.primaryAmount ?? 0)), raw: Math.round(Number(r.primaryAmount ?? 0)), provenance: "reiteracion_docs.primaryAmount" },
      { label: "Organismo", value: String(r.buyerName ?? "sin dato"), provenance: "reiteracion_docs.buyerName" },
      { label: "Resolución", value: String(r.resolutionNumber ?? "sin número en el documento"), provenance: "reiteracion_docs.resolutionNumber, leído del documento oficial" },
      ...(r.reason ? [{ label: "Motivo declarado", value: String(r.reason).slice(0, 220), provenance: "reiteracion_docs.reason, texto del documento" }] : []),
    ],
    query: { ocids: [r.ocid], allStages: true },
    ocids: [r.ocid],
    ...NORM_REITERACION,
    pressOrganism: r.buyerName ?? null,
    reproduce: `npx tsx src/jobs/daily-investigation.ts --lane=reiteracion-nueva --dry-run`,
  })).sort((a, b) => b.score - a.score).slice(0, 20);
}

// ── Carril 8 · la misma compra directa, una y otra vez ───────────────────────

const NORM_DIRECTA = {
  norm: "Repetir compras directas al mismo proveedor por el mismo artículo es legal mientras "
    + "cada una respete su procedimiento. La medición cuenta repeticiones dentro de un año; no "
    + "establece que se haya fraccionado una contratación para eludir un procedimiento mayor, "
    + "que es una conducta distinta y requiere ver el expediente.",
  normCite: "TOCAF, artículo 33 — el monto de la contratación determina el procedimiento aplicable.",
};

export async function leadsDirectaRepetida(now: Date): Promise<Lead[]> {
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "America/Montevideo", year: "numeric" }).format(now));

  const rows = await ReleaseModel.aggregate<{
    _id: { buyer: string; supplier: string; code: string };
    supplierName: string;
    codeDesc: string;
    n: number;
    total: number;
    ocids: string[];
  }>([
    // El método NO se filtra acá: la etapa `award` trae `tender: null`. Se agrupa primero y
    // recién después se le pregunta el método a la etapa `tender` de cada ocid, que es la que
    // lo tiene. Filtrar acá devolvía cero.
    {
      $match: {
        tag: "award",
        sourceYear: year,
        "amount.hasAmounts": true,
        "amount.primaryAmount": { $gt: 0, $lte: MAX_PLAUSIBLE_UYU },
      },
    },
    { $sort: { date: -1, _id: -1 } },
    { $group: { _id: "$ocid", doc: { $first: "$$ROOT" } } },
    { $replaceWith: "$doc" },
    { $unwind: "$awards" },
    { $unwind: "$awards.items" },
    { $unwind: "$awards.suppliers" },
    { $match: { "awards.items.classification.id": { $nin: [null, ""] }, "buyer.name": { $nin: [null, ""] } } },
    {
      $group: {
        _id: { buyer: "$buyer.name", supplier: "$awards.suppliers.id", code: "$awards.items.classification.id" },
        supplierName: { $first: "$awards.suppliers.name" },
        codeDesc: { $first: "$awards.items.classification.description" },
        ocidSet: { $addToSet: "$ocid" },
        pairs: PAIR_PUSH,
      },
    },
    { $addFields: { n: { $size: "$ocidSet" }, ocids: "$ocidSet", total: SUM_DISTINCT_OCID } },
    { $match: { n: { $gte: 5 }, total: { $gte: 1_500_000, $lte: MAX_PLAUSIBLE_UYU } } },
    { $sort: { n: -1, total: -1 } },
    { $limit: 60 },
  ]).allowDiskUse(true);

  const out: Lead[] = [];
  for (const row of rows) {
    // Segunda pasada: ¿cuántas de esas compras son efectivamente directas? Se le pregunta a la
    // etapa `tender` de cada ocid. Se exige mayoría para que la pista sea sobre compra directa
    // y no sobre una recurrencia licitada, que es otra cosa.
    const sample = row.ocids.slice(0, 12);
    const methods = await Promise.all(sample.map(o => tenderStageOf(o)));
    const known = methods.filter((m): m is { method: string; title: string } => m !== null);
    if (known.length < 3) continue;
    const directas = known.filter(m => /directa/i.test(m.method)).length;
    const share = directas / known.length;
    if (share < 0.6) continue;

    out.push({
      lane: "directa-repetida",
      subjectKey: slugSubject("directa", row._id.buyer, claveProveedor(row._id.supplier, row.supplierName), row._id.code),
      subjectLabel: `${row._id.buyer} · ${row.supplierName} · ${row.codeDesc ?? row._id.code}`,
      score: row.n * 3 + Math.log10(Math.max(row.total, 10)) * 6,
      amountUyu: row.total,
      contractCount: row.n,
      periodFrom: new Date(Date.UTC(year, 0, 1)),
      periodTo: now,
      facts: [
        { label: `Compras al mismo proveedor por el mismo artículo en ${year}`, value: String(row.n), raw: row.n, provenance: "ocid distintos agrupados por buyer.name + awards.suppliers.id + awards.items.classification.id" },
        { label: "De la muestra revisada, compras directas", value: `${directas} de ${known.length}`, raw: directas, provenance: "tender.procurementMethodDetails de la etapa tender de cada ocid" },
        { label: "Total adjudicado", value: money(row.total), raw: Math.round(row.total), provenance: "releases.amount.primaryAmount, un registro por ocid" },
        { label: "Promedio por compra", value: money(row.total / Math.max(row.n, 1)), raw: Math.round(row.total / Math.max(row.n, 1)), provenance: "cociente entre las dos filas anteriores" },
        { label: "Artículo", value: String(row.codeDesc ?? row._id.code), provenance: "awards.items.classification.description" },
      ],
      query: { buyers: [row._id.buyer], supplierIds: [row._id.supplier], categoryId: [row._id.code], yearFrom: year, yearTo: year },
      ocids: row.ocids.slice(0, 12),
      ...NORM_DIRECTA,
      pressOrganism: row._id.buyer,
      reproduce: `npx tsx src/jobs/daily-investigation.ts --lane=directa-repetida --dry-run`,
    });
    if (out.length >= 20) break;
  }
  return out;
}

export const LANES: Record<DailyLane, (now: Date) => Promise<Lead[]>> = {
  "pico-organismo": leadsPicoOrganismo,
  "proveedor-nuevo": leadsProveedorNuevo,
  "concentracion-rubro": leadsConcentracionRubro,
  "anomalia-sin-explicar": leadsAnomaliaSinExplicar,
  "oferente-unico": leadsOferenteUnico,
  "salto-precio": leadsSaltoPrecio,
  "reiteracion-nueva": leadsReiteracionNueva,
  "directa-repetida": leadsDirectaRepetida,
};
