/**
 * Organism groups — the taxonomy behind /analytics/organismos and /analytics/intendencias.
 *
 * Uruguay's `buyer.id` is `<inciso>-<unidad ejecutora>` (the national-budget numbering).
 * Ministries and ASSE fan out into MANY sub-units that share an inciso prefix, so a
 * ministry is aggregated by its inciso, while an Intendencia, a hospital or an ente is a
 * single buyer.id. This config is the single source of truth for both the monthly
 * precompute job (src/jobs/refresh-organism-groups.ts) and the read endpoints.
 *
 * `metric: 'perCapita'` marks the one group (Intendencias) where dividing by population is
 * the point; every other group compares absolute spend.
 *
 * Member `match`: `buyerId` = one exact buyer.id; `inciso` = every buyer.id whose prefix
 * (the part before the first '-') equals it. Names verified against the live DB.
 */
export type OrganismMetric = 'perCapita' | 'total'

export interface OrganismMemberSpec {
  /** Stable key: the buyer.id, or `inciso-<n>` for inciso-aggregated members. */
  key: string
  label: string
  /** Exact buyer.id. */
  buyerId?: string
  /** Aggregate every buyer.id whose inciso prefix equals this. */
  inciso?: string
}

export interface OrganismGroupSpec {
  key: string
  label: string
  labelEn: string
  metric: OrganismMetric
  blurbEs: string
  blurbEn: string
  members: OrganismMemberSpec[]
}

const DEPARTMENTS: [string, string][] = [
  ['80-1', 'Artigas'], ['81-1', 'Canelones'], ['82-1', 'Cerro Largo'], ['83-1', 'Colonia'],
  ['84-1', 'Durazno'], ['85-1', 'Flores'], ['86-1', 'Florida'], ['87-1', 'Lavalleja'],
  ['88-1', 'Maldonado'], ['89-1', 'Paysandú'], ['90-1', 'Río Negro'], ['91-1', 'Rivera'],
  ['92-1', 'Rocha'], ['93-1', 'Salto'], ['94-1', 'San José'], ['95-1', 'Soriano'],
  ['96-1', 'Tacuarembó'], ['97-1', 'Treinta y Tres'], ['98-1', 'Montevideo'],
]

