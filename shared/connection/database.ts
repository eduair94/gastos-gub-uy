import mongoose from 'mongoose'
import { mongoUri } from '../config'

let connectionPromise: Promise<typeof mongoose> | null = null

export async function connectToDatabase() {
  // If already connected and healthy, return immediately
  if (mongoose.connection.readyState === 1) {
    console.log('✓ Already connected to MongoDB')
    return mongoose
  }

  // If connection is in progress, wait for it
  if (connectionPromise) {
    console.log('⏳ Waiting for existing connection...')
    return connectionPromise
  }

  try {
    console.log('🔌 Initiating database connection...')
    console.log('Using MongoDB URI:', mongoUri)
    console.log('Current connection state:', mongoose.connection.readyState)

    // Disconnect if there's an existing connection in bad state
    if (mongoose.connection.readyState !== 0) {
      console.log('🔄 Disconnecting existing connection...')
      await mongoose.disconnect()
    }

    // MongoDB connection options optimized for performance
    const options = {
      serverSelectionTimeoutMS: 10000,
      bufferCommands: false,
    }

    // Create connection promise with proper error handling
    connectionPromise = mongoose.connect(mongoUri, options)

    const connection = await connectionPromise

    // Ensure connection is actually ready with retry logic
    let retries = 0
    const maxRetries = 10

    while ((mongoose.connection.readyState as number) !== 1 && retries < maxRetries) {
      console.log(`⏳ Waiting for connection to be ready... (${retries + 1}/${maxRetries})`)
      await new Promise(resolve => setTimeout(resolve, 1000))
      retries++
    }

    if ((mongoose.connection.readyState as number) !== 1) {
      throw new Error('Connection failed to become ready')
    }

    // Test the connection with a simple operation
    try {
      const db = mongoose.connection.db
      if (db) {
        await db.admin().ping()
        console.log('✓ Connection ping successful')
      }
    }
    catch (pingError) {
      console.warn('⚠️ Connection ping failed:', pingError)
    }

    // Set up connection event listeners
    mongoose.connection.on('connected', () => {
      console.log('✓ MongoDB connected successfully')
    })

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err)
      connectionPromise = null
    })

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected')
      connectionPromise = null
    })

    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB reconnected')
    })

    connectionPromise = null
    console.log('✓ MongoDB connection established and ready')
    console.log('Final connection state:', mongoose.connection.readyState)
    console.log('Database name:', mongoose.connection.db?.databaseName)

    // Keep the connection promise until we're sure it's stable
    return connection
  }
  catch (error) {
    connectionPromise = null
    console.error('❌ Failed to connect to MongoDB:', error)
    throw error
  }
}

// Utility function to ensure connection before database operations
export async function ensureConnection() {
  const readyState = mongoose.connection.readyState as number

  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if (readyState === 1) {
    return mongoose
  }

  if (readyState === 2) {
    // Connection is in progress, wait for it
    await new Promise((resolve, reject) => {
      mongoose.connection.once('connected', resolve)
      mongoose.connection.once('error', reject)
      // Timeout after 10 seconds
      setTimeout(() => reject(new Error('Connection timeout')), 10000)
    })
    return mongoose
  }

  // Need to establish new connection
  await connectToDatabase()
  return mongoose
}

export async function disconnectFromDatabase() {
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect()
    console.log('✓ Disconnected from MongoDB')
  }
}

export { mongoose }
