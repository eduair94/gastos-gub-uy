import { onMounted, onUnmounted, readonly, ref } from 'vue'

interface DebounceOptions {
  delay?: number
  maxWait?: number
  leading?: boolean
  trailing?: boolean
}

interface PendingRequest {
  promise: Promise<any>
  resolve: (value: any) => void
  reject: (error: any) => void
  timestamp: number
}

class RequestManager {
  private pendingRequests = new Map<string, PendingRequest>()
  private debounceTimers = new Map<string, NodeJS.Timeout>()
  private requestCounts = new Map<string, number>()

  // Debounce function calls to prevent rapid-fire requests
  debounce<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    key: string,
    options: DebounceOptions = {},
  ): (...args: Parameters<T>) => Promise<ReturnType<T>> {
    const { delay = 300, maxWait = 1000, leading = false, trailing = true } = options

    return (...args: Parameters<T>): Promise<ReturnType<T>> => {
      const now = Date.now()

      return new Promise((resolve, reject) => {
        // Clear existing timer
        if (this.debounceTimers.has(key)) {
          clearTimeout(this.debounceTimers.get(key)!)
        }

        // Check if we should execute immediately (leading edge)
        const existingRequest = this.pendingRequests.get(key)
        if (leading && !existingRequest) {
          this.executeRequest(fn, args, key, resolve, reject)
          return
        }

        // Check if we've exceeded maxWait
        if (existingRequest && (now - existingRequest.timestamp) >= maxWait) {
          this.executeRequest(fn, args, key, resolve, reject)
          return
        }

        // Store the request for later execution
        this.pendingRequests.set(key, {
          promise: Promise.resolve(),
          resolve,
          reject,
          timestamp: existingRequest?.timestamp || now,
        })

        // Set up trailing execution
        if (trailing) {
          const timer = setTimeout(() => {
            const request = this.pendingRequests.get(key)
            if (request) {
              this.executeRequest(fn, args, key, request.resolve, request.reject)
            }
          }, delay)

          this.debounceTimers.set(key, timer)
        }
      })
    }
  }

  // Deduplicate identical requests
  dedupe<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    key: string,
  ): (...args: Parameters<T>) => Promise<ReturnType<T>> {
    return (...args: Parameters<T>): Promise<ReturnType<T>> => {
      const requestKey = `${key}:${JSON.stringify(args)}`

      // If there's already a pending request with the same key, return it
      const existingRequest = this.pendingRequests.get(requestKey)
      if (existingRequest) {
        return existingRequest.promise
      }

      // Create new request
      const promise = fn(...args)
        .finally(() => {
          // Clean up after request completes
          this.pendingRequests.delete(requestKey)
        })

      this.pendingRequests.set(requestKey, {
        promise,
        resolve: () => {},
        reject: () => {},
        timestamp: Date.now(),
      })

      return promise
    }
  }

  // Throttle requests to prevent too many concurrent requests
  throttle<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    key: string,
    maxPerSecond = 5,
  ): (...args: Parameters<T>) => Promise<ReturnType<T>> {
    return (...args: Parameters<T>): Promise<ReturnType<T>> => {
      const currentCount = this.requestCounts.get(key) || 0

      // Reset count every second
      setTimeout(() => {
        this.requestCounts.set(key, 0)
      }, 1000)

      if (currentCount >= maxPerSecond) {
        return Promise.reject(new Error('Request throttled - too many requests'))
      }

      this.requestCounts.set(key, currentCount + 1)
      return fn(...args)
    }
  }

  private executeRequest<T>(
    fn: (...args: any[]) => Promise<T>,
    args: any[],
    key: string,
    resolve: (value: T) => void,
    reject: (error: any) => void,
  ): void {
    this.pendingRequests.delete(key)
    this.debounceTimers.delete(key)

    fn(...args)
      .then(resolve)
      .catch(reject)
  }

  // Get statistics about current requests
  getStats() {
    return {
      pendingRequests: this.pendingRequests.size,
      activeTimers: this.debounceTimers.size,
      requestCounts: Object.fromEntries(this.requestCounts),
    }
  }

  // Clear all pending requests and timers
  clear() {
    this.debounceTimers.forEach(timer => clearTimeout(timer))
    this.debounceTimers.clear()
    this.pendingRequests.clear()
    this.requestCounts.clear()
  }
}

// Global request manager instance
const requestManager = new RequestManager()

// Composable for using optimized API requests
export const useOptimizedApi = () => {
  const api = useApi()

  // Create optimized versions of API methods
  const optimizedApi = {
    // Debounced search methods
    searchContracts: requestManager.debounce(
      api.getContracts.bind(api),
      'searchContracts',
      { delay: 500, maxWait: 2000 },
    ),

    searchSuppliers: requestManager.debounce(
      api.getSuppliers.bind(api),
      'searchSuppliers',
      { delay: 500, maxWait: 2000 },
    ),

    searchBuyers: requestManager.debounce(
      api.getBuyers.bind(api),
      'searchBuyers',
      { delay: 500, maxWait: 2000 },
    ),

    // Deduplicated filter loading
    getContractFilters: requestManager.dedupe(
      api.getContractFilters.bind(api),
      'contractFilters',
    ),

    // Throttled analytics requests
    getAnomalies: requestManager.throttle(
      api.getAnomalies.bind(api),
      'anomalies',
      3, // Max 3 requests per second
    ),

    getDashboardMetrics: requestManager.throttle(
      api.getDashboardMetrics.bind(api),
      'dashboardMetrics',
      2, // Max 2 requests per second
    ),

    // Regular methods with deduplication
    getContract: requestManager.dedupe(
      api.getContract.bind(api),
      'contract',
    ),

    getSupplier: requestManager.dedupe(
      api.getSupplier.bind(api),
      'supplier',
    ),

    getBuyer: requestManager.dedupe(
      api.getBuyer.bind(api),
      'buyer',
    ),
  }

  const stats = ref(requestManager.getStats())

  // Update stats periodically - only on client-side
  onMounted(() => {
    const updateStats = () => {
      stats.value = requestManager.getStats()
    }

    // Update immediately
    updateStats()

    // Set up periodic updates only on client-side
    const interval = setInterval(updateStats, 5000) // Update every 5 seconds

    // Clean up on unmount
    onUnmounted(() => {
      clearInterval(interval)
    })
  })

  return {
    ...optimizedApi,
    stats: readonly(stats),
    clearRequests: () => requestManager.clear(),
  }
}

export { requestManager }
