import mongoose from 'mongoose'
import { mongoUri } from '../config'

let connectionPromise: Promise<typeof mongoose> | null = null

/**
 * Redact the password from a connection string before logging it.
 * `mongodb://user:secret@host/db` → `mongodb://user:***@host/db`.
 *
 * This log line runs on every job spawn and every server boot, and pm2 keeps the
 * output on disk — printing the raw URI wrote the production DB password into
 * `logs/cronserver-out.log` in plaintext on every run. The host/user/db are kept
 * because they are what makes the line useful for debugging.
 */
export function maskMongoUri(uri: string): string {
  if (!uri) return uri
  return uri.replace(
    /^(mongodb(?:\+srv)?:\/\/)([^:@/?]+)(?::[^@]*)?@/i,
    (_match, scheme: string, user: string) => `${scheme}${user}:***@`,
  )
}

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
    console.log('Using MongoDB URI:', maskMongoUri(mongoUri))
    console.log('Current connection state:', mongoose.connection.readyState)

    // If mongoose is mid-(re)connect (2) or disconnecting (3) — e.g. its own auto-reconnect
    // after an idle-close — WAIT for that socket instead of calling disconnect(). Ripping out
    // an in-flight connection here was the root cause of intermittent SSR 404s: bufferCommands
    // is off, so every query issued during the teardown window throws, the API 500s, and the
    // page turned that into a "product not found" 404. Only connect fresh from state 0.
    const preState = mongoose.connection.readyState as number
    if (preState === 2 || preState === 3) {
      console.log(`⏳ Waiting for in-flight connection (state ${preState})...`)
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Timed out waiting for in-flight connection')), 10000)
          mongoose.connection.once('connected', () => { clearTimeout(timer); resolve() })
          mongoose.connection.once('error', (err) => { clearTimeout(timer); reject(err) })
        })
      }
      catch (waitError) {
        console.warn('⚠️ In-flight connection did not settle, reconnecting:', waitError)
      }
      if ((mongoose.connection.readyState as number) === 1) {
        connectionPromise = null
        return mongoose
      }
      // Still not ready (timed out or errored) — fall through to a clean reconnect from 0.
      if ((mongoose.connection.readyState as number) !== 0) {
        await mongoose.disconnect().catch(() => {})
      }
    }

    // MongoDB connection options optimized for performance and preventing overload
    const options = {
      // Connection pool settings to prevent MongoDB overload
      maxPoolSize: 50, // Maximum number of connections in the connection pool
      minPoolSize: 5, // Minimum number of connections in the connection pool
      maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
      
      // Timeout settings
      serverSelectionTimeoutMS: 10000, // How long to try selecting a server
      // How long a send or receive on a socket can take before timing out.
      //
      // 45s suits the web app, where any query taking that long is already a bug. It is far too
      // short for the batch jobs in src/jobs, whose aggregations legitimately run for minutes over
      // ~2.2M releases — they set MONGO_SOCKET_TIMEOUT_MS to raise it. Note this is an idle-socket
      // timeout, so a long-running aggregation trips it while the server is still working.
      socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS ?? 45000),
      connectTimeoutMS: 10000, // How long to wait for a connection to be established
      
      // Monitoring and retry settings
      heartbeatFrequencyMS: 10000, // How often to check server availability
      retryWrites: true, // Retry writes on transient network errors
      retryReads: true, // Retry reads on transient network errors
      
      // Performance optimizations
      bufferCommands: false, // Don't buffer commands when disconnected

      // Indexes are managed exclusively by scripts/ensure-indexes.ts.
      //
      // Mongoose defaults autoIndex to TRUE, which makes every process that
      // connects replay all ReleaseSchema.index() calls against a live ~2.1M
      // document collection on boot. That is slow at best, and any definition
      // that has drifted from what is deployed (e.g. a renamed text index)
      // turns into a hard error on startup. Build indexes deliberately, from
      // the migration script, not as a side effect of booting the app.
      autoIndex: false,
      
      // Write concern for better performance (adjust based on your consistency needs)
      writeConcern: {
        w: 1, // Acknowledge writes to primary only (faster)
        j: false, // Don't wait for journal acknowledgment (faster, but less durable)
      },
      
      // Read preference for better distribution
      readPreference: 'primaryPreferred' as const,
      
      // Compression to reduce network traffic
      compressors: ['zlib'] as ('zlib' | 'none' | 'snappy' | 'zstd')[],
      
      // Application name for monitoring
      appName: 'gastos-gub-dashboard',
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
