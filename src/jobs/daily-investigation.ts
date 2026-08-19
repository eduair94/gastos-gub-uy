/**
 * La nota diaria: mide, busca prensa, redacta, verifica y publica.
 *
 *   npm run daily-investigation
 *   npm run daily-investigation -- --dry-run
 *   npm run daily-investigation -- --lane=pico-organismo --limit=1
 *   npm run daily-investigation -- --day=2026-08-17 --force
 *
 * EL ORDEN IMPORTA Y NO ES NEGOCIABLE. Primero se mide sobre el corpus, y recién sobre ese
 * bloque cerrado de hechos escribe el modelo. Nunca al revés. Un modelo al que se le pide
 * «buscá algo interesante» produce prosa cuyas cifras no se pueden auditar.
 *
 * LO QUE EL MODELO NO DECIDE: los números (los mide Mongo), la cita legal (la fija el carril)
 * y si la nota se publica (lo decide shared/daily/verify.ts sobre el texto final).
 *
 * DEDUPLICACIÓN. Un sujeto que ya salió no vuelve a salir por 90 días, y un carril no se
 * repite dos días seguidos. Sin eso el sitio publica el mismo organismo toda la semana.
 */
import { ProviderRotator } from "../../shared/ai/rotator";
import type { GeminiSchema } from "../../shared/ai/gemini-client";
import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";
import { verifyDaily } from "../../shared/daily/verify";
import { DailyInvestigationModel } from "../../shared/models/daily_investigation";
import { filterRelevant, newsRssUrl, organismAliases, parseNewsRss } from "../../shared/news-search";
import type { DailyLane, IDailySource, IDailyText } from "../../shared/types/daily-investigation";
import type { Lead } from "./lib/daily-leads";
import { LANES } from "./lib/daily-leads";

process.env.MONGO_SOCKET_TIMEOUT_MS = process.env.MONGO_SOCKET_TIMEOUT_MS ?? "600000";

const URUGUAY_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Un sujeto que ya salió no vuelve por este plazo. */
const COOLDOWN_DAYS = 90;
const MAX_SOURCES = 3;

interface Args {
  dryRun: boolean;
  force: boolean;
  limit: number;
  lane?: DailyLane | undefined;
  day?: string | undefined;
}

function parseArgs(argv: string[]): Args {
  const laneArg = argv.find(a => a.startsWith("--lane="))?.slice("--lane=".length);
  const dayArg = argv.find(a => a.startsWith("--day="))?.slice("--day=".length);
  const limitArg = argv.find(a => a.startsWith("--limit="))?.slice("--limit=".length);
  return {
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
    limit: Math.max(1, Math.min(5, Number(limitArg ?? 1) || 1)),
    ...(laneArg && laneArg in LANES ? { lane: laneArg as DailyLane } : {}),
    ...(dayArg ? { day: dayArg } : {}),
  };
}

function uruguayDayKey(d: Date): string {
  return new Date(d.getTime() - URUGUAY_OFFSET_MS).toISOString().slice(0, 10);
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

// ── Deduplicación ────────────────────────────────────────────────────────────

/**
 * Los sujetos que no pueden volver a salir.
 *
 * Mira las notas propias (cualquier estado: una rechazada igual consumió el sujeto y
 * reintentarla al día siguiente daría el mismo rechazo) y las fichas derivadas, que cubren el
 * mismo material por el carril de reiteraciones.
 */
async function recentSubjects(now: Date): Promise<Set<string>> {
  const since = new Date(now.getTime() - COOLDOWN_DAYS * DAY_MS);
  const rows = await DailyInvestigationModel.find(
    { createdAt: { $gte: since } },
    { subjectKey: 1 },
  ).lean() as unknown as Array<{ subjectKey: string }>;
  return new Set(rows.map(r => r.subjectKey));
}

/** Los carriles usados en los últimos dos días, para no repetir el mismo formato. */
async function recentLanes(now: Date): Promise<Set<string>> {
  const since = new Date(now.getTime() - 2 * DAY_MS);
  const rows = await DailyInvestigationModel.find(
    { status: "published", publishedAt: { $gte: since } },
    { lane: 1 },
  ).lean() as unknown as Array<{ lane: string }>;
  return new Set(rows.map(r => r.lane));
}

// ── Prensa ───────────────────────────────────────────────────────────────────

/**
 * Prensa sobre las compras del organismo, abierta y chequeada una por una.
 *
 * SÓLO POR ORGANISMO. shared/news-search.ts lo midió y lo deja escrito: buscar por empresa
 * devuelve choques de motos en Cuba para «MOTOCICLO» y tokens cripto para «TA TA».
 *
 * Una fuente que no contesta 2xx no entra. El verificador la rechazaría igual, pero es más
 * barato descartarla acá que perder la nota entera por una URL caída.
 */
async function pressFor(organism: string | null): Promise<IDailySource[]> {
  if (!organism) return [];
  try {
    const res = await fetch(newsRssUrl(organism), {
      headers: { "user-agent": "Mozilla/5.0 (compatible; conlatuya-bot/1.0)" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    const items = filterRelevant(parseNewsRss(await res.text()), organism, organismAliases(organism));

    const out: IDailySource[] = [];
    for (const item of items.slice(0, 6)) {
      if (out.length >= MAX_SOURCES) break;
      try {
        const head = await fetch(item.link, {
          method: "GET",
          redirect: "follow",
          headers: { "user-agent": "Mozilla/5.0 (compatible; conlatuya-bot/1.0)" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!(head.status >= 200 && head.status < 300)) continue;
        out.push({
          outlet: item.source,
          title: item.title,
          url: item.link,
          ...(item.publishedAt ? { date: item.publishedAt.slice(0, 10) } : {}),
          checkedAt: new Date(),
          httpStatus: head.status,
        });
      } catch { /* una fuente que no abre simplemente no entra */ }
    }
    return out;
  } catch {
    return [];
  }
}

// ── Redacción ────────────────────────────────────────────────────────────────

const TEXT_PROPS: GeminiSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", description: "Titular concreto, sin sensacionalismo, máximo 105 caracteres. Sin comillas." },
    dek: { type: "STRING", description: "Una línea: qué se midió y contra qué. Máximo 230 caracteres." },
    measured: { type: "STRING", description: "El hecho medido, con sus cifras y su ventana. 2 a 4 frases." },
    contexto: { type: "STRING", description: "Qué es el organismo, la empresa o el artículo. 1 a 3 frases, sin adjetivos." },
    norm: { type: "STRING", description: "Copiá TEXTUALMENTE el campo `norm` que se te entrega. No lo reescribas." },
    normCite: { type: "STRING", description: "Copiá TEXTUALMENTE el campo `normCite` que se te entrega. Carácter por carácter." },
    missing: { type: "STRING", description: "Qué falta para poder afirmar más. 2 a 4 frases. Obligatorio y específico." },
    answers: { type: "STRING", description: "Quién tiene que responder, nombrándolo. 1 a 2 frases." },
  },
  required: ["title", "dek", "measured", "contexto", "norm", "normCite", "missing", "answers"],
  propertyOrdering: ["title", "dek", "measured", "contexto", "norm", "normCite", "missing", "answers"],
};

const WRITE_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: { es: TEXT_PROPS, en: TEXT_PROPS },
  required: ["es", "en"],
  propertyOrdering: ["es", "en"],
};

const SYSTEM = [
  "Sos analista de compras públicas uruguayas y escribís para un sitio de transparencia.",
  "Español rioplatense, sobrio, periodístico. El inglés es traducción fiel del español.",
  "",
  "REGLAS QUE NO SE NEGOCIAN:",
  "1. Usá EXCLUSIVAMENTE las cifras del bloque `facts`. No calcules cifras nuevas: ni promedios,",
  "   ni porcentajes, ni diferencias. Un número que no está en `facts` hace que la nota se descarte.",
  "2. Copiá `norm` y `normCite` textualmente. Son datos, no material para reescribir.",
  "3. No afirmes irregularidad, delito, fraude, corrupción, ilegalidad, colusión ni sobreprecio.",
  "   Lo que medimos es un dato del registro público, no un fallo.",
  "4. Nada de adjetivos de venta: «histórico», «impactante», «alarmante», «millonario».",
  "5. `missing` es el campo más importante: decí con precisión qué haría falta para afirmar más,",
  "   y por qué la medición sola no alcanza. No lo recortes.",
  "6. Una idea por frase. Un término por concepto. Voz activa. Sin gerundios encadenados.",
  "7. Si citás prensa, atribuila al medio por su nombre. Nunca presentes lo publicado como propio.",
  "8. Números en español rioplatense: coma decimal y punto de miles. Escribí «222,4» y «$ 185.316.878».",
  "   Nunca «222.4» ni «185,316,878»: son la convención inglesa y en español cambian el valor.",
  "9. «N veces» y «N veces más» NO son lo mismo: «tres veces más» son cuatro. Si el hecho medido dice",
  "   que algo equivale a N veces otra cosa, escribí «N veces», nunca «N veces más».",
].join("\n");

interface Written { es: IDailyText; en: IDailyText }

async function writeNote(rotator: ProviderRotator, lead: Lead, sources: IDailySource[]) {
  const facts = {
    lane: lead.lane,
    subject: lead.subjectLabel,
    window: { from: lead.periodFrom.toISOString().slice(0, 10), to: lead.periodTo.toISOString().slice(0, 10) },
    facts: lead.facts.map(f => ({ label: f.label, value: f.value, raw: f.raw ?? null, provenance: f.provenance })),
    norm: lead.norm,
    normCite: lead.normCite,
    press: sources.map(s => ({ outlet: s.outlet, title: s.title, date: s.date ?? null })),
    contractCount: lead.contractCount,
  };
  const prompt = `Escribí la nota diaria a partir de este conjunto CERRADO de hechos:\n${JSON.stringify(facts, null, 1)}`;
  return rotator.generateStructured<Written>({
    systemInstruction: SYSTEM,
    prompt,
    schema: WRITE_SCHEMA,
    temperature: 0,
    timeoutMs: 90_000,
    totalTimeoutMs: 240_000,
    maxRetriesPerModel: 2,
  });
}

// ── Corrida ──────────────────────────────────────────────────────────────────

async function gatherLeads(args: Args, now: Date): Promise<Lead[]> {
  const names = (args.lane ? [args.lane] : (Object.keys(LANES) as DailyLane[]));
  const all: Lead[] = [];
  for (const name of names) {
    try {
      const leads = await LANES[name](now);
      console.log(`[daily] carril ${name}: ${leads.length} pistas`);
      all.push(...leads);
    } catch (error) {
      console.error(`[daily] carril ${name} falló:`, error instanceof Error ? error.message : String(error));
    }
  }
  return all;
}

/**
 * Ordena las pistas de forma que un carril no monopolice el día.
 *
 * Round-robin por carril sobre las pistas ya ordenadas por score: primero la mejor de cada
 * carril, después la segunda de cada uno. Sin esto, `pico-organismo` —que produce los montos
 * más grandes— se llevaría todos los días.
 */
function interleave(leads: Lead[]): Lead[] {
  const byLane = new Map<string, Lead[]>();
  for (const lead of [...leads].sort((a, b) => b.score - a.score)) {
    const list = byLane.get(lead.lane) ?? [];
    list.push(lead);
    byLane.set(lead.lane, list);
  }
  const out: Lead[] = [];
  let depth = 0;
  while (out.length < leads.length && depth < 50) {
    for (const list of byLane.values()) {
      const item = list[depth];
      if (item) out.push(item);
    }
    depth++;
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const now = args.day ? new Date(`${args.day}T12:00:00.000Z`) : new Date();
  const dayKey = args.day ?? uruguayDayKey(now);
  await connectToDatabase();

  const already = await DailyInvestigationModel.countDocuments({ dayKey, status: "published" });
  if (already >= args.limit && !args.force) {
    console.log(`DAILY_INVESTIGATION_SUMMARY day=${dayKey} published=0 reason=ya-hay-${already}`);
    return;
  }

  const rotator = new ProviderRotator({
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    groqApiKey: process.env.GROQ_API_KEY,
  });
  if (!rotator.available && !args.dryRun) throw new Error("Ni GEMINI_API_KEY ni GROQ_API_KEY están configuradas");

  const [seenSubjects, usedLanes, leadsRaw] = await Promise.all([
    recentSubjects(now),
    recentLanes(now),
    gatherLeads(args, now),
  ]);

  const candidates = interleave(leadsRaw)
    .filter(lead => !seenSubjects.has(lead.subjectKey))
    // El carril repetido va al fondo, no se descarta: si es lo único que hay, se publica igual.
    .sort((a, b) => Number(usedLanes.has(a.lane)) - Number(usedLanes.has(b.lane)));

  console.log(`[daily] ${leadsRaw.length} pistas, ${candidates.length} tras deduplicar`);
  if (!candidates.length) {
    console.log(`DAILY_INVESTIGATION_SUMMARY day=${dayKey} published=0 reason=sin-pistas-nuevas`);
    return;
  }

  let published = 0;
  let rejected = 0;
  for (const lead of candidates) {
    if (published >= args.limit) break;

    const slug = `${dayKey}-${slugify(lead.subjectLabel)}`;
    if (await DailyInvestigationModel.countDocuments({ slug })) continue;

    const sources = await pressFor(lead.pressOrganism);
    console.log(`[daily] escribiendo «${lead.subjectLabel.slice(0, 60)}» (${lead.lane}, ${sources.length} fuente/s)`);

    let written: Written;
    let modelUsed = "";
    let usage = { promptTokens: 0, candidatesTokens: 0, totalTokens: 0 };
    try {
      const result = await writeNote(rotator, lead, sources);
      written = result.data;
      modelUsed = result.modelUsed;
      usage = result.usage;
    } catch (error) {
      console.error(`[daily] el modelo falló en «${lead.subjectLabel.slice(0, 40)}»:`, error instanceof Error ? error.message : String(error));
      continue;
    }

    const check = verifyDaily({
      lane: lead.lane,
      laneNormCite: lead.normCite,
      facts: lead.facts,
      sources,
      reproduce: lead.reproduce,
      es: written.es,
      en: written.en,
    });

    const doc = {
      slug,
      dayKey,
      lane: lead.lane,
      subjectKey: lead.subjectKey,
      subjectLabel: lead.subjectLabel,
      status: check.ok ? ("published" as const) : ("rejected" as const),
      rejectedReasons: check.reasons,
      ...(check.ok ? { publishedAt: new Date() } : {}),
      amountUyu: lead.amountUyu,
      contractCount: lead.contractCount,
      periodFrom: lead.periodFrom,
      periodTo: lead.periodTo,
      facts: lead.facts,
      query: lead.query,
      ocids: lead.ocids,
      sources,
      reproduce: lead.reproduce,
      measuredOn: dayKey,
      es: written.es,
      en: written.en,
      ai: { provider: modelUsed.startsWith("groq:") ? "groq" : "gemini", model: modelUsed, generatedAt: new Date(), ...usage },
    };

    if (args.dryRun) {
      console.log(JSON.stringify({ dryRun: true, slug, lane: lead.lane, ok: check.ok, reasons: check.reasons, title: written.es.title, measured: written.es.measured }, null, 2));
      published++;
      continue;
    }

    await DailyInvestigationModel.updateOne({ slug }, { $set: doc }, { upsert: true });
    if (check.ok) {
      published++;
      console.log(`[daily] PUBLICADA ${slug} — ${written.es.title}`);
    } else {
      rejected++;
      console.log(`[daily] RECHAZADA ${slug}: ${check.reasons.join(" | ")}`);
    }
  }

  console.log(`DAILY_INVESTIGATION_SUMMARY day=${dayKey} published=${published} rejected=${rejected} candidates=${candidates.length}`);
}

main()
  .catch((error) => {
    console.error("[daily-investigation]", error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectFromDatabase().catch(() => undefined);
    await mongoose.connection.close().catch(() => undefined);
  });
