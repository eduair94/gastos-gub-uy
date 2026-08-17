/**
 * El contrato editorial, aplicado a lo que YA está publicado.
 *
 *   npx tsx scripts/verify-daily-investigations.ts
 *   npx tsx scripts/verify-daily-investigations.ts --fix    # despublica lo que no pasa
 *
 * POR QUÉ EXISTE SI EL TRABAJO YA VERIFICA ANTES DE PUBLICAR. Por tres motivos, y los tres ya
 * rompieron algo parecido en este repo:
 *
 *   1. Las reglas cambian. Una palabra que hoy se agrega a la lista de prohibidas deja
 *      publicado todo lo que salió ayer.
 *   2. Una corrida con `--force` puede saltear el gate.
 *   3. Una fuente que contestaba 200 el martes puede contestar 404 el viernes.
 *
 * Corre sobre la BASE, no sobre el código que la escribió. Es el mismo motivo por el que
 * verify-derived-casos.ts existe aparte del armador.
 */
import { connectToDatabase, disconnectFromDatabase } from '../shared/connection/database'
import { verifyDaily } from '../shared/daily/verify'
import { DailyInvestigationModel } from '../shared/models/daily_investigation'
import { LANES } from '../src/jobs/lib/daily-leads'

process.env.MONGO_SOCKET_TIMEOUT_MS = process.env.MONGO_SOCKET_TIMEOUT_MS ?? '180000'

const fix = process.argv.includes('--fix')
const checkUrls = process.argv.includes('--urls')

async function main(): Promise<void> {
  await connectToDatabase()
  const notes = await DailyInvestigationModel.find({ status: 'published' })
    .sort({ publishedAt: -1 })
    .lean() as unknown as Array<Record<string, any>>

  console.log(`verificando ${notes.length} notas publicadas…\n`)
  let bad = 0

  for (const note of notes) {
    const reasons: string[] = []

    // El carril tiene que seguir existiendo: si se renombró, la nota quedó huérfana y su
    // comando de reproducción ya no corre.
    if (!(note.lane in LANES)) reasons.push(`el carril «${note.lane}» ya no existe`)

    const check = verifyDaily({
      lane: String(note.lane),
      // La cita legal se compara contra la que la nota guardó: acá no hay carril del cual
      // sacarla, y reconstruirla desde el código haría que un cambio de redacción
      // despublicara todo el archivo de golpe.
      laneNormCite: String(note.es?.normCite ?? ''),
      facts: note.facts ?? [],
      sources: note.sources ?? [],
      reproduce: String(note.reproduce ?? ''),
      es: note.es,
      en: note.en,
    })
    reasons.push(...check.reasons)

    if (checkUrls) {
      for (const source of note.sources ?? []) {
        try {
          const res = await fetch(source.url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15_000) })
          if (!res.ok) reasons.push(`la fuente «${source.url}» hoy contesta ${res.status}`)
        } catch {
          reasons.push(`la fuente «${source.url}» hoy no abre`)
        }
      }
    }

    if (reasons.length) {
      bad++
      console.error(`✗ ${note.slug}`)
      for (const r of reasons) console.error(`    ${r}`)
      if (fix) {
        await DailyInvestigationModel.updateOne(
          { _id: note._id },
          { $set: { status: 'rejected', rejectedReasons: reasons }, $unset: { publishedAt: 1 } },
        )
        console.error('    → despublicada')
      }
    }
  }

  console.log(`\n${notes.length - bad} de ${notes.length} pasan${fix && bad ? ` · ${bad} despublicada(s)` : ''}`)
  if (bad && !fix) {
    console.error('\ncorré con --fix para despublicarlas')
    process.exitCode = 1
  }
}

main()
  .catch((error) => {
    console.error('[verify-daily-investigations]', error instanceof Error ? error.stack ?? error.message : String(error))
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectFromDatabase().catch(() => undefined)
  })
