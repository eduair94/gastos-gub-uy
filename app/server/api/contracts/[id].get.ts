import { createError, defineEventHandler, getRouterParam } from 'h3'
import { isValidObjectId } from 'mongoose'
import type { IRelease } from '../../../types'
import { connectToDatabase } from '../../utils/database'
import { ReleaseModel } from '../../utils/models'

export default defineEventHandler(async (event) => {
  try {
    await connectToDatabase()

    const contractId = getRouterParam(event, 'id')

    if (!contractId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Contract ID is required',
      })
    }

    // Build query conditions based on whether contractId is a valid ObjectId
    const queryConditions: Array<Record<string, string>> = [
      { id: contractId },
      { ocid: contractId },
    ]

    // Only add _id condition if contractId is a valid ObjectId
    if (isValidObjectId(contractId)) {
      queryConditions.push({ _id: contractId })
    }

    // Find contract by ID or OCID
    const contract = await ReleaseModel.findOne({
      $or: queryConditions,
    }).lean() as IRelease | null

    if (!contract) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Contract not found',
      })
    }

    // Calculate additional fields for the detailed view
    const enhancedContract = {
      ...contract,
      totalAmount: contract.awards?.reduce((total, award) => {
        const awardTotal = award.items?.reduce((awardSum, item) => {
          return awardSum + (item.unit?.value?.amount || 0)
        }, 0) || 0
        return total + awardTotal
      }, 0) || 0,
      supplierCount: contract.awards?.reduce((count, award) => {
        return count + (award.suppliers?.length || 0)
      }, 0) || 0,
      itemCount: contract.awards?.reduce((count, award) => {
        return count + (award.items?.length || 0)
      }, 0) || 0,
      documentCount: (contract.tender?.documents?.length || 0)
        + (contract.awards?.reduce((count, award) => {
          return count + (award.documents?.length || 0)
        }, 0) || 0),
    }

    return {
      success: true,
      data: enhancedContract,
    }
  }
  catch (error) {
    console.error('Error fetching contract details:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch contract details',
    })
  }
})
