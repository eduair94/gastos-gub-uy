/**
 * Population of Uruguay's 19 departments, keyed by the gastos-gub `buyer.id` of
 * their Intendencia (`80-1` Artigas … `98-1` Montevideo).
 *
 * Source: INE (Instituto Nacional de Estadística) — Censos 2023, Resultados
 * Finales. National total 3,499,451; the 19 departments sum to exactly that.
 * https://www.gub.uy/instituto-nacional-estadistica/comunicacion/noticias/resultados-finales
 *
 * Used to turn departmental procurement spend into spend-per-resident on
 * /analytics/intendencias. Population is not in the procurement data, so this is
 * the join. Figures are census counts, cited — never estimate them.
 */
export interface DepartmentPopulation {
  department: string
  buyerId: string
  population: number
}

export const POPULATION_SOURCE = 'INE — Censo 2023'
export const POPULATION_SOURCE_URL = 'https://www.gub.uy/instituto-nacional-estadistica/comunicacion/noticias/resultados-finales'
export const POPULATION_CENSUS_YEAR = 2023

export const DEPARTMENT_POPULATION: Record<string, DepartmentPopulation> = {
  '80-1': { department: 'Artigas', buyerId: '80-1', population: 77487 },
  '81-1': { department: 'Canelones', buyerId: '81-1', population: 608956 },
  '82-1': { department: 'Cerro Largo', buyerId: '82-1', population: 91025 },
  '83-1': { department: 'Colonia', buyerId: '83-1', population: 135797 },
  '84-1': { department: 'Durazno', buyerId: '84-1', population: 62011 },
  '85-1': { department: 'Flores', buyerId: '85-1', population: 26271 },
  '86-1': { department: 'Florida', buyerId: '86-1', population: 70325 },
  '87-1': { department: 'Lavalleja', buyerId: '87-1', population: 59175 },
  '88-1': { department: 'Maldonado', buyerId: '88-1', population: 212951 },
  '89-1': { department: 'Paysandú', buyerId: '89-1', population: 121843 },
  '90-1': { department: 'Río Negro', buyerId: '90-1', population: 57334 },
  '91-1': { department: 'Rivera', buyerId: '91-1', population: 109300 },
  '92-1': { department: 'Rocha', buyerId: '92-1', population: 80707 },
  '93-1': { department: 'Salto', buyerId: '93-1', population: 136197 },
  '94-1': { department: 'San José', buyerId: '94-1', population: 119714 },
  '95-1': { department: 'Soriano', buyerId: '95-1', population: 83685 },
  '96-1': { department: 'Tacuarembó', buyerId: '96-1', population: 96013 },
  '97-1': { department: 'Treinta y Tres', buyerId: '97-1', population: 47706 },
  '98-1': { department: 'Montevideo', buyerId: '98-1', population: 1302954 },
}

/** National population = sum of the 19 departments (INE Censo 2023 = 3,499,451). */
export const URUGUAY_POPULATION = Object.values(DEPARTMENT_POPULATION)
  .reduce((sum, d) => sum + d.population, 0)
