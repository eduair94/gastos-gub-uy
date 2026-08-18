#!/usr/bin/env tsx

/**
 * Reproduce contra Mongo cada cifra de pauta que publica /investigaciones/canales-privados.
 *
 *   npx tsx scripts/verify/verify-canales-tv.ts
 *
 * Sale con código 1 si alguna cifra del módulo `app/data/investigaciones-canales.ts` deja
 * de coincidir con la base. Necesita MONGODB_URI.
 *
 * QUÉ NO VERIFICA. Los ingresos y resultados de los canales NO salen de esta base. Son los
 * balances contables que publicó Gustavo Gómez (OBSERVACOM) el 17/08/2026. Este script sólo
 * comprueba el lado público: la pauta adjudicada, el reparto y el hueco. Los porcentajes sí
 * se recalculan, porque su numerador sí es de la base.
 *
 * MÉTODO. El mismo que el resto del sitio: `amount.primaryAmount` como total del contrato,
 * repartido por ítem con el factor fx de src/jobs/analytics-pipeline. Nunca se suma
 * `awards.items.unit.value.amount` crudo.
 *
 * TOLERANCIA. Las cifras del módulo van redondeadas a dos decimales, así que la comparación
 * usa una tolerancia relativa de 1e-6 y un piso absoluto de un peso.
 */

import { connectToDatabase, disconnectFromDatabase } from '../../shared/connection/database'
import mongoose from 'mongoose'
import {
  CAMPANA_2023,
  CANAL_BALANCES,
  CANAL_PAUTA,
  CANAL_PAUTA_REAL,
  CANAL_STATS,
  HUECO,
  TURISMO_REPARTO,
  TURISMO_TOTAL,
} from '../../app/data/investigaciones-canales'
import {
  FX_SCALE,
  MAX_PLAUSIBLE_RELEASE_UYU,
  UNWOUND_ITEM_UYU,
} from '../../src/jobs/analytics-pipeline'
import { toTodayUyu, type RateTable } from '../../shared/utils/real-value'

const AGG = { allowDiskUse: true, maxTimeMS: 15 * 60 * 1000 } as const

/** Gasto por ítem, cero si el contrato no trae un total creíble. */
const SPEND = {
  $cond: [
    {
      $and: [
        { $gt: ['$amount.primaryAmount', 0] },
        { $lt: ['$amount.primaryAmount', MAX_PLAUSIBLE_RELEASE_UYU] },
      ],
    },
    UNWOUND_ITEM_UYU,
    0,
  ],
}

let failures = 0
function check(label: string, got: number, want: number, tol = 1e-6): void {
  const diff = Math.abs(got - want)
  const ok = diff <= Math.max(1, Math.abs(want) * tol)
  if (!ok) failures++
  const g = Math.round(got * 100) / 100
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label.padEnd(52)} base=${g.toLocaleString('en-US')}  módulo=${want.toLocaleString('en-US')}`)
}

/** Igualdad exacta para conteos: un contrato de más no es un redondeo. */
function checkInt(label: string, got: number, want: number): void {
  const ok = got === want
  if (!ok) failures++
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label.padEnd(52)} base=${got}  módulo=${want}`)
}

async function loadRates(): Promise<RateTable> {
  const rows = await mongoose.connection.db!
    .collection('exchange_rates')
    .find({}, { projection: { month: 1, ui: 1 } })
    .toArray()
  const byMonth: RateTable['byMonth'] = {}
  let latestUi: number | null = null
  let latestMonth = ''
  for (const r of rows as Array<{ month: string, ui?: number }>) {
    if (typeof r.ui === 'number') byMonth[r.month] = { ui: r.ui }
    if (typeof r.ui === 'number' && r.ui > 0 && r.month > latestMonth) {
      latestMonth = r.month
      latestUi = r.ui
    }
  }
  return { byMonth, latestUi }
}

