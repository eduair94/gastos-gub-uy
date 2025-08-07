// Auto-import definitions for Nuxt server
declare global {
  const defineEventHandler: typeof import('h3').defineEventHandler
  const createError: typeof import('h3').createError
  const getQuery: typeof import('h3').getQuery
  const readBody: typeof import('h3').readBody
  const setHeader: typeof import('h3').setHeader
  const setCookie: typeof import('h3').setCookie
  const getCookie: typeof import('h3').getCookie
  const useRuntimeConfig: typeof import('#app').useRuntimeConfig
}

export { }
