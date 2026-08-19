import { createError, defineEventHandler, getRouterParam } from 'h3'
import { isValidObjectId } from 'mongoose'
import { connectToDatabase } from '../../../utils/database'
import { AnomalyModel, ReleaseModel } from '../../../utils/models'
import { feedbackSummary } from '../../../utils/anomaly-feedback'

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const anomalyId = getRouterParam(event, 'id')
    if (!anomalyId || !isValidObjectId(anomalyId)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Anomaly ID is required',
      })
    }

    // Fetch anomaly with additional release data
    const anomaly = await AnomalyModel.findById(anomalyId).lean()
    if (!anomaly) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Anomaly not found',
      })
    }

    // Fetch related contract data
    const release = await ReleaseModel.findOne({ id: anomaly.releaseId })
      .select('id ocid tender buyer awards')
      .lean()

    // Find related anomalies (same supplier or similar type)
    const relatedAnomalies = await AnomalyModel.find({
      _id: { $ne: anomaly._id },
      $or: [
        { 'metadata.supplierName': anomaly.metadata?.supplierName },
        { type: anomaly.type },
      ],
    })
      .limit(5)
      .sort({ createdAt: -1 })
      .lean()

    // Community feedback for this flag: public up/down counts + the caller's own vote.
    const feedback = await feedbackSummary(event, String(anomaly._id))

    return {
      success: true,
      data: {
        anomaly: { ...anomaly, feedback },
        contract: release,
        relatedAnomalies,
      },
    }
  }
  catch (error: any) {
    // El re-lanzamiento va primero: un 404 no es una falla del servidor y no debe ensuciar
    // el log de errores. Ver el mismo arreglo en suppliers/[id].get.ts.
    if (error.statusCode) {
      throw error
    }
    console.error('Error fetching anomaly details:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch anomaly details',
    })
  }
})