async function main() {
  await connectToDatabase()
  const rel = mongoose.connection.db!.collection('releases')
  const ids = CANAL_BALANCES.map(b => b.supplierId)

  // Una sola pasada: pauta por canal y por mes. De ahí salen el año calendario, el
  // ejercicio julio-junio de Canal 4, los totales y la serie deflactada.
  const rows = await rel.aggregate([
    { $match: { tag: 'award', 'awards.suppliers.id': { $in: ids } } },
    { $addFields: { _fx: FX_SCALE } },
    { $unwind: '$awards' },
    { $unwind: '$awards.items' },
    { $match: { 'awards.suppliers.id': { $in: ids } } },
    {
      $addFields: {
        _sid: { $arrayElemAt: ['$awards.suppliers.id', 0] },
        _ym: { $dateToString: { date: '$date', format: '%Y-%m' } },
        _uyu: SPEND,
      },
    },
    {
      $group: {
        _id: { s: '$_sid', ym: '$_ym' },
        v: { $sum: '$_uyu' },
        ocids: { $addToSet: '$ocid' },
        buyers: { $addToSet: '$buyer.id' },
      },
    },
  ], AGG).toArray()

  const rates = await loadRates()
  const realByYear = new Map<number, number>()

  console.log('\n· Pauta por canal')
  for (const b of CANAL_BALANCES) {
    const p = CANAL_PAUTA.find(x => x.key === b.key)!
    const mine = (rows as Array<{ _id: { s: string, ym: string }, v: number, ocids: string[], buyers: string[] }>)
      .filter(r => r._id.s === b.supplierId)

    const byMonth = new Map<string, number>()
    const ocids = new Set<string>()
    const buyers = new Set<string>()
    let total = 0
    for (const r of mine) {
      byMonth.set(r._id.ym, (byMonth.get(r._id.ym) ?? 0) + r.v)
      r.ocids.forEach(o => ocids.add(o))
      r.buyers.forEach(x => x && buyers.add(x))
      total += r.v
      const year = Number(r._id.ym.slice(0, 4))
      const real = toTodayUyu(r.v, 'UYU', r._id.ym, rates) ?? r.v
      realByYear.set(year, (realByYear.get(year) ?? 0) + real)
    }

    const calendar = (y: number) => {
      let s = 0
      for (let m = 1; m <= 12; m++) s += byMonth.get(`${y}-${String(m).padStart(2, '0')}`) ?? 0
      return s
    }
    /** Ejercicio que cierra en junio del año dado: julio del anterior a junio de éste. */
    const julyToJune = (endYear: number) => {
      let s = 0
      for (let m = 7; m <= 12; m++) s += byMonth.get(`${endYear - 1}-${String(m).padStart(2, '0')}`) ?? 0
      for (let m = 1; m <= 6; m++) s += byMonth.get(`${endYear}-${String(m).padStart(2, '0')}`) ?? 0
      return s
    }
    const window = b.close === 'junio' ? julyToJune : calendar

    const y2024 = window(2024)
    const y2025 = window(2025)
    check(`${b.key} · pauta ejercicio 2024`, y2024, p.pauta2024)
    check(`${b.key} · pauta ejercicio 2025`, y2025, p.pauta2025)
    check(`${b.key} · % del ingreso 2024`, (y2024 / b.ingresos2024) * 100, p.share2024, 2e-3)
    check(`${b.key} · % del ingreso 2025`, (y2025 / b.ingresos2025) * 100, p.share2025, 2e-3)
    check(`${b.key} · total nominal`, total, p.totalNominal)
    checkInt(`${b.key} · contratos`, ocids.size, p.contratos)
    checkInt(`${b.key} · compradores`, buyers.size, p.compradores)

    const years = [...byMonth.keys()].map(k => Number(k.slice(0, 4)))
    checkInt(`${b.key} · primer año`, Math.min(...years), p.primerAnio)
    checkInt(`${b.key} · último año`, Math.max(...years), p.ultimoAnio)
  }

  console.log('\n· Serie deflactada (pesos de hoy, los tres canales)')
  for (const point of CANAL_PAUTA_REAL) {
    check(`serie real ${point.year}`, realByYear.get(point.year) ?? 0, point.value, 1e-3)
  }
  check('pico real', realByYear.get(CANAL_STATS.picoRealAnio) ?? 0, CANAL_STATS.picoRealUYU, 1e-3)
  check('último real', realByYear.get(2025) ?? 0, CANAL_STATS.ultimoRealUYU, 1e-3)
  checkInt(
    'caída real, en veces',
    Math.round((realByYear.get(CANAL_STATS.picoRealAnio) ?? 0) / (realByYear.get(2025) || 1)),
    CANAL_STATS.caidaRealVeces,
  )

  // La pérdida de Canal 12 contra su pauta y contra todo lo que cobró del Estado.
  const c12 = CANAL_BALANCES.find(b => b.key === 'c12')!
  const p12 = CANAL_PAUTA.find(p => p.key === 'c12')!
  checkInt(
    'pérdida C12 sobre su pauta 2025, en veces',
    Math.round(Math.abs(c12.resultado2025) / p12.pauta2025),
    CANAL_STATS.perdidaVecesPauta,
  )
  checkInt(
    'pérdida C12 sobre su total histórico, en %',
    Math.round((Math.abs(c12.resultado2025) / p12.totalNominal) * 100),
    CANAL_STATS.perdidaSobreTotalPct,
  )

  // El reparto de Turismo: las dos adjudicaciones repiten el mismo precio unitario.
  console.log('\n· Reparto de la compra de televisión de Turismo')
  const turismo = await rel.aggregate([
    { $match: { ocid: { $in: ['ocds-yfs5dr-1171329', 'ocds-yfs5dr-1242895'] } } },
    { $addFields: { _fx: FX_SCALE } },
    { $unwind: '$awards' },
    { $unwind: '$awards.items' },
    { $addFields: { _sid: { $arrayElemAt: ['$awards.suppliers.id', 0] }, _uyu: UNWOUND_ITEM_UYU } },
    { $group: { _id: { o: '$ocid', s: '$_sid' }, v: { $sum: '$_uyu' } } },
  ], AGG).toArray()
  const supplierOf: Record<string, string> = {
    c10: 'R/210134210018',
    c12: 'R/210223730017',
    c4: 'R/210936400013',
    c5: 'T/11024',
  }
  for (const ocid of ['ocds-yfs5dr-1171329', 'ocds-yfs5dr-1242895']) {
    const here = (turismo as Array<{ _id: { o: string, s: string }, v: number }>).filter(r => r._id.o === ocid)
    const total = here.reduce((s, r) => s + r.v, 0)
    check(`${ocid} · total`, total, TURISMO_TOTAL)
    for (const row of TURISMO_REPARTO) {
      const got = here.find(r => r._id.s === supplierOf[row.key])?.v ?? 0
      check(`${ocid} · ${row.key}`, got, row.value)
      check(`${ocid} · ${row.key} · parte`, (got / total) * 100, row.share, 5e-3)
    }
  }

  // La campaña nacional de diciembre de 2023: concentración en tres canales.
  console.log('\n· Campaña nacional de Turismo (diciembre 2023)')
  const [campana] = await rel.aggregate([
    { $match: { ocid: 'ocds-yfs5dr-1074739' } },
    { $addFields: { _fx: FX_SCALE } },
    { $unwind: '$awards' },
    { $unwind: '$awards.items' },
    { $addFields: { _sid: { $arrayElemAt: ['$awards.suppliers.id', 0] }, _uyu: UNWOUND_ITEM_UYU } },
    {
      $group: {
        _id: null,
        total: { $sum: '$_uyu' },
        sup: { $addToSet: '$_sid' },
        tres: { $sum: { $cond: [{ $in: ['$_sid', ids] }, '$_uyu', 0] } },
        canal5: { $sum: { $cond: [{ $eq: ['$_sid', 'T/11024'] }, '$_uyu', 0] } },
      },
    },
    { $project: { total: 1, tres: 1, canal5: 1, proveedores: { $size: '$sup' } } },
  ], AGG).toArray()
  check('campaña 2023 · total', campana.total, CAMPANA_2023.total)
  check('campaña 2023 · tres canales', campana.tres, CAMPANA_2023.tresCanales)
  check('campaña 2023 · Canal 5', campana.canal5, CAMPANA_2023.canal5)
  check('campaña 2023 · resto', campana.total - campana.tres - campana.canal5, CAMPANA_2023.resto)
  checkInt('campaña 2023 · proveedores', campana.proveedores, CAMPANA_2023.proveedores)
  checkInt('campaña 2023 · resto de proveedores', campana.proveedores - 4, CAMPANA_2023.restoProveedores)

  // El hueco: la clase entera, y lo poco que registra ANTEL dentro de ella.
  console.log('\n· El hueco')
  const pa = mongoose.connection.db!.collection('product_analytics')
  const clase = await pa.find({ clasName: 'PUBLICIDAD Y PROPAGANDA' }, { projection: { code: 1, totalUYU: 1 } }).toArray()
  const claseTotal = clase.reduce((s, c: { totalUYU?: number }) => s + (c.totalUYU ?? 0), 0)
  check('clase «Publicidad y propaganda» · total', claseTotal, HUECO.claseTotalUYU, 1e-4)
  checkInt('clase · códigos', clase.length, HUECO.claseCodigos)

  // El puesto de cada canal en el ranking de /pauta. La pieza afirma que entre los seis
  // primeros no hay ningún canal privado, y ese ranking se recalcula solo: si un canal
  // sube al top 6, la frase deja de ser cierta y esto lo avisa.
  const ranking = await pa.aggregate([
    { $match: { clasName: 'PUBLICIDAD Y PROPAGANDA' } },
    { $unwind: '$topSuppliers' },
    { $group: { _id: '$topSuppliers.name', v: { $sum: '$topSuppliers.spendUYU' } } },
    { $sort: { v: -1 } },
    { $limit: 20 },
  ], AGG).toArray()
  const posOf = (needle: RegExp) =>
    ranking.findIndex((r: { _id: string }) => needle.test(r._id ?? '')) + 1
  checkInt('ranking /pauta · Canal 10', posOf(/SAETA/i), HUECO.rankingC10)
  checkInt('ranking /pauta · Canal 12', posOf(/LARRA[NÑ]AGA/i), HUECO.rankingC12)
  checkInt('ranking /pauta · Canal 4', posOf(/MONTE CARLO TV/i), HUECO.rankingC4)
  checkInt(
    'ranking /pauta · primer canal privado',
    Math.min(posOf(/SAETA/i), posOf(/LARRA[NÑ]AGA/i), posOf(/MONTE CARLO TV/i)),
    HUECO.rankingPrimerCanalPrivado,
  )

  const adCodes = clase.map((c: { code: string }) => c.code)
  const antelAwards = await rel.countDocuments({ tag: 'award', 'buyer.id': '65-1' }, { maxTimeMS: 10 * 60 * 1000 })
  checkInt('ANTEL · adjudicaciones en el corpus', antelAwards, HUECO.antelAdjudicaciones)

  const antelAds = await rel.aggregate([
    { $match: { tag: 'award', 'buyer.id': '65-1', 'awards.items.classification.id': { $in: adCodes } } },
    { $addFields: { _fx: FX_SCALE } },
    { $unwind: '$awards' },
    { $unwind: '$awards.items' },
    { $match: { 'awards.items.classification.id': { $in: adCodes } } },
    { $addFields: { _uyu: SPEND } },
    { $group: { _id: null, v: { $sum: '$_uyu' }, lines: { $sum: 1 } } },
  ], AGG).toArray()
  const antel = antelAds[0] ?? { v: 0, lines: 0 }
  check('ANTEL · publicidad registrada', antel.v, HUECO.antelPublicidadUYU, 1e-4)
  checkInt('ANTEL · líneas de publicidad', antel.lines, HUECO.antelLineasPublicidad)

  // Ninguna de esas líneas puede ser un canal de televisión: el texto lo afirma.
  const antelTv = await rel.countDocuments({
    tag: 'award',
    'buyer.id': '65-1',
    'awards.suppliers.id': { $in: [...ids, 'R/210153680016', 'T/11024'] },
  }, { maxTimeMS: 10 * 60 * 1000 })
  checkInt('ANTEL · adjudicaciones a canales de TV', antelTv, HUECO.antelTV)

  await disconnectFromDatabase()
  console.log(failures === 0 ? '\n✓ todas las cifras coinciden' : `\n✗ ${failures} cifra(s) no coinciden`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('verify-canales-tv:', err instanceof Error ? err.message : err)
  process.exit(1)
})
