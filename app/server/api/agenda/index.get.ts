/**
 * La agenda del día: lo que entró hoy al registro, la cotización, la prensa y los números semanales.
 *
 * UNA SOLA RESPUESTA para toda la página. Son cuatro lecturas baratas y ninguna hace un pedido a un
 * tercero en la ruta de request: el registro sale del índice `tag_1_date_-1`, la cotización de la
 * colección `exchange_rates` que ya mantiene el job del BCU, la prensa de `organism_news` tal cual, y
 * los números del blog de `newsletter_issues`.
 *
 * LO QUE ESTE ENDPOINT NO PUEDE RESPONDER, y por qué la página no lo promete: "qué nota apareció
 * desde ayer". El job de prensa escribe con `$set` del arreglo entero y no hay `firstSeenAt` por
 * ítem, así que sólo se sabe qué está hoy guardado, no qué es nuevo. Devolvemos las notas más
 * recientes POR FECHA DE PUBLICACIÓN DEL MEDIO, que es otra cosa y la página lo dice.
 *
 * EL DÍA SE LLENA DURANTE EL DÍA. Medido el 14/08/2026: los días hábiles cierran entre 266 y 371
 * adjudicaciones, y a las 9 de la mañana ese mismo día había 6. Los fines de semana quedan en 0 a 7.
 * Por eso se devuelve la serie de los últimos catorce días junto al día en curso: un número solo,
 * sin la serie al lado, se lee como una caída cuando es la hora.
 */
import { defineEventHandler } from 'h3'
import { classifyNewsSource } from '../../../../shared/news-source-type'
// `shared/models/index.ts` no reexporta el número semanal; se importa por ruta como en /api/blog.
import { NewsletterIssueModel } from '../../../../shared/models/newsletter_issue'
import { connectToDatabase } from '../../utils/database'
import { ExchangeRateModel, OrganismNewsModel, ReleaseModel } from '../../utils/models'

/** Días de serie diaria. Catorce cubre dos fines de semana, que es lo que explica los ceros. */
const DAYS = 14
/** Últimas adjudicaciones que se listan. Suficiente para dar textura sin volverse un listado. */
const LATEST = 8
/** Notas de prensa que se muestran. El estado normal de esta sección es tener poco. */
const NEWS = 10
/** Artefactos de monto: el mismo techo que usa el resto del sitio. */
const AMOUNT_GUARD = { $gt: 0, $lt: 50e9 }

export default defineEventHandler(async () => {
  await connectToDatabase()
  const since = new Date(Date.now() - DAYS * 864e5)

  const [daily, latest, fx, press, issues] = await Promise.all([
    // Serie diaria. `date` es el momento en que el registro entró al feed, no la fecha de la firma.
    ReleaseModel.aggregate([
      { $match: { tag: 'award', date: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          count: { $sum: 1 },
          uyu: { $sum: { $cond: [{ $and: [{ $gt: ['$amount.primaryAmount', AMOUNT_GUARD.$gt] }, { $lt: ['$amount.primaryAmount', AMOUNT_GUARD.$lt] }] }, '$amount.primaryAmount', 0] } },
        },
      },
      { $sort: { _id: -1 } },
    ]).option({ maxTimeMS: 20_000 }),

    ReleaseModel.find({ tag: 'award', date: { $gte: since } })
      .select('id ocid date buyer.name buyer.id awards.suppliers.name awards.suppliers.id amount.primaryAmount tender.title')
      .sort({ date: -1 })
      .limit(LATEST)
      .lean(),

    ExchangeRateModel.find({}).select('month usd ui updatedAt').sort({ month: -1 }).limit(2).lean(),

    // Notas ordenadas por fecha de publicación del medio. No es "lo nuevo": es lo más reciente
    // que hay guardado, que no es lo mismo y la página lo aclara.
    OrganismNewsModel.aggregate([
      { $unwind: '$items' },
      { $match: { 'items.publishedAt': { $ne: null } } },
      { $sort: { 'items.publishedAt': -1 } },
      { $limit: NEWS },
      {
        $project: {
          _id: 0,
          buyerId: 1,
          buyerName: 1,
          title: '$items.title',
          link: '$items.link',
          source: '$items.source',
          publishedAt: '$items.publishedAt',
        },
      },
    ]).option({ maxTimeMS: 20_000 }),

    NewsletterIssueModel.find({ status: 'published' })
      .select('weekKey slug title periodStart periodEnd publishedAt eligibleExpenseCount')
      .sort({ periodStart: -1 })
      .limit(3)
      .lean(),
  ])

  const series = (daily as { _id: string, count: number, uyu: number }[])
    .map(d => ({ day: d._id, count: d.count, uyu: d.uyu }))

  const today = series[0] ?? null
  const weekdays = series.filter(d => d.count >= 50)
  const weekdayAverage = weekdays.length
    ? Math.round(weekdays.reduce((a, b) => a + b.count, 0) / weekdays.length)
    : null

  return {
    success: true,
    data: {
      registry: {
        today,
        series,
        weekdayAverage,
        /** Cuántos de los días de la serie tuvieron carga de día hábil. Contexto para el promedio. */
        weekdayCount: weekdays.length,
        latest: (latest as any[]).map(r => ({
          id: r.id,
          ocid: r.ocid,
          date: r.date,
          buyer: r.buyer?.name ?? null,
          buyerId: r.buyer?.id ?? null,
          supplier: r.awards?.[0]?.suppliers?.[0]?.name ?? null,
          supplierId: r.awards?.[0]?.suppliers?.[0]?.id ?? null,
          title: r.tender?.title ?? null,
          uyu: typeof r.amount?.primaryAmount === 'number' ? r.amount.primaryAmount : null,
        })),
      },
      fx: (fx as any[]).map(r => ({ month: r.month, usd: r.usd ?? null, ui: r.ui ?? null, updatedAt: r.updatedAt })),
      press: (press as any[]).map(n => ({
        ...n,
        sourceType: classifyNewsSource(n.source),
      })),
      issues,
    },
  }
})
