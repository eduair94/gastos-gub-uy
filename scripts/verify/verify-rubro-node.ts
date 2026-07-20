#!/usr/bin/env tsx
import { pickRubroNode, ancestorsForLeaf } from '../../shared/forecast/rubro-node'

function assert(c: unknown, m: string) { if (!c) throw new Error(`FAIL: ${m}`) }
const cat = { code: '28267', rubroTokens: ['F2', 'SF2.6', 'C2.6.5', 'SC2.6.5.3'], subfName: 'Sub', clasName: 'Clase X' }

const l3 = pickRubroNode(cat, 3)!
assert(l3.nodeId === 'C2.6.5', 'level 3 nodeId = clase token')
assert(l3.label === 'Clase X', 'level 3 label = clasName')
assert(l3.level === 3, 'level 3 level field')

const l2 = pickRubroNode(cat, 2)!
assert(l2.nodeId === 'SF2.6' && l2.label === 'Sub', 'level 2 = subfamilia token+label')

// Missing clase token → falls back to subfamilia.
const short = { code: '9', rubroTokens: ['F9', 'SF9.1'], subfName: 'S9' }
const fb = pickRubroNode(short, 3)!
assert(fb.nodeId === 'SF9.1' && fb.level === 2, 'level 3 falls back to subfamilia when clase absent')

assert(pickRubroNode(undefined, 3) === null, 'undefined catalog → null')
assert(pickRubroNode({ code: 'x' }, 3) === null, 'no tokens → null')

const anc = ancestorsForLeaf(cat)
assert(anc.includes('28267') && anc.includes('C2.6.5') && anc.includes('F2'), 'ancestors include leaf + all tokens')
console.log('OK verify-rubro-node')
