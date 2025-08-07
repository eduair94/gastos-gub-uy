import { createError, defineEventHandler } from 'h3'
import { connectToDatabase } from '../../utils/database'
import { FilterDataModel } from '../../utils/models'

export default defineEventHandler(async () => {
  try {
    await connectToDatabase()

    // Get all pre-computed filter data
    const filterData = await FilterDataModel.find().select('type data lastUpdated generatedFromReleases')

    // Initialize filters object with empty arrays
    const filters: {
      years: Array<{ value: string | number, label: string, count: number }>
      statuses: Array<{ value: string | number, label: string, count: number }>
      procurementMethods: Array<{ value: string | number, label: string, count: number }>
      suppliers: Array<{ value: string | number, label: string, count: number }>
      buyers: Array<{ value: string | number, label: string, count: number }>
    } = {
      years: [],
      statuses: [],
      procurementMethods: [],
      suppliers: [],
      buyers: [],
    }

    // Process each filter type from pre-computed data
    filterData.forEach((item) => {
      if (item.type === 'years') {
        filters.years = item.data.map(option => ({
          value: option.value,
          label: option.label,
          count: option.count,
        }))
      }
      else if (item.type === 'statuses') {
        filters.statuses = item.data.map(option => ({
          value: option.value,
          label: option.label,
          count: option.count,
        }))
      }
      else if (item.type === 'procurementMethods') {
        filters.procurementMethods = item.data.map(option => ({
          value: option.value,
          label: option.label,
          count: option.count,
        }))
      }
      else if (item.type === 'suppliers') {
        filters.suppliers = item.data.map(option => ({
          value: option.value,
          label: option.label,
          count: option.count,
        }))
      }
      else if (item.type === 'buyers') {
        filters.buyers = item.data.map(option => ({
          value: option.value,
          label: option.label,
          count: option.count,
        }))
      }
    })

    // Special handling for years - ensure proper format
    if (filters.years.length > 0) {
      filters.years = filters.years
        .filter(year => year.value && Number(year.value) > 2000)
        .sort((a, b) => Number(b.value) - Number(a.value))
    }

    // Get metadata about last update
    const metadata = filterData.reduce((acc, item) => {
      acc[item.type] = {
        lastUpdated: item.lastUpdated,
        generatedFromReleases: item.generatedFromReleases,
        optionCount: item.data.length,
      }
      return acc
    }, {})

    return {
      success: true,
      data: filters,
      meta: {
        lastUpdated: filterData.length > 0
          ? Math.max(...filterData.map(item => new Date(item.lastUpdated).getTime()))
          : null,
        totalFilterTypes: Object.keys(filters).length,
        precomputed: true,
        metadata,
      },
    }
  }
  catch (error) {
    console.error('Error fetching filter data:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch filter options',
    })
  }
})
