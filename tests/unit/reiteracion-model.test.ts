/**
 * El modelo de `reiteracion_docs`: que el esquema declare TODO campo de la interfaz.
 *
 * Un campo que está en la interfaz y NO en el Schema se pierde al guardar, en silencio y sin
 * error. Es la falla más cara de este repo y la más difícil de ver, así que se comprueba.
 *
 *   npx tsx tests/unit/reiteracion-model.test.ts
 */
import { ReiteracionDocModel } from '../../shared/models/reiteracion_doc'

const failures: string[] = []
function check(cond: boolean, msg: string) {
  if (!cond) failures.push(msg)
}

const paths = Object.keys(ReiteracionDocModel.schema.paths)
const REQUIRED = [
  'ocid', 'url', 'fetchedAt', 'httpStatus', 'hasText', 'textChars', 'text',
  'buyerId', 'buyerName', 'supplierIds', 'supplierNames', 'sourceYear', 'primaryAmount',
  'observed', 'reason', 'resolutionNumber', 'resolutionDate', 'breachedArticles',
  'authorityArticle', 'observedBy',
]
for (const p of REQUIRED) {
  check(paths.includes(p), `falta el campo "${p}" en el Schema`)
}
check(
  ReiteracionDocModel.collection.name === 'reiteracion_docs',
  `la colección es "${ReiteracionDocModel.collection.name}"`,
)

if (failures.length) {
  console.error(`✗ ${failures.length} fallo(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('✓ reiteracion-model: todo pasa')
