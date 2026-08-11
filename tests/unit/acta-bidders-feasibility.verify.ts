#!/usr/bin/env tsx
/**
 * Feasibility probe: can the NUMBER OF OFFERS RECEIVED be recovered from the acta de adjudicación?
 *
 * Not a unit test — needs MONGODB_URI and hits comprasestatales.gub.uy, so `npm test` skips it by
 * the `.verify.ts` convention.
 *
 * WHY THIS EXISTS. Single bidding — a competitive call that drew exactly one offer — is the single
 * strongest procurement red flag in international practice, and it is IMPOSSIBLE from the OCDS feed:
 * `tender.tenderers` and `tender.numberOfTenderers` are populated on 0% of releases, and the
 * per-record and per-release OCDS endpoints return the same thing the bulk download does (verified:
 * /ocds/record/<id> is only an index of release URLs, /ocds/release/adjudicacion-<id> carries roles
 * supplier + procuringEntity and nothing else). The gov HTML detail page says only "Recepción de
 * ofertas hasta: <fecha>" — a deadline, not a list.
 *
 * The remaining candidate is the acta de adjudicación PDF, linked from the award page as
 * /Resoluciones/acta_<compraId>.pdf. Those PDFs are RSTXPDF3-generated, UNCOMPRESSED and carry real
 * text in HEX string operands — no OCR needed. Whether they ENUMERATE the offers received varies by
 * organism and procedure, and that variation is exactly what this measures.
 *
 * Be gentle: the gov site is the same host the pliego and reiteración probes hit, and a previous
 * session throttled it by grinding. Small sample, serial, with a delay.
 *
 *   npx tsx tests/unit/acta-bidders-feasibility.verify.ts [--limit=40]
 */
process.env.MONGO_SOCKET_TIMEOUT_MS ||= String(15 * 60 * 1000);

import zlib from "node:zlib";
import { connectToDatabase, disconnectFromDatabase, mongoose } from "../../shared/connection/database";

const UA = "gastos-gub research probe (+https://github.com/eduair94)";
const DELAY_MS = 700;
const COMPETITIVE = ["Licitación Abreviada", "Licitación Pública", "Concurso de Precios"];

