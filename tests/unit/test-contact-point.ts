import { pickPartyContact } from '../../shared/utils/contact-point'
import assert from 'node:assert'

// Real shape from ocid ocds-yfs5dr-1357118.
const sanCarlos = [{
  roles: ['procuringEntity'],
  name: 'Hospital de San Carlos',
  contactPoint: { name: 'Noelia García', telephone: '42669166 INT 151/152', faxNumber: '42669166 INT 151/152', email: 'compras.sancarlos@asse.com.uy' },
}]

const c = pickPartyContact(sanCarlos)
assert.deepStrictEqual(c, { name: 'Noelia García', telephone: '42669166 INT 151/152', email: 'compras.sancarlos@asse.com.uy' }, 'collapses fax==tel, keeps name/tel/email')

// procuringEntity preferred over buyer.
const both = [
  { roles: ['buyer'], name: 'B', contactPoint: { email: 'buyer@x.uy' } },
  { roles: ['procuringEntity'], name: 'P', contactPoint: { email: 'proc@x.uy' } },
]
assert.strictEqual(pickPartyContact(both)?.email, 'proc@x.uy', 'procuringEntity wins')

// Falls back to buyer when no procuringEntity contact.
const buyerOnly = [{ roles: ['buyer'], name: 'B', contactPoint: { telephone: '123' } }]
assert.deepStrictEqual(pickPartyContact(buyerOnly), { telephone: '123' }, 'buyer fallback, empties dropped')

// No usable contact → undefined.
assert.strictEqual(pickPartyContact([{ roles: ['supplier'], name: 'S', contactPoint: { email: 'a@b.uy' } }]), undefined, 'ignores non buyer/proc roles')
assert.strictEqual(pickPartyContact([{ roles: ['procuringEntity'], name: 'P', contactPoint: { faxNumber: '', name: '  ' } }]), undefined, 'no email/tel → undefined')
assert.strictEqual(pickPartyContact(null), undefined, 'null-safe')
assert.strictEqual(pickPartyContact([]), undefined, 'empty-safe')

console.log('OK test-contact-point')
