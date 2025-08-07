import mongoose from 'mongoose'

let isConnected = false
let connectionPromise: Promise<typeof mongoose> | null = null

export async function connectToDatabase() {
  // If already connected, return immediately
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose
  }

  // If connection is in progress, wait for it
  if (connectionPromise) {
    return connectionPromise
  }

  try {
    console.log('🔌 Initiating database connection...')

    // Access environment variables directly in server context
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017'
    const mongoDatabase = process.env.MONGO_DATABASE || 'gastos_gub'

    const connectionString = `${mongoUri}/${mongoDatabase}`

    // Create connection promise
    connectionPromise = mongoose.connect(connectionString, {
      maxPoolSize: 50,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 300000,
      maxIdleTimeMS: 30000,
      bufferCommands: false, // Disable mongoose buffering
    })

    const connection = await connectionPromise

    isConnected = true
    connectionPromise = null
    console.log('✓ Connected to MongoDB successfully')

    return connection
  }
  catch (error) {
    connectionPromise = null
    isConnected = false
    console.error('❌ Failed to connect to MongoDB:', error)
    throw error
  }
}

// Utility function to ensure connection before database operations
export async function ensureConnection() {
  if (!isConnected || mongoose.connection.readyState !== 1) {
    await connectToDatabase()
  }
  return mongoose
}

export { mongoose }
