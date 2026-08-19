/**
 * Pasa a los suscriptos existentes a la cadencia diaria del newsletter.
 *
 *   npx tsx scripts/migrate-newsletter-frequency.ts --dry-run
 *   npx tsx scripts/migrate-newsletter-frequency.ts
 *   npx tsx scripts/migrate-newsletter-frequency.ts --to=weekly   # revertir
 *
 * ES UN CAMBIO QUE EL USUARIO NO PIDIÓ, y hay que correrlo sabiéndolo. Alguien que se suscribió
 * a un resumen semanal va a empezar a recibir un correo por día. Las dos cosas que lo hacen
 * defendible ya están construidas y tienen que seguir ahí antes de correr esto:
 *
 *   1. Cada correo diario lleva un enlace de un clic a «sólo el semanal»
 *      (/api/newsletter/frequency?to=weekly). Sin él, el que se molesta usa el botón de spam,
 *      y eso castiga la entrega de toda la lista.
 *   2. El trabajo diario NO manda edición los días sin nota publicada.
 *
 * IDEMPOTENTE. Sólo escribe donde el campo falta o difiere, así que correrlo dos veces no
 * pisa a quien ya eligió su cadencia a mano... salvo que se pase --force.
 */
import { connectToDatabase, disconnectFromDatabase } from '../shared/connection/database'
import { UserModel } from '../shared/models/user'

const dryRun = process.argv.includes('--dry-run')
const force = process.argv.includes('--force')
const toArg = process.argv.find(a => a.startsWith('--to='))?.slice('--to='.length)
const target = toArg === 'weekly' ? 'weekly' : 'daily'

async function main(): Promise<void> {
  await connectToDatabase()

  const subscribed = await UserModel.countDocuments({ 'newsletter.subscribed': true })
  // Sin --force sólo se toca a quien nunca eligió: respetar una elección explícita del usuario
  // es la mitad del motivo por el que este campo existe.
  const filter = force
    ? { 'newsletter.subscribed': true }
    : { 'newsletter.subscribed': true, 'newsletter.frequency': { $exists: false } }

  const affected = await UserModel.countDocuments(filter)
  const already = await UserModel.countDocuments({ 'newsletter.subscribed': true, 'newsletter.frequency': target })

  console.log(`suscriptos activos: ${subscribed}`)
  console.log(`ya en «${target}»: ${already}`)
  console.log(`a migrar${force ? ' (force: pisa elecciones del usuario)' : ''}: ${affected}`)

  if (dryRun) {
    console.log('MIGRATE_NEWSLETTER_FREQUENCY dry-run: no se escribió nada')
    return
  }
  if (!affected) {
    console.log('MIGRATE_NEWSLETTER_FREQUENCY nada para migrar')
    return
  }

  const result = await UserModel.updateMany(filter, {
    $set: { 'newsletter.frequency': target, 'newsletter.frequencyChangedAt': new Date() },
  })
  console.log(`MIGRATE_NEWSLETTER_FREQUENCY target=${target} matched=${result.matchedCount} modified=${result.modifiedCount}`)
}

main()
  .catch((error) => {
    console.error('[migrate-newsletter-frequency]', error instanceof Error ? error.stack ?? error.message : String(error))
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectFromDatabase().catch(() => undefined)
  })
