import assert from 'node:assert/strict'
import { parseItemFeatures, parseBuyObject } from '../../shared/utils/item-features'

const html = `
<p class="buy-object">Solución bicarbonatada molar</p>
<h3 class="buy-item-title-small">Ítem Nº&nbsp;1</h3>
<table><caption>Características del Ítem Nº 1</caption><tbody>
<tr><td>Marca</td><td>FARMACO URUGUAYO</td></tr>
<tr><td>Concentraci&oacute;n</td><td>8.4 %</td></tr>
<tr><td>Presentaci&oacute;n</td><td>CAJA</td></tr>
<tr><td>Medida presentaci&oacute;n</td><td>72 ENVASE FLEXIBLE</td></tr>
</tbody></table>
<ul><li>Variación:</li><li><strong>72 ENVASES 100 ML</strong></li></ul>`

const items = parseItemFeatures(html)
assert.equal(items.length, 1, 'one item')
assert.equal(items[0]!.nro, 1, 'nro parsed')
const f = Object.fromEntries(items[0]!.features.map(x => [x.name, x.value]))
assert.equal(f['Marca'], 'FARMACO URUGUAYO', 'marca')
assert.equal(f['Concentración'], '8.4 %', 'concentración decoded')
assert.equal(f['Presentación'], 'CAJA', 'presentación decoded')
assert.equal(items[0]!.variation, '72 ENVASES 100 ML', 'variación')
assert.equal(parseBuyObject(html), 'Solución bicarbonatada molar', 'object')
console.log('item-features.test OK')
