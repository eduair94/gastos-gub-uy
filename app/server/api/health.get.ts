import { defineEventHandler } from 'h3'

export default defineEventHandler(async () => {
  return {
    success: true,
    message: 'API is working!',
    timestamp: new Date().toISOString(),
  }
})
