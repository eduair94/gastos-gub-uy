import { createError, defineEventHandler } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { OrganismGroupStatsModel } from '../../utils/models'

/**
 * Organism-group spending — the read side. Serves the precomputed
 * `organism_group_stats` (one doc per group: Intendencias, Ministerios, Salud,
 * Entes, Educación), rebuilt monthly by src/jobs/refresh-organism-groups.ts.
 * Nothing is aggregated on the request path — the page reads one small array.
 */

// Display order (matches ORGANISM_GROUPS in shared/organism-groups.ts).
const GROUP_ORDER = ['intendencias', 'ministerios', 'salud', 'entes', 'educacion']

export default defineEventHandler(async () => {
  try {
    await connectToDatabase()

    const groups = await OrganismGroupStatsModel.find().lean()
    if (!groups.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Organism-group stats not computed yet. Run the refresh-organism-groups job.',
      })
    }

    const ordered = [...groups].sort(
      (a, b) => GROUP_ORDER.indexOf(a.groupKey) - GROUP_ORDER.indexOf(b.groupKey),
    )

    return {
      success: true,
      data: {
        groups: ordered,
        calculatedAt: ordered[0]?.calculatedAt ?? null,
      },
    }
  }
  catch (error: any) {
    if (error?.statusCode) throw error
    console.error('Error reading organism-group stats:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to read organism-group stats' })
  }
})
