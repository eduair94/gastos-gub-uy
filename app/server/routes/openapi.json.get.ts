import { defineEventHandler, setHeader } from 'h3'
import { openApiDocument } from '../utils/openapi'

// Serves the OpenAPI 3.1 specification consumed by the Scalar docs at /docs
// and by any external OpenAPI tooling (Postman, code generators, etc.).
export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'application/json; charset=utf-8')
  setHeader(event, 'access-control-allow-origin', '*')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return openApiDocument
})
