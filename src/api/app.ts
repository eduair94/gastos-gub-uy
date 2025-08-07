import cors from 'cors'
import express from 'express'
import { connectToDatabase } from '../database/mongodb-client'
import { Logger } from '../services/logger-service'

// Route imports
import analyticsRoutes from './routes/analytics'
import buyersRoutes from './routes/buyers'
import contractsRoutes from './routes/contracts'
import dashboardRoutes from './routes/dashboard'
import searchRoutes from './routes/search'
import suppliersRoutes from './routes/suppliers'

const app = express()
const logger = new Logger()
const PORT = process.env.API_PORT || 3001

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`)
  next()
})

// API Routes
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/contracts', contractsRoutes)
app.use('/api/suppliers', suppliersRoutes)
app.use('/api/buyers', buyersRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/search', searchRoutes)

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  })
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl
  })
})

// Global error handler
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled API error:', error)
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  })
})

// Start server
async function startServer() {
  try {
    // Connect to database
    await connectToDatabase()
    logger.info('✓ Connected to MongoDB')

    // Start Express server
    app.listen(PORT, () => {
      logger.info(`🚀 API Server running on port ${PORT}`)
      logger.info(`📊 Dashboard API available at http://localhost:${PORT}/api`)
      logger.info(`🔍 Health check: http://localhost:${PORT}/health`)
    })
  } catch (error) {
    logger.error('Failed to start server:', error as Error)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully')
  process.exit(0)
})

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully')
  process.exit(0)
})

if (require.main === module) {
  startServer()
}

export default app
