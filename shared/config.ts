// Access environment variables directly in server context
export const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/gastos_gub'
export const mongoDatabase = process.env.MONGODB_DB || process.env.MONGO_DATABASE || 'gastos_gub'