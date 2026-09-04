/**
 * `isLocalMongoHost` decide si comprimir el wire de Mongo.
 *
 * La respuesta cambia el rendimiento en los dos sentidos. Contra loopback zlib
 * cuesta 1,61 veces más de wall clock y no ahorra nada. Contra la IP del server
 * ahorra 13,7 MB por página de 3.000 documentos. Un falso positivo apaga la
 * compresión en una máquina de desarrollo remota; un falso negativo la prende en
 * prod, que es el defecto que este cambio arregla.
 *
 * Corré: npx tsx tests/unit/test-local-mongo-host.ts
 */
import { isLocalMongoHost } from '../../shared/connection/database'

let failures = 0

function check(uri: string, expected: boolean, why: string) {
  const got = isLocalMongoHost(uri)
  if (got === expected) {
    console.log(`  ok   ${why}`)
    return
  }
  failures += 1
  console.error(`  FAIL ${why}\n       uri=${uri}\n       esperaba ${expected}, dio ${got}`)
}

console.log('local (comprimir NO):')
check('mongodb://localhost:27017/gastos_gub', true, 'localhost pelado')
check('mongodb://admin:secreto@localhost:27017', true, 'localhost con credenciales — la forma de prod')
check('mongodb://admin:secreto@localhost:27017/gastos_gub?authSource=admin', true, 'localhost con base y query')
check('mongodb://127.0.0.1:27017/gastos_gub', true, 'IPv4 de loopback')
check('mongodb://admin:p@127.0.0.1:27017', true, 'loopback IPv4 con credenciales')
check('mongodb://[::1]:27017/gastos_gub', true, 'IPv6 de loopback entre corchetes')
check('mongodb://LOCALHOST:27017', true, 'el host no distingue mayúsculas')
check('mongodb://localhost/gastos_gub', true, 'sin puerto')

console.log('remoto (comprimir SÍ):')
check('mongodb://admin:secreto@167.148.41.10:27017', false, 'la IP del server 167 — la forma de desarrollo')
check('mongodb://admin:secreto@167.148.41.10:27017/gastos_gub?authSource=admin', false, 'server 167 con query')
check('mongodb+srv://user:pass@cluster0.abcde.mongodb.net/gastos_gub', false, 'Atlas por mongodb+srv')
check('mongodb://mongo.interno:27017', false, 'nombre de host interno')
check('mongodb://a:b@host1:27017,host2:27017/db', false, 'replica set: manda el primer host')

console.log('bordes:')
check('', false, 'string vacío — sin host no se apaga la compresión')
check('no-es-una-uri', false, 'basura sin esquema')

// La contraseña puede traer una arroba escapada. El host es lo que va DESPUÉS de
// la última arroba, y una regex ingenua que corte en la primera se lleva la
// contraseña como host.
check('mongodb://admin:pa%40ss@localhost:27017', true, 'contraseña con @ escapado, host local')
check('mongodb://admin:pa%40ss@167.148.41.10:27017', false, 'contraseña con @ escapado, host remoto')

if (failures > 0) {
  console.error(`\n${failures} caso(s) fallaron`)
  process.exit(1)
}
console.log('\ntodos los casos pasaron')
