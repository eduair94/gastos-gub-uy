// Database plugin disabled - using on-demand connection in API routes instead
// This avoids Nitro initialization issues and timing problems

export default defineNuxtPlugin(() => {
  // Plugin disabled - database connections are handled directly in API routes
  console.log('📦 Database plugin disabled - using on-demand connections in API routes')
})