/** Text out of an acta PDF. The actas are uncompressed and use HEX string operands. */
export function extractPdfText(buf: Buffer): string {
  const chunks: string[] = [];
  let idx = 0;
  while (true) {
    const s = buf.indexOf("stream", idx);
    if (s === -1) break;
    let start = s + 6;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    const end = buf.indexOf("endstream", start);
    if (end === -1) break;
    const raw = buf.subarray(start, end);
    idx = end + 9;
    let text: string;
    try {
      text = zlib.inflateSync(raw).toString("latin1");
    } catch {
      try {
        text = zlib.inflateRawSync(raw).toString("latin1");
      } catch {
        text = raw.toString("latin1");
      }
    }
    chunks.push(text);
  }

  const lines: string[] = [];
  for (const content of chunks) {
    const re = /<[0-9A-Fa-f\s]+>|\((?:\\.|[^\\()])*\)|\bTd\b|\bTD\b|\bT\*\b|\bET\b/g;
    let m: RegExpExecArray | null;
    let line = "";
    while ((m = re.exec(content))) {
      const tok = m[0];
      if (tok.startsWith("<")) {
        const hex = tok.slice(1, -1).replace(/\s+/g, "");
        let out = "";
        for (let i = 0; i + 1 < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
        line += out;
      } else if (tok.startsWith("(")) {
        line += tok.slice(1, -1).replace(/\\([nrtbf()\\])/g, (_, c) => ({ n: "\n", r: "\r", t: "\t", b: "", f: "" }[c as string] ?? c));
      } else if (line.trim()) {
        lines.push(line);
        line = "";
      }
    }
    if (line.trim()) lines.push(line);
  }
  return lines.join("\n");
}

/** Normalise for keyword matching: accents off, whitespace collapsed. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Phrases that would introduce an enumeration of the offers received. */
const ENUMERATION_MARKERS = [
  "ofertas presentadas",
  "se presentaron",
  "se presento",
  "oferentes",
  "unico oferente",
  "unica oferta",
  "oferta unica",
  "firmas oferentes",
  "propuestas presentadas",
  "cuadro comparativo",
  "comparativo de ofertas",
];

async function main(): Promise<void> {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const LIMIT = limitArg ? Number(limitArg.slice("--limit=".length)) : 40;

  await connectToDatabase();
  const db = mongoose.connection.db!;

  // Awarded calls run under a COMPETITIVE method — single bidding only means something there.
  const rows = (await db
    .collection("releases")
    .aggregate(
      [
        {
          $match: {
            "tender.procurementMethodDetails": { $in: COMPETITIVE },
            "date": { $gte: new Date("2025-01-01") },
            "ocid": { $type: "string", $ne: "" },
          },
        },
        { $project: { _id: 0, ocid: 1, method: "$tender.procurementMethodDetails" } },
        { $group: { _id: "$ocid", method: { $first: "$method" } } },
        {
          $lookup: {
            from: "releases",
            let: { o: "$_id" },
            pipeline: [
              { $match: { $expr: { $eq: ["$ocid", "$$o"] } } },
              { $match: { tag: "award" } },
              { $limit: 1 },
              { $project: { _id: 0, buyer: "$buyer.name" } },
            ],
            as: "aw",
          },
        },
        { $match: { "aw.0": { $exists: true } } },
        { $limit: LIMIT },
      ],
      { allowDiskUse: true }
    )
    .toArray()) as Array<{ _id: string; method: string; aw: Array<{ buyer: string }> }>;

  console.log(`probing ${rows.length} awarded competitive calls\n`);

  let fetched = 0;
  let empty = 0;
  let withMarker = 0;
  const byMarker = new Map<string, number>();
  const byMethod = new Map<string, { n: number; hit: number }>();
  const samples: string[] = [];

  for (const row of rows) {
    const compraId = row._id.split("-").pop()!;
    const url = `https://www.comprasestatales.gub.uy/Resoluciones/acta_${compraId}.pdf`;
    let text = "";
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) {
        console.log(`  ${compraId} ${row.method.padEnd(22)} HTTP ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      text = extractPdfText(buf);
      fetched++;
    } catch (error) {
      console.log(`  ${compraId} fetch failed: ${(error as Error).message}`);
      continue;
    }
    if (text.trim().length < 50) {
      empty++;
      console.log(`  ${compraId} ${row.method.padEnd(22)} NO TEXT (${text.length} chars) — likely a scan`);
      continue;
    }

    const flat = norm(text);
    const hits = ENUMERATION_MARKERS.filter((k) => flat.includes(k));
    const stat = byMethod.get(row.method) ?? { n: 0, hit: 0 };
    stat.n++;
    if (hits.length) {
      withMarker++;
      stat.hit++;
      for (const h of hits) byMarker.set(h, (byMarker.get(h) ?? 0) + 1);
      if (samples.length < 6) {
        const i = flat.indexOf(hits[0]!);
        samples.push(`${compraId} [${hits.join(", ")}]\n      …${flat.slice(Math.max(0, i - 120), i + 240)}…`);
      }
    }
    byMethod.set(row.method, stat);
    console.log(`  ${compraId} ${row.method.padEnd(22)} ${text.length.toString().padStart(6)} chars  ${hits.length ? "MARKERS: " + hits.join(", ") : "—"}`);
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(`\n=== summary ===`);
  console.log(`  actas fetched with text : ${fetched - empty}`);
  console.log(`  actas with NO text layer: ${empty}`);
  console.log(`  with an enumeration marker: ${withMarker} (${fetched ? ((100 * withMarker) / fetched).toFixed(1) : "0"}%)`);
  console.log(`  by method:`);
  for (const [m, s] of byMethod) console.log(`     ${m.padEnd(22)} ${s.hit}/${s.n}`);
  console.log(`  markers seen:`);
  for (const [k, v] of [...byMarker].sort((a, b) => b[1] - a[1])) console.log(`     ${k.padEnd(26)} ${v}`);
  console.log(`\n=== samples ===`);
  for (const s of samples) console.log(`  ${s}\n`);

  await disconnectFromDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