export const ORGANISM_GROUPS: OrganismGroupSpec[] = [
  {
    key: 'intendencias',
    label: 'Intendencias',
    labelEn: 'Departmental governments',
    metric: 'perCapita',
    blurbEs: 'Los 19 gobiernos departamentales. Se comparan por gasto por habitante.',
    blurbEn: 'The 19 departmental governments, compared by spend per resident.',
    members: DEPARTMENTS.map(([id, name]) => ({ key: id, label: name, buyerId: id })),
  },
  {
    key: 'ministerios',
    label: 'Ministerios',
    labelEn: 'Ministries',
    metric: 'total',
    blurbEs: 'Cada ministerio agrega todas sus unidades ejecutoras (mismo inciso presupuestal).',
    blurbEn: 'Each ministry aggregates all its executing units (same budget inciso).',
    members: [
      { key: 'inciso-3', label: 'Defensa Nacional', inciso: '3' },
      { key: 'inciso-4', label: 'Interior', inciso: '4' },
      { key: 'inciso-5', label: 'Economía y Finanzas', inciso: '5' },
      { key: 'inciso-6', label: 'Relaciones Exteriores', inciso: '6' },
      { key: 'inciso-7', label: 'Ganadería, Agricultura y Pesca', inciso: '7' },
      { key: 'inciso-8', label: 'Industria, Energía y Minería', inciso: '8' },
      { key: 'inciso-9', label: 'Turismo', inciso: '9' },
      { key: 'inciso-10', label: 'Transporte y Obras Públicas', inciso: '10' },
      { key: 'inciso-11', label: 'Educación y Cultura', inciso: '11' },
      { key: 'inciso-12', label: 'Salud Pública', inciso: '12' },
      { key: 'inciso-13', label: 'Trabajo y Seguridad Social', inciso: '13' },
      { key: 'inciso-14', label: 'Vivienda y Ordenamiento Territorial', inciso: '14' },
      { key: 'inciso-15', label: 'Desarrollo Social', inciso: '15' },
      { key: 'inciso-36', label: 'Ambiente', inciso: '36' },
    ],
  },
  {
    key: 'salud',
    label: 'Salud pública y hospitales',
    labelEn: 'Public health & hospitals',
    metric: 'total',
    blurbEs: 'Hospitales de ASSE y direcciones de salud, comparados por gasto en compras.',
    blurbEn: 'ASSE hospitals and health directorates, compared by procurement spend.',
    members: [
      { key: '29-68', label: 'ASSE (central)', buyerId: '29-68' },
      { key: '12-103', label: 'Dirección General de la Salud', buyerId: '12-103' },
      { key: '29-6', label: 'Hospital Pasteur', buyerId: '29-6' },
      { key: '29-4', label: 'Centro Hospitalario Pereira Rossell', buyerId: '29-4' },
      { key: '29-5', label: 'Hospital Maciel', buyerId: '29-5' },
      { key: '29-76', label: 'Hospital Español', buyerId: '29-76' },
      { key: '29-7', label: 'Hospital Vilardebó', buyerId: '29-7' },
      { key: '29-12', label: 'Hospital Saint Bois', buyerId: '29-12' },
      { key: '29-102', label: 'Centro Hospitalario Maldonado-San Carlos', buyerId: '29-102' },
      { key: '29-63', label: 'Centro Geriátrico Piñeiro del Campo', buyerId: '29-63' },
      { key: '29-77', label: 'Hospital del Cerro', buyerId: '29-77' },
      { key: '29-88', label: 'Hospital de Ojos', buyerId: '29-88' },
      { key: '26-15', label: 'Hospital de Clínicas (UDELAR)', buyerId: '26-15' },
      { key: '3-33', label: 'Sanidad de las Fuerzas Armadas', buyerId: '3-33' },
      { key: '4-30', label: 'Sanidad Policial', buyerId: '4-30' },
    ],
  },
  {
    key: 'entes',
    label: 'Entes autónomos y descentralizados',
    labelEn: 'State-owned enterprises',
    metric: 'total',
    blurbEs: 'Empresas públicas, bancos estatales y servicios descentralizados.',
    blurbEn: 'Public enterprises, state banks and decentralized services.',
    members: [
      { key: '60-1', label: 'ANCAP', buyerId: '60-1' },
      { key: '61-1', label: 'UTE', buyerId: '61-1' },
      { key: '66-1', label: 'OSE', buyerId: '66-1' },
      { key: '65-1', label: 'ANTEL', buyerId: '65-1' },
      { key: '64-1', label: 'ANP (Puertos)', buyerId: '64-1' },
      { key: '51-1', label: 'BROU', buyerId: '51-1' },
      { key: '28-1', label: 'BPS', buyerId: '28-1' },
      { key: '53-1', label: 'Banco de Seguros (BSE)', buyerId: '53-1' },
      { key: '50-1', label: 'Banco Central (BCU)', buyerId: '50-1' },
      { key: '52-1', label: 'Banco Hipotecario (BHU)', buyerId: '52-1' },
      { key: '67-1', label: 'Correo Uruguayo', buyerId: '67-1' },
      { key: '68-1', label: 'Agencia Nacional de Vivienda', buyerId: '68-1' },
      { key: '70-1', label: 'Instituto Nacional de Colonización', buyerId: '70-1' },
      { key: '62-1', label: 'AFE (Ferrocarriles)', buyerId: '62-1' },
      { key: '27-1', label: 'INAU', buyerId: '27-1' },
    ],
  },
  {
    key: 'educacion',
    label: 'Educación pública',
    labelEn: 'Public education',
    metric: 'total',
    blurbEs: 'ANEP (primaria, secundaria, UTU, formación docente), UDELAR y UTEC.',
    blurbEn: 'ANEP (primary, secondary, UTU, teacher training), UDELAR and UTEC.',
    members: [
      { key: '25-1', label: 'ANEP — CODICEN', buyerId: '25-1' },
      { key: '25-2', label: 'Educación Primaria', buyerId: '25-2' },
      { key: '25-3', label: 'Educación Secundaria', buyerId: '25-3' },
      { key: '25-4', label: 'UTU (Técnico-Profesional)', buyerId: '25-4' },
      { key: '25-5', label: 'Formación en Educación', buyerId: '25-5' },
      { key: 'inciso-26', label: 'UDELAR (todas las facultades)', inciso: '26' },
      { key: '31-1', label: 'UTEC', buyerId: '31-1' },
    ],
  },
]

/** Does `buyerId` belong to this member? Exact id, or inciso-prefix aggregation. */
export function memberMatchesBuyerId(m: OrganismMemberSpec, buyerId: string): boolean {
  if (m.buyerId) return buyerId === m.buyerId
  if (m.inciso) return buyerId.split('-')[0] === m.inciso
  return false
}

export function organismGroup(key: string): OrganismGroupSpec | undefined {
  return ORGANISM_GROUPS.find(g => g.key === key)
}

/** Every buyer.id referenced by any exact-id member — the fast $match scope for the job. */
export function allExactBuyerIds(): string[] {
  const ids = new Set<string>()
  for (const g of ORGANISM_GROUPS)
    for (const m of g.members)
      if (m.buyerId) ids.add(m.buyerId)
  return [...ids]
}

/** Every inciso prefix referenced by any inciso member. */
export function allIncisos(): string[] {
  const inc = new Set<string>()
  for (const g of ORGANISM_GROUPS)
    for (const m of g.members)
      if (m.inciso) inc.add(m.inciso)
  return [...inc]
}
