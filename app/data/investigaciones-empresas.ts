/**
 * Investigación · Empresas señaladas — proveedores del Estado uruguayo que fueron
 * señalados públicamente por corrupción, fraude o irregularidades en su relación con
 * organismos estatales, cruzados contra la base de Compras Estatales (OCDS) del sitio.
 *
 * Método (dos pasos, en ese orden, como pidió el encargo):
 *   1) Se partió de casos DOCUMENTADOS EN PRENSA Y JUSTICIA (Fiscalía, Poder Judicial,
 *      Tribunal de Cuentas, JUTEP). Cada acusación se verificó de forma adversarial contra
 *      ≥2 fuentes independientes; se corrigieron cifras y estados y se guardó el descargo.
 *   2) Recién entonces se buscó cada empresa en la base del sitio (colección supplier_patterns
 *      → releases) para ver si el señalamiento es VERIFICABLE en los datos abiertos: cuántos
 *      contratos, con qué organismos, por cuánto. Los números de `db` salen de esa consulta.
 *
 * Regla de objetividad (idéntica a las demás investigaciones): se nombran empresas solo en su
 * carácter de proveedoras del Estado y se marca el estado legal exacto. Un contrato observado,
 * una compra directa o un precio alto no es, por sí solo, prueba de delito. Se distingue lo
 * probado (condenas) de lo que es denuncia, investigación o pregunta abierta, y se incluye el
 * descargo. Cada empresa señalada puede ejercer su derecho a respuesta.
 *
 * Hallazgo transversal: varios de los escándalos MÁS grandes (Cardama, Gas Sayago/OAS, la
 * concesión de Katoen Natie, las estafas ganaderas) NO aparecen en la base — porque la compra
 * de defensa, las concesiones y los PPP quedan fuera del feed de Compras Estatales, y las
 * estafas privadas nunca fueron proveedoras del Estado. Esa invisibilidad es, en sí misma, un
 * dato de transparencia. Y donde la empresa SÍ está (ITHG, Saturno), la base a veces registra
 * una fracción mínima del dinero realmente gastado por vía directa.
 */

export type EmpSector = 'salud' | 'defensa' | 'seguridad' | 'energia' | 'obra' | 'intendencias' | 'estafas'
/** Estado legal, de más grave a más leve. Ordena y colorea el badge. */
export type EmpFlag = 'condena' | 'procesamiento' | 'imputacion' | 'denuncia' | 'investigacion' | 'observacion' | 'periodistica'

export interface EmpSource { outlet: string, url: string }
export interface Bi { es: string, en: string }

export interface EmpDb {
  /** ¿la empresa aparece como proveedora en la base de Compras Estatales del sitio? */
  inData: boolean
  /** id de proveedor (RUT) para enlazar a su ficha en el sitio (/suppliers/<id>). */
  supplierId?: string
  /** contratos registrados en la base (tag=award). */
  contracts?: number
  years?: string
  /** nota sobre lo que la base muestra (o el vacío que deja). */
  note?: Bi
  /** si no está en la base, por qué. */
  reason?: Bi
}

export interface EmpCase {
  key: string
  /** nombre tal como aparece en prensa / en la base. */
  company: string
  sector: EmpSector
  flag: EmpFlag
  db: EmpDb
  amount?: Bi
  allegation: Bi
  status: Bi
  /** el descargo / la precisión que evita el exceso — obligatorio por objetividad. */
  caveat: Bi
  sources: EmpSource[]
  /** slug de la investigación propia, si tiene página aparte. */
  deepDive?: string
}

const GOV = (id: string) => `https://www.comprasestatales.gub.uy/consultas/detalle/mostrar-llamado/1/id/${id}`

/* ============================================================================
 *  CATÁLOGO — empresas señaladas × ¿verificable en la base?
 * ========================================================================== */
export const EMP_CASES: EmpCase[] = [
  /* ---------------- SALUD / ASSE ---------------- */
  {
    key: 'ithg', company: 'ITHG Proveedores Marítimos', sector: 'salud', flag: 'denuncia',
    deepDive: 'asse-ambulancias',
    db: { inData: true, supplierId: 'R/218671240019', contracts: 5, years: '2021–2025',
      note: { es: 'La base registra apenas 5 fichas por ~$33 M; la auditoría de ASSE y el Tribunal de Cuentas documentan más de $2.000 M. El grueso se pagó por compra directa y casi no dejó rastro abierto.', en: 'The data shows just 5 records for ~$33 M; the ASSE audit and the Tribunal de Cuentas document over $2,000 M. The bulk was paid by direct purchase and left almost no open trace.' } },
    amount: { es: '~US$ 20 M en 3 años · US$ 800 mil por una sola ambulancia (2024)', en: '~US$20 M in 3 years · US$800k for a single ambulance (2024)' },
    allegation: { es: 'Sociedad creada en 2020 como proveedora marítima que pasó a concentrar el 96,47% del gasto en traslados del SAME 105 de ASSE mediante compras directas sin autorización del MSP, con precios sobre el mercado y una ambulancia pagada US$ 800 mil que hacía «un traslado cada dos días».', en: 'A firm created in 2020 as a maritime supplier that came to concentrate 96.47% of ASSE\'s SAME 105 transfer spending via direct purchases without MSP authorization, at above-market prices, with one ambulance paid US$800k that did "one trip every two days".' },
    status: { es: '100% del gasto observado por el Tribunal de Cuentas; denuncia penal de ASSE ante Fiscalía (abril 2026) contra el ex directorio (Leonardo Cipriani y otros).', en: '100% of spend observed by the Tribunal de Cuentas; ASSE criminal complaint (April 2026) against the former board (Leonardo Cipriani and others).' },
    caveat: { es: 'La empresa no está imputada formalmente: la causa penal apunta a los ex jerarcas de ASSE. El señalamiento a ITHG es de contratación (compra directa, concentración, precios), no una condena.', en: 'The company is not formally charged: the criminal case targets the former ASSE officials. The flag on ITHG is about contracting (direct purchase, concentration, prices), not a conviction.' },
    sources: [
      { outlet: 'la diaria', url: 'https://ladiaria.com.uy/salud/articulo/2023/5/asse-pago-20-millones-de-dolares-a-la-empresa-maritima-ithg-por-traslados-en-tres-anos-fueron-todas-compras-directas-y-observadas-por-el-tribunal-de-cuentas/' },
      { outlet: 'El Observador', url: 'https://www.elobservador.com.uy/nacional/investigacion-asse-se-pagaron-us-800-mil-ithg-un-ano-tener-disponible-una-ambulancia-que-hizo-un-traslado-cada-dos-dias-el-mides-n6041939' },
      { outlet: 'Búsqueda', url: 'https://www.busqueda.com.uy/informacion/tribunal-cuentas-observo-convenio-marco-asse-ambulancias-y-lo-envio-defensa-la-competencia-n5394027' },
    ],
  },
  {
    key: 'solidar', company: 'Solidar (JD&A SAS)', sector: 'salud', flag: 'observacion',
    deepDive: 'asse-ambulancias',
    db: { inData: true, supplierId: 'R/218890500016', contracts: 49, years: '2023–2026',
      note: { es: 'Figura en la base como JD&A S.A.S., proveedora de ambulancias de ASSE, con el mismo domicilio que ITHG.', en: 'Appears in the data as JD&A S.A.S., an ASSE ambulance supplier sharing ITHG\'s address.' } },
    allegation: { es: 'SAS de traslados creada en 2020 que comparte domicilio, equipos y contratos con ITHG y se presentó como competidora «independiente» en el convenio marco de ambulancias de ASSE.', en: 'A 2020 ambulance SAS that shares address, equipment and contracts with ITHG and bid as an "independent" competitor in ASSE\'s ambulance framework agreement.' },
    status: { es: 'El Tribunal de Cuentas observó el convenio marco (6 a 1, oct. 2024) por «indicios de prácticas prohibidas» contra la libre competencia y lo remitió a Defensa de la Competencia (MEF).', en: 'The Tribunal de Cuentas observed the framework (6-to-1, Oct 2024) citing "signs of prohibited practices" against competition and referred it to the antitrust body (MEF).' },
    caveat: { es: 'El convenio marco quedó suspendido y no entró en vigor. Solidar/JD&A operó sobre todo como subcontratista de ITHG; los grandes montos observados son de ITHG.', en: 'The framework was suspended and never took effect. Solidar/JD&A operated mainly as ITHG\'s subcontractor; the large observed amounts are ITHG\'s.' },
    sources: [
      { outlet: 'Búsqueda', url: 'https://www.busqueda.com.uy/informacion/tribunal-cuentas-observo-convenio-marco-asse-ambulancias-y-lo-envio-defensa-la-competencia-n5394027' },
      { outlet: 'M24', url: 'https://m24.com.uy/solidar-empresa-creada-en-2020-que-presta-traslados-en-ambulancias-para-asse-y-que-tiene-la-direccion-de-ithg-tambien-proveedora-del-organismo' },
    ],
  },
  {
    key: 'buena-estrella', company: 'Asociación Civil Buena Estrella', sector: 'salud', flag: 'condena',
    db: { inData: true, supplierId: 'R/216569940019', contracts: 1, years: '2010',
      note: { es: 'Aparece con un contrato en la base; el grueso de su facturación de limpieza a ASSE es anterior/paralelo al registro OCDS.', en: 'Appears with one contract; most of its ASSE cleaning billing predates/parallels the OCDS record.' } },
    amount: { es: 'Sobrefacturación probada de más de US$ 100 mil solo en el Hospital Maciel (2010–2011)', en: 'Proven over-billing of more than US$100k at Hospital Maciel alone (2010–2011)' },
    allegation: { es: 'Cooperativa de limpieza hospitalaria de ASSE que marcaba tarjetas de personal ausente y planillaba horas no facturables para inflar el monto cobrado. Un director de ASSE le pasó información reservada de licitaciones para que ganara.', en: 'An ASSE hospital-cleaning cooperative that clocked absent staff and logged non-billable hours to inflate its invoices. An ASSE director leaked it reserved tender information so it would win.' },
    status: { es: 'Condena firme: unas diez personas procesadas (2014) y el director de ASSE Alfredo Silva condenado (2018) por conjunción del interés personal y público (2 años, inhabilitación, multa de $2.143.420).', en: 'Final conviction: about ten people prosecuted (2014) and ASSE director Alfredo Silva convicted (2018) for conflict of interest (2 years, disqualification, $2,143,420 fine).' },
    caveat: { es: 'Silva era director de ASSE por los trabajadores; su condena fue por conjunción de interés, no por cohecho. El cohecho (coimas) recae sobre el sindicalista Heber Texeira y otros.', en: 'Silva was a worker-appointed ASSE director; his conviction was for conflict of interest, not bribery. The bribery counts fall on unionist Heber Texeira and others.' },
    sources: [
      { outlet: 'Poder Judicial', url: 'https://www.poderjudicial.gub.uy/institucional/item/529-diez-procesados-por-implicancia-con-sobrefacturacion-por-limpieza-hospitalaria.html' },
      { outlet: 'El Observador', url: 'https://www.elobservador.com.uy/nota/sindicalista-alfredo-silva-condenado-a-pagar-2-millones-por-corrupcion-en-asse-20186159120' },
      { outlet: 'Subrayado', url: 'https://www.subrayado.com.uy/justicia-condeno-exdirector-asse-alfredo-silva-pagar-multa-2-millones-n506586' },
    ],
  },
  {
    key: 'coimas-asse', company: 'Joaka · Onamérica · Apex (tercerizadas de ASSE)', sector: 'salud', flag: 'procesamiento',
    db: { inData: true, supplierId: 'R/216732860015', contracts: 81, years: '2010–2017',
      note: { es: 'Las tres figuran como proveedoras de servicios de ASSE: Joaka (66 contratos), Onamérica (10) y Asociación Apex (5). Onamérica siguió contratando con ASSE tras el escándalo.', en: 'All three appear as ASSE service suppliers: Joaka (66 contracts), Onamérica (10) and Asociación Apex (5). Onamérica kept contracting with ASSE after the scandal.' } },
    amount: { es: 'Coimas confesadas de ~$3.000 a ~$150.000 al referente sindical; Onamérica: ~$40 mil', en: 'Confessed kickbacks of ~$3,000 to ~$150,000 to the union boss; Onamérica: ~$40k' },
    allegation: { es: 'Empresas tercerizadas de limpieza, camillería y vigilancia en hospitales de ASSE cuyos titulares pagaron coimas a Heber Texeira, jefe sindical de las tercerizadas, para acelerar los pagos de ASSE y mantener sus contratos.', en: 'Outsourced cleaning, portering and security firms in ASSE hospitals whose owners paid kickbacks to Heber Texeira, the union boss of the outsourced staff, to speed up ASSE\'s payments and keep their contracts.' },
    status: { es: 'Procesamiento (julio 2014) por cohecho simple continuado de los responsables de cuatro firmas (Apex, Jorge Lucero, Onamérica y Joaka); Texeira, procesado con prisión.', en: 'Prosecution (July 2014) for continued simple bribery of the owners of four firms (Apex, Jorge Lucero, Onamérica and Joaka); Texeira jailed.' },
    caveat: { es: 'Según la Justicia, las coimas buscaban acelerar los pagos (ASSE pagaba cada ~90 días), no adjudicarse los contratos. Onamérica fue procesada sin prisión.', en: 'Per the court, the kickbacks aimed to speed up payments (ASSE paid every ~90 days), not to win the contracts. Onamérica was prosecuted without jail.' },
    sources: [
      { outlet: 'AFUSEC', url: 'https://afusec.wordpress.com/2016/06/02/asse-contrato-otra-vez-a-una-firma-de-procesado-por-coima/' },
      { outlet: 'El Observador', url: 'https://www.elobservador.com.uy/nota/los-manchados-de-la-izquierda-2015726500' },
    ],
  },
  {
    key: 'covid-tapabocas', company: 'Sakira · Macromar (tapabocas COVID)', sector: 'salud', flag: 'periodistica',
    db: { inData: true, supplierId: 'R/214058390017', contracts: 3119, years: '2020–2026',
      note: { es: 'Ambas figuran como proveedoras de EPP del Estado: Sakira (3.119 contratos, insumos médicos) y Macromar (2.027). Sí vendieron tapabocas al Estado durante la emergencia.', en: 'Both appear as State PPE suppliers: Sakira (3,119 contracts, medical supplies) and Macromar (2,027). They did sell face masks to the State during the emergency.' } },
    amount: { es: 'Tapabocas pagados hasta 3–4× su costo de importación (compra de emergencia, sin control de margen)', en: 'Face masks paid up to 3–4× their import cost (emergency purchase, no margin control)' },
    allegation: { es: 'Durante la emergencia COVID-19 el Estado compró tapabocas por compra directa a precios muy por encima del costo de importación. La investigación de la diaria (red PALTA) documentó el sobreprecio; Sakira y Macromar están entre las proveedoras.', en: 'During the COVID-19 emergency the State bought face masks by direct purchase at prices far above import cost. la diaria\'s investigation (PALTA network) documented the markup; Sakira and Macromar are among the suppliers.' },
    status: { es: 'Señalamiento periodístico; sin proceso judicial contra las empresas.', en: 'Press flag; no judicial process against the firms.' },
    caveat: { es: 'El sobreprecio 3–4× es una conclusión GENERAL sobre el conjunto de compras de emergencia, no una imputación de ilegalidad a Sakira o Macromar en particular.', en: 'The 3–4× markup is a GENERAL finding about the set of emergency purchases, not an accusation of illegality against Sakira or Macromar specifically.' },
    sources: [
      { outlet: 'la diaria', url: 'https://ladiaria.com.uy/politica/articulo/2020/6/cuidarse-de-la-covid-19-sale-caro-el-estado-compra-tapabocas-al-triple-de-su-costo-de-importacion/' },
      { outlet: 'Compras Estatales', url: 'https://www.comprasestatales.gub.uy/consultas/detalle/id/833955' },
    ],
  },

  /* ---------------- DEFENSA / FF.AA. ---------------- */
  {
    key: 'saturno', company: 'Frigorífico Saturno (Abasto de Carnes Saturno)', sector: 'defensa', flag: 'investigacion',
    deepDive: 'frigorifico-saturno',
    db: { inData: true, supplierId: 'R/110175450017', contracts: 283, years: '2012–2026',
      note: { es: 'Gran proveedor de carne del Estado: 283 contratos por ~$1.140 M, con INDA, el Ejército, la Armada, la Fuerza Aérea y Sanidad Militar. El caso penal recae sobre las compras de la Armada.', en: 'A major State meat supplier: 283 contracts for ~$1,140 M, with INDA, the Army, the Navy, the Air Force and Military Health. The criminal case concerns the Navy\'s purchases.' } },
    amount: { es: 'Faltante de ~57 toneladas (~$8,4 M) entre las licitaciones 28/2021 y 28/2022 de la Armada', en: 'Shortfall of ~57 tonnes (~$8.4 M) between the Navy\'s tenders 28/2021 and 28/2022' },
    allegation: { es: 'Proveedor de carne de la Armada desde 2013. En la causa por decenas de toneladas «desaparecidas» se detectaron sobreprecios y cortes no licitados: se encargaba lomo pese a que la adjudicación era por bondiola, y el frigorífico fijaba precios muy por encima del mercado descontándolos de entregas pendientes. Se hallaron 26 remitos con sellos y firmas irregulares.', en: 'A Navy meat supplier since 2013. In the case over dozens of "disappeared" tonnes, over-prices and un-tendered cuts were found: officers ordered sirloin though the award was for shoulder, and the plant set well-above-market prices, deducting them from pending deliveries. 26 delivery notes had irregular stamps and signatures.' },
    status: { es: 'Investigación de la Fiscalía de Delitos Económicos y Complejos (fiscal Sandra Fleitas); denuncia penal de la Armada (fines de 2022); 12 oficiales citados.', en: 'Investigation by the Economic & Complex Crimes Prosecutor (Sandra Fleitas); Navy criminal complaint (late 2022); 12 officers summoned.' },
    caveat: { es: 'La investigación penal se centra en los oficiales de la Armada. El frigorífico no está imputado formalmente, aunque sus precios y remitos están cuestionados.', en: 'The criminal probe centers on the Navy officers. The plant is not formally charged, though its prices and delivery notes are under question.' },
    sources: [
      { outlet: 'El Observador', url: 'https://www.elobservador.com.uy/nacional/almirantes-encargaban-lomo-un-frigorifico-que-habia-ganado-licitacion-bondiola-n6014952' },
      { outlet: 'El Observador', url: 'https://www.elobservador.com.uy/nacional/la-armada-denuncio-fiscalia-maniobras-irregulares-sus-compras-carne-frutas-y-verduras-n5988016' },
      { outlet: 'Montevideo Portal', url: 'https://www.montevideo.com.uy/Noticias/Compras-de-carne-en-Armada-se-detectaron-sobreprecios-y-mas-toneladas-desaparecidas--uc935220' },
    ],
  },
  {
    key: 'floridian', company: 'Floridian S.A. (avión presidencial)', sector: 'defensa', flag: 'observacion',
    db: { inData: true, supplierId: 'R/215414070012', contracts: 1, years: '2017',
      note: { es: 'Una sola ficha en la base: la compra del avión presidencial a la Fuerza Aérea por US$ 1.010.000 (ficha 512129, 2017). Verificable de punta a punta.', en: 'A single record: the presidential plane bought for the Air Force for US$1,010,000 (record 512129, 2017). Fully verifiable.' } },
    amount: { es: 'US$ 1.010.000 (Hawker HS-125-700A usado de 38 años); rematado en 2020 por US$ 180.000', en: 'US$1,010,000 (a 38-year-old used Hawker HS-125-700A); auctioned in 2020 for US$180,000' },
    allegation: { es: 'Único oferente y adjudicatario de la Licitación Pública 20/2016 de la Fuerza Aérea para el avión presidencial. El Tribunal de Cuentas la observó por «dirigida»: antigüedad máxima de 40 años (el avión tenía 38), mínimo de 8 pasajeros (llevaba exactamente 8) y un plazo de 60 días para el certificado de aeronavegabilidad imposible de cumplir por competidores.', en: 'Sole bidder and winner of the Air Force\'s Public Tender 20/2016 for the presidential plane. The Tribunal de Cuentas flagged it as "tailored": max age 40 years (the plane was 38), minimum 8 passengers (it carried exactly 8), and a 60-day airworthiness-certificate deadline impossible for competitors to meet.' },
    status: { es: 'Observación reiterada del Tribunal de Cuentas (voto 4-3) e interpelación al Ministro de Defensa; sin proceso penal. Un ministro del Tribunal dijo no haber visto nunca una licitación «tan dirigida».', en: 'Repeated Tribunal de Cuentas observation (4-3 vote) and parliamentary questioning of the Defense Minister; no criminal case. A Tribunal member said he had never seen a tender "so tailored".' },
    caveat: { es: 'La compra se ejecutó y el propio Tribunal de Cuentas terminó levantando la observación por mayoría. Floridian es la distribuidora local de Mercedes-Benz; nunca fue imputada.', en: 'The purchase went ahead and the Tribunal de Cuentas itself later lifted the observation by majority. Floridian is the local Mercedes-Benz dealer; it was never charged.' },
    sources: [
      { outlet: 'Montevideo Portal', url: 'https://www.montevideo.com.uy/Noticias/Tribunal-de-Cuentas-observo-licitacion-de-avion-presidencial-ante-sospechas-en-llamado-uc328567' },
      { outlet: 'Defensa.com', url: 'https://www.defensa.com/uruguay/ministro-defensa-uruguayo-debera-comparecer-parlamento-sospechas' },
      { outlet: 'LaRed21', url: 'https://www.lr21.com.uy/comunidad/1321060-tribunal-de-cuentas-levanta-observacion-a-compra-de-avion-presidencial' },
    ],
  },
  {
    key: 'cardama', company: 'Astillero Cardama (patrulleros de la Armada)', sector: 'defensa', flag: 'denuncia',
    db: { inData: false, reason: { es: 'La compra militar de gran porte no pasa por Compras Estatales: el mayor escándalo de contratación reciente (€82 M) no deja ninguna ficha en la base.', en: 'Large military procurement does not go through Compras Estatales: the biggest recent contracting scandal (€82 M) leaves no record in the data.' } },
    amount: { es: 'Contrato de €82,2 M por dos patrulleros oceánicos; el Estado transfirió ~US$ 30 M antes de rescindir', en: '€82.2 M contract for two ocean patrol vessels; the State wired ~US$30 M before rescinding' },
    allegation: { es: 'El astillero español ganó en 2023 la construcción de dos patrulleros para la Armada. El gobierno detectó «indicios de estafa/fraude»: la garantía estaba avalada por EuroCommerce, una firma británica en liquidación, sin sede real ni empleados y con un director ruso.', en: 'The Spanish shipyard won the 2023 build of two patrol vessels for the Navy. The government found "signs of fraud/estafa": the guarantee was backed by EuroCommerce, a UK firm in liquidation with no real premises, no staff and a Russian director.' },
    status: { es: 'Contrato rescindido (2025-2026); denuncia penal por fraude y estafa ante la Fiscalía de Delitos Económicos; acciones civiles y administrativas para recuperar el dinero.', en: 'Contract rescinded (2025-2026); criminal complaint for fraud/estafa before the Economic Crimes Prosecutor; civil and administrative actions to recover the money.' },
    caveat: { es: 'Cardama niega el fraude y lo llama «tema político»; inició su propia acción legal contra el Estado. El avance real de obra está en disputa (inspectores reportaron 16 de 27 bloques unidos).', en: 'Cardama denies fraud, calling it "political"; it filed its own legal action against the State. The actual build progress is disputed (inspectors reported 16 of 27 blocks joined).' },
    sources: [
      { outlet: 'Presidencia (gub.uy)', url: 'https://www.gub.uy/presidencia/comunicacion/noticias/gobierno-rescindira-contrato-empresa-cardama-compra-patrullas-oceanicas' },
      { outlet: 'Infobae', url: 'https://www.infobae.com/america/america-latina/2025/10/23/uruguay-rescinde-contrato-con-astillero-espanol-cardama-por-patrullas-oceanicas-hay-indicios-de-estafa/' },
      { outlet: 'MercoPress', url: 'https://es.mercopress.com/2025/10/25/uruguay-denuncia-por-fraude-al-astillero-espanol-cardama-la-empresa-responde-es-un-tema-politico' },
    ],
  },
  {
    key: 'lunacar', company: 'Lunacar S.A. / Vertical Skies (caso Astesiano)', sector: 'defensa', flag: 'investigacion',
    db: { inData: true, supplierId: 'R/218342050015', contracts: 6, years: '2021–2023',
      note: { es: 'Figura en la base con 6 contratos (~$11 M). El dron de US$ 749 mil a UTE y las ventas a Defensa aparecen ligados a Vertical Skies vía Lunacar.', en: 'Appears with 6 contracts (~$11 M). The US$749k drone to UTE and Defense sales are tied to Vertical Skies via Lunacar.' } },
    amount: { es: 'Dron a UTE por US$ 749.000; un empresario declaró pagos de US$ 170.000 a Astesiano/Vertical Skies por «licitaciones ganadas»', en: 'US$749,000 drone to UTE; a businessman testified paying US$170,000 to Astesiano/Vertical Skies for "won tenders"' },
    allegation: { es: 'En el caso Astesiano, la firma estadounidense Vertical Skies vendió al Estado a través de su vehículo uruguayo Lunacar S.A., con Astesiano como intermediario: mochilas tácticas y equipo a Defensa y un dron a UTE. El gerente de Vertical Skies pidió a Astesiano fichas de espionaje sobre senadores.', en: 'In the Astesiano case, US firm Vertical Skies sold to the State through its Uruguayan vehicle Lunacar S.A., with Astesiano as broker: tactical gear to Defense and a drone to UTE. Vertical Skies\' manager asked Astesiano for espionage dossiers on senators.' },
    status: { es: 'Investigación fiscal (caso Astesiano); Marcelo Acuña (gerente) condenado a 18 meses por el espionaje a senadores; una adjudicación en Defensa fue cancelada «por prudencia».', en: 'Prosecutorial investigation (Astesiano case); manager Marcelo Acuña sentenced to 18 months for spying on senators; a Defense award was cancelled "out of prudence".' },
    caveat: { es: 'La condena a Acuña es por el espionaje, no por las ventas al Estado; la investigación sobre las adjudicaciones sigue abierta.', en: 'Acuña\'s conviction is for the espionage, not the State sales; the probe into the awards remains open.' },
    sources: [
      { outlet: 'la diaria', url: 'https://ladiaria.com.uy/justicia/articulo/2023/7/empresario-declaro-que-pago-170000-dolares-a-astesiano-y-vertical-skies-para-supuestas-licitaciones-ganadas-con-el-ministerio-de-defensa/' },
      { outlet: 'Montevideo Portal', url: 'https://www.montevideo.com.uy/Noticias/Caso-Astesiano-empresa-que-pidio-espiar-a-senadores-proveyo-a-Defensa-y-UTE-uc839645' },
      { outlet: 'El Observador', url: 'https://www.elobservador.com.uy/nota/ute-intimo-a-subsidiaria-de-vertical-skies-a-que-le-entregara-un-dron-que-le-compro-202332111340' },
    ],
  },

  /* ---------------- SEGURIDAD / VIGILANCIA ---------------- */
  {
    key: 'digitro', company: 'Dígitro Tecnologia («El Guardián»)', sector: 'seguridad', flag: 'observacion',
    db: { inData: true, supplierId: 'X/BRA83.472.803/0001-76', contracts: 12, years: '2017–2024',
      note: { es: 'La proveedora brasileña figura en la base (~$115 M) pese a que las compras del sistema de espionaje se hicieron en modalidad secreta.', en: 'The Brazilian supplier appears in the data (~$115 M) even though the spyware purchases were made under a secrecy regime.' } },
    amount: { es: 'Compra original ~US$ 2 M (2013) + ~US$ 200 mil/año; ampliación «Guardián Online» US$ 1.098.060 (2022)', en: 'Original purchase ~US$2 M (2013) + ~US$200k/yr; "Guardián Online" upgrade US$1,098,060 (2022)' },
    allegation: { es: 'Proveedora del sistema de interceptación legal de comunicaciones «El Guardián» del Ministerio del Interior. La compra original y la ampliación se hicieron por compra directa por excepción en modalidad secreta, sin licitación y ocultas del registro, lo que impidió el control público.', en: 'Supplier of the Interior Ministry\'s "El Guardián" lawful-interception system. The original purchase and the upgrade were done by exception direct-purchase under a secrecy regime, without tender and hidden from the record, blocking public oversight.' },
    status: { es: 'Autorizada por el Tribunal de Cuentas; cuestionada por senadores (pedidos de informes de Charles Carrera) y bajo escrutinio tras el caso Astesiano por el uso de los sistemas de vigilancia del Interior.', en: 'Authorized by the Tribunal de Cuentas; questioned by senators (Charles Carrera\'s information requests) and scrutinized after the Astesiano case over the use of Interior\'s surveillance systems.' },
    caveat: { es: 'No hay imputación penal contra la empresa: el señalamiento es de transparencia/contratación. En el caso Astesiano el señalado por uso indebido es el funcionario, no Dígitro.', en: 'No criminal charge against the firm: the flag is about transparency/contracting. In the Astesiano case the misuse points to the official, not Dígitro.' },
    sources: [
      { outlet: 'Montevideo Portal', url: 'https://www.montevideo.com.uy/Noticias/Tribunal-de-Cuentas-autorizo-compra-secreta-de-nuevas-funcionalidades-de-El-Guardian-uc838118' },
      { outlet: 'El Observador', url: 'https://www.elobservador.com.uy/nota/fabricante-de-el-guardian-envio-carta-al-ministerio-del-interior-por-caso-astesiano-2022112620140' },
    ],
  },
  {
    key: 'elbit', company: 'Elbit Security Systems (cámaras de Maldonado)', sector: 'seguridad', flag: 'observacion',
    db: { inData: true, supplierId: 'X/ISR514046283', contracts: 3, years: '2016–2023',
      note: { es: 'La israelí figura en la base (Elbit Systems Land & C4I + un registro «Elbit System» de 2016 por ~$607 M).', en: 'The Israeli firm appears in the data (Elbit Systems Land & C4I + an "Elbit System" 2016 record for ~$607 M).' } },
    amount: { es: '1.200 cámaras por US$ 18,5 M (otras fuentes: +US$ 27 M) · ~3× el precio de cámaras licitadas', en: '1,200 cameras for US$18.5 M (other sources: +US$27 M) · ~3× the price of tendered cameras' },
    allegation: { es: 'La Intendencia de Maldonado contrató directamente —sin licitación— a Elbit para 1.200 cámaras de videovigilancia. El Ministerio del Interior señaló que costaron «tres veces más» que las adquiridas por licitación pública, y la información se mantuvo oculta más de un año.', en: 'The Maldonado departmental government directly contracted Elbit —no tender— for 1,200 surveillance cameras. The Interior Ministry said they cost "three times more" than tendered ones, and the information was hidden for over a year.' },
    status: { es: 'Observación del Tribunal de Cuentas por la contratación directa; fuerte controversia parlamentaria; la Justicia obligó a divulgar la información.', en: 'Tribunal de Cuentas observation over the direct contract; strong parliamentary controversy; the courts forced disclosure.' },
    caveat: { es: 'Es una observación de contratación (precio y método), no una condena. La comparación de precios proviene del propio Ministerio del Interior.', en: 'It is a contracting observation (price and method), not a conviction. The price comparison comes from the Interior Ministry itself.' },
    sources: [
      { outlet: 'Brecha', url: 'https://brecha.com.uy/el-negocio-de-videovigilancia-israeli-en-maldonado-sonrie/' },
      { outlet: 'Tribunal de Cuentas', url: 'https://www.tcr.gub.uy/resoluciones_busqueda.php?id=34859' },
    ],
  },
  {
    key: 'ddba', company: 'DDBA (reconocimiento facial)', sector: 'seguridad', flag: 'investigacion',
    db: { inData: true, supplierId: 'X/USA35-2602169', contracts: 1, years: '2020',
      note: { es: 'Su vehículo CDT Latam figura en la base por el software forense de reconocimiento facial comprado por la Policía (2020, ~US$ 16,7 M en pesos).', en: 'Its vehicle CDT Latam appears in the data for the police forensic facial-recognition software (2020, ~US$16.7 M in pesos).' } },
    amount: { es: 'Cámaras del Centenario ~US$ 1.254.000 (vs US$ 1.081.000 de Servinfo, 16% más barata); software policial ~US$ 639.000', en: 'Centenario cameras ~US$1,254,000 (vs Servinfo\'s US$1,081,000, 16% cheaper); police software ~US$639,000' },
    allegation: { es: 'Integradora del software español Herta Security. Según documentos y grabaciones, el Ministerio del Interior fue «determinante» para que la AUF adjudicara a DDBA las cámaras de reconocimiento facial del Estadio Centenario (2016) pese a una oferta rival técnicamente mejor y ~16% más barata.', en: 'Integrator of Spain\'s Herta Security software. Per documents and recordings, the Interior Ministry was "decisive" in the AUF awarding DDBA the Estadio Centenario facial-recognition cameras (2016) despite a rival bid rated better and ~16% cheaper.' },
    status: { es: 'Investigación fiscal (fiscal Silvia Pérez) y de la Comisión de Ética de la FIFA a dirigentes de la AUF; denuncias de clubes.', en: 'Prosecutorial investigation (Silvia Pérez) and a FIFA Ethics Committee probe of AUF officials; complaints by clubs.' },
    caveat: { es: 'La licitación de 2016 la corrió la AUF (privada), no el Estado; el elemento estatal es la presión del Interior. La fiscal dijo no hallar indicios de que una empresa se beneficiara ilícitamente.', en: 'The 2016 tender was run by the AUF (private), not the State; the state element is Interior\'s pressure. The prosecutor said she found no sign a company benefited illicitly.' },
    sources: [
      { outlet: 'Subrayado', url: 'https://www.subrayado.com.uy/el-ministerio-del-interior-fue-determinante-la-contratacion-camaras-la-auf-n511293' },
      { outlet: 'El Observador', url: 'https://www.elobservador.com.uy/nota/lea-los-documentos-de-las-camaras-interior-insistio-hasta-ultimo-momento-en-rechazar-las-camaras-elegidas-por-la-auf-201881319570' },
    ],
  },

  /* ---------------- ENERGÍA / ANCAP ---------------- */
  {
    key: 'trafigura', company: 'Trafigura (crudo de Ancap)', sector: 'energia', flag: 'investigacion',
    db: { inData: true, supplierId: 'X/SGPGST19-9601595-D', contracts: 94, years: '2019–2025',
      note: { es: 'Es hoy uno de los mayores proveedores del Estado en la base: ~$86.000 M nominales por crudo y derivados a Ancap. La cifra está inflada por el volumen del petróleo, pero el vínculo es real y masivo.', en: 'Today one of the State\'s largest suppliers in the data: ~$86,000 M nominal in crude and products to Ancap. The figure is inflated by oil volume, but the link is real and massive.' } },
    amount: { es: 'Intermediación con Petroecuador por ~US$ 4.900 M; ganancia de Trafigura ~US$ 200 M; perjuicio a Petroecuador ~US$ 206 M', en: 'Petroecuador intermediation of ~US$4,900 M; Trafigura gain ~US$200 M; harm to Petroecuador ~US$206 M' },
    allegation: { es: 'Ancap contrató a Trafigura como intermediaria para operaciones de crudo con la ecuatoriana Petroecuador (2010-2011) sin licitación ni procedimiento competitivo, dándole una «posición extremadamente ventajosa» y operando meses sin contrato firmado. El caso se liga a la trama internacional de corrupción de Petroecuador.', en: 'Ancap contracted Trafigura as intermediary for crude swaps with Ecuador\'s Petroecuador (2010-2011) without tender or competition, granting it an "extremely advantageous position" and operating for months with no signed contract. The case is tied to the international Petroecuador corruption scheme.' },
    status: { es: 'La Fiscalía de Crimen Organizado (fiscal Luis Pacheco) pidió el procesamiento de Raúl Sendic y otros ex jerarcas de Ancap (2018).', en: 'The Organized Crime Prosecutor (Luis Pacheco) sought the prosecution of Raúl Sendic and other former Ancap officials (2018).' },
    caveat: { es: 'En el punto Trafigura, los directores acusados fueron absueltos por la Suprema Corte (2020); Sendic fue condenado, pero por otras causas (tarjetas y caso Exor), no por la intermediación de Trafigura.', en: 'On the Trafigura count, the charged directors were acquitted by the Supreme Court (2020); Sendic was convicted, but on other counts (cards and the Exor case), not the Trafigura intermediation.' },
    sources: [
      { outlet: 'El Observador', url: 'https://www.elobservador.com.uy/nota/fiscal-encontro-delito-en-seis-de-ocho-denuncias-por-ancap--2018320500' },
      { outlet: 'El Observador', url: 'https://www.elobservador.com.uy/nota/mencionan-a-ancap-en-investigacion-internacional-por-corrupcion-de-petroecuador-202412217195' },
    ],
  },
  {
    key: 'exor', company: 'Exor (deuda de Ancap con PDVSA)', sector: 'energia', flag: 'condena',
    db: { inData: false, reason: { es: 'La intermediación financiera de Ancap no pasa por Compras Estatales; Exor no aparece como proveedora en la base.', en: 'Ancap\'s financial intermediation does not go through Compras Estatales; Exor does not appear as a supplier.' } },
    amount: { es: 'Comisión del 1,75% sobre US$ 321,8 M de deuda; laudo: Ancap debió pagar ~US$ 5,6 M a Exor', en: '1.75% fee on US$321.8 M of debt; an award ordered Ancap to pay Exor ~US$5.6 M' },
    allegation: { es: 'Ancap contrató de forma directa e irregular a la firma financiera Exor como intermediaria para cancelar anticipadamente su deuda con la venezolana PDVSA, con «irregularidades múltiples, sucesivas y graves»: sin contrato ni procedimiento competitivo y con autorización verbal de Sendic sin aval del directorio.', en: 'Ancap directly and irregularly hired the financial firm Exor to intermediate the early cancellation of its debt with Venezuela\'s PDVSA, with "multiple, successive and serious irregularities": no contract, no competitive procedure, and Sendic\'s verbal authorization without board approval.' },
    status: { es: 'Condena firme: Raúl Sendic condenado (2021) por abuso de funciones (caso Exor) y peculado (tarjetas): 18 meses, 4 años de inhabilitación y multa.', en: 'Final conviction: Raúl Sendic convicted (2021) for abuse of office (Exor case) and embezzlement (cards): 18 months, 4 years\' disqualification and a fine.' },
    caveat: { es: 'La condena recae sobre el ex presidente de Ancap, no sobre Exor. No confundir con Trafigura ni con el holding Exor N.V. (Agnelli/Fiat).', en: 'The conviction falls on the former Ancap president, not on Exor. Not to be confused with Trafigura or the Exor N.V. holding (Agnelli/Fiat).' },
    sources: [
      { outlet: 'Búsqueda', url: 'https://www.busqueda.com.uy/Secciones/La-Justicia-condeno-a-Sendic-por-exceder-los-poderes-de-su-cargo-y-apropiarse-de-dinero-estatal-durante-la-presidencia-de-Ancap-uc47804' },
      { outlet: 'Montevideo Portal', url: 'https://www.montevideo.com.uy/Noticias/Las-historias-del-acuerdo-con-Exor-y-las-tarjetas-corporativas-que-sentenciaron-a-Sendic-uc787061' },
    ],
  },
  {
    key: 'gas-sayago', company: 'OAS · GNL del Plata (Gas Sayago)', sector: 'energia', flag: 'investigacion',
    db: { inData: false, reason: { es: 'El proyecto de la regasificadora (PPP de UTE y Ancap) no dejó fichas de proveedor en Compras Estatales pese a costar cientos de millones.', en: 'The regasification PPP (of UTE and Ancap) left no supplier records in Compras Estatales despite costing hundreds of millions.' } },
    amount: { es: 'Inversión prevista ~US$ 1.200 M; pérdidas al Estado estimadas en ~US$ 213 M; el Estado debió pagar US$ 13 M a OAS', en: 'Planned investment ~US$1,200 M; State losses estimated at ~US$213 M; the State had to pay OAS US$13 M' },
    allegation: { es: 'La brasileña OAS —empresa central del Lava Jato— construyó la planta regasificadora GNL del Plata en Puntas de Sayago. Se investigan presunta sobrefacturación, pagos indebidos e injerencia del gobierno brasileño en la adjudicación; su expresidente Leo Pinheiro admitió coimas por gestiones ante Uruguay. La adjudicación al consorcio GNLS (GDF Suez/Engie) fue calificada de «absolutamente irregular».', en: 'Brazil\'s OAS —a Lava Jato linchpin— built the GNL del Plata plant at Puntas de Sayago. Alleged over-billing, improper payments and Brazilian-government interference in the award are under investigation; its ex-president Leo Pinheiro admitted paying bribes over Uruguay dealings. The award to the GNLS consortium (GDF Suez/Engie) was called "absolutely irregular".' },
    status: { es: 'Denuncia penal de la oposición (2018); la Fiscalía archivó (2023) y luego reabrió la causa; juicios civiles cruzados; OAS en quiebra por el Lava Jato.', en: 'Opposition criminal complaint (2018); prosecutors archived (2023) then reopened the case; crossed civil suits; OAS bankrupt from Lava Jato.' },
    caveat: { es: 'El fiscal halló improvisación, negligencia e irregularidades administrativas pero no delito con intención de dañar al Estado. Las pérdidas de ~US$ 213 M son de todo el proyecto, no solo de OAS.', en: 'The prosecutor found improvisation, negligence and administrative irregularities but no crime intended to harm the State. The ~US$213 M losses are the whole project\'s, not only OAS\'s.' },
    sources: [
      { outlet: 'la diaria', url: 'https://ladiaria.com.uy/justicia/articulo/2023/5/fiscalia-archivo-investigacion-de-gas-sayago/' },
      { outlet: 'El Observador', url: 'https://www.elobservador.com.uy/nota/regasificadora-el-estado-debera-pagar-us-13-millones-a-la-empresa-oas-201992792231' },
      { outlet: 'Ámbito', url: 'https://www.ambito.com/uruguay/la-justicia-desarchivo-el-caso-gas-sayago-n5837439' },
    ],
  },
  {
    key: 'teyma', company: 'Teyma / Abengoa (bioetanol de ALUR)', sector: 'energia', flag: 'procesamiento',
    db: { inData: true, supplierId: 'R/211096770013', contracts: 151, years: '2003–2026',
      note: { es: 'Gran contratista del Estado en la base (151 contratos). La filial de la española Abengoa construyó obras para ALUR, UTE y otros organismos.', en: 'A major State contractor in the data (151 contracts). The Spanish Abengoa\'s subsidiary built works for ALUR, UTE and others.' } },
    amount: { es: 'Contrato EPC ~US$ 120 M; seis adendas fuera del contrato original + bonificación de US$ 1 M', en: 'EPC contract ~US$120 M; six add-ons outside the original contract + a US$1 M bonus' },
    allegation: { es: 'En la planta de bioetanol de ALUR en Paysandú, el contratista (Abengoa/Teyma) recibió seis pagos adicionales por fuera del contrato y una bonificación de US$ 1 M por recepción provisoria pese a que la planta arrancó sin cumplir las condiciones. El fiscal lo calificó de «compensación inadmisible».', en: 'At ALUR\'s Paysandú bioethanol plant, the contractor (Abengoa/Teyma) received six add-on payments outside the contract and a US$1 M bonus for provisional acceptance even though the plant started without meeting the terms. The prosecutor called it an "inadmissible compensation".' },
    status: { es: 'La Fiscalía pidió el procesamiento del ex gerente de ALUR Manuel González por estafa (causa Ancap, 2018).', en: 'Prosecutors sought the prosecution of former ALUR manager Manuel González for fraud (Ancap case, 2018).' },
    caveat: { es: 'El pedido de procesamiento recae sobre el jerarca de ALUR, no sobre Teyma. La empresa fue la ejecutora de la obra, no la imputada.', en: 'The prosecution request targets the ALUR official, not Teyma. The company was the builder, not the accused.' },
    sources: [
      { outlet: '180', url: 'https://www.180.com.uy/articulo/73475_la-estafa-de-alur-que-vio-el-fiscal-en-la-causa-de-ancap' },
      { outlet: 'El Observador', url: 'https://www.elobservador.com.uy/nota/el-increible-e-inconcebible-acuerdo-por-el-que-alur-hizo-seis-pagos-por-fuera-de-un-contrato-201837500' },
    ],
  },

  /* ---------------- OBRA / INFRAESTRUCTURA ---------------- */
  {
    key: 'antel-fibra', company: 'Saceem · Stiler · Montelecnor (fibra de Antel)', sector: 'obra', flag: 'observacion',
    db: { inData: true, supplierId: 'R/210002980010', contracts: 388, years: '2002–2026',
      note: { es: 'Los tres son grandes contratistas del Estado: Saceem (121 contratos), Stiler (120) y Montelecnor (147). Se presentaron en las mismas licitaciones de Antel.', en: 'All three are major State contractors: Saceem (121 contracts), Stiler (120) and Montelecnor (147). They bid in the same Antel tenders.' } },
    amount: { es: 'Presupuesto estimado $1.368 M vs pagos por $1.797 M — sobrecosto de 31,4% (~US$ 12 M sobre la subasta inversa)', en: 'Estimated budget $1,368 M vs payments of $1,797 M — 31.4% overcost (~US$12 M over the reverse-auction method)' },
    allegation: { es: 'El Tribunal de Cuentas alertó riesgo de colusión / acuerdo de precios en siete licitaciones de Antel (2021) para el tendido de fibra al hogar: adjudicaciones a distintos proveedores sin que ninguno objetara, y empresas que se presentaban con intención de formar consorcios con sus competidores.', en: 'The Tribunal de Cuentas flagged a risk of collusion / price-fixing in seven 2021 Antel fiber-to-the-home tenders: awards to different suppliers with none objecting, and firms bidding while intending to form consortia with rivals.' },
    status: { es: 'Alerta del Tribunal de Cuentas y una investigación de oficio de la Comisión de Promoción y Defensa de la Competencia (MEF), concluida en dic. 2024.', en: 'A Tribunal de Cuentas alert and an ex-officio investigation by the antitrust body (MEF), concluded in Dec 2024.' },
    caveat: { es: 'Es una alerta e investigación, NO una colusión probada ni una sanción a ninguna empresa. Los nombres son co-oferentes en las mismas licitaciones.', en: 'It is an alert and investigation, NOT proven collusion nor a sanction against any firm. The names are co-bidders in the same tenders.' },
    sources: [
      { outlet: 'Brecha', url: 'https://brecha.com.uy/acuerdo-de-precios-el-tribunal-de-cuentas-alerta-presunta-colusion-en-licitaciones-de-antel/' },
    ],
  },
  {
    key: 'csi', company: 'CSI Ingenieros (sobrefacturación en UTE)', sector: 'obra', flag: 'denuncia',
    db: { inData: true, supplierId: 'R/211264140018', contracts: 137, years: '2002–2026',
      note: { es: 'Ingeniería de larga relación con el Estado (137 contratos desde 2002).', en: 'An engineering firm with a long State relationship (137 contracts since 2002).' } },
    amount: { es: 'US$ 2.800.000 vía ampliaciones de contrato: +130% sobre lo original (el TOCAF prohíbe superar el 100%)', en: 'US$2,800,000 via contract add-ons: +130% over the original (the TOCAF bans exceeding 100%)' },
    allegation: { es: 'En una licitación de UTE de 2006 (vida útil de la Central Batlle), CSI Ingenieros —en consorcio con Soluziona— cobró US$ 2,8 M mediante ampliaciones que superaron el 130% del contrato original. Fue una de al menos seis licitaciones de UTE (2006-2011) investigadas por contratos «digitados» y sobrefacturación.', en: 'In a 2006 UTE tender (Batlle plant lifespan), CSI Ingenieros —with Soluziona— billed US$2.8 M via add-ons exceeding 130% of the original contract. It was one of at least six UTE tenders (2006-2011) investigated for "rigged" contracts and over-billing.' },
    status: { es: 'Denuncia penal del presidente de UTE ante el juzgado de Crimen Organizado (2012); investigación de al menos seis licitaciones; suspensión de contratos.', en: 'Criminal complaint by UTE\'s president before the Organized Crime court (2012); investigation of at least six tenders; contract suspensions.' },
    caveat: { es: 'CSI Ingenieros negó las irregularidades y sostuvo que actuó «en regla». Es una denuncia e investigación, sin condena conocida contra la empresa.', en: 'CSI Ingenieros denied wrongdoing and said it acted "by the book". It is a complaint and investigation, with no known conviction against the firm.' },
    sources: [
      { outlet: 'El Observador', url: 'https://www.elobservador.com.uy/nota/gerentes-de-ute-senalaron-a-directores-por-irregularidades-201381320370' },
      { outlet: 'Subrayado', url: 'https://www.subrayado.com.uy/caso-presunta-corrupcion-ute-genera-suspension-contratos-n18066' },
    ],
  },
  {
    key: 'ferrocarril-central', company: 'Grupo Vía Central (Ferrocarril Central)', sector: 'obra', flag: 'investigacion',
    db: { inData: true, supplierId: 'R/218408100015', contracts: 1, years: '2019',
      note: { es: 'El consorcio figura con una sola ficha gigante ($2.824 M, 2019); el grueso del PPP se paga por fuera del feed.', en: 'The consortium appears with a single huge record ($2,824 M, 2019); most of the PPP is paid outside the feed.' } },
    amount: { es: 'Sobrecostos reportados por el MTOP en torno a US$ 200 M', en: 'Cost overruns reported by the MTOP of around US$200 M' },
    allegation: { es: 'El consorcio Grupo Vía Central (Saceem, Berkes, la española Sacyr y la francesa NGE) construyó el Ferrocarril Central para UPM bajo un PPP con el MTOP. El proyecto acumuló fuertes sobrecostos, cuestionados por falta de estudios técnicos previos, y derivó en reclamos cruzados por sobreprecios y pagos pendientes.', en: 'The Grupo Vía Central consortium (Saceem, Berkes, Spain\'s Sacyr and France\'s NGE) built the Central Railway for UPM under an MTOP PPP. The project ran up heavy cost overruns, questioned for lack of prior technical studies, and ended in crossed claims over over-prices and unpaid amounts.' },
    status: { es: 'Disputa contractual: el consorcio inició un arbitraje internacional (2025) por incumplimientos del Estado. Sin imputación penal.', en: 'Contractual dispute: the consortium began international arbitration (2025) over State breaches. No criminal charge.' },
    caveat: { es: 'Es un conflicto de sobrecostos y pagos, no una causa penal. Ambas partes se reclaman mutuamente incumplimientos.', en: 'It is an overcost-and-payment dispute, not a criminal case. Both sides claim breaches by the other.' },
    sources: [
      { outlet: 'El Observador', url: 'https://www.elobservador.com.uy/nota/fuego-cruzado-por-ferrocarril-central-enreda-el-tramo-final-de-las-obras-del-tren-de-upm-202352415430' },
      { outlet: 'Subrayado', url: 'https://www.subrayado.com.uy/consorcio-que-construyo-el-ferrocarril-central-demanda-uruguay-falta-pagos-mas-un-ano-n970050' },
    ],
  },
  {
    key: 'neptuno', company: 'Consorcio Aguas de Montevideo (Proyecto Neptuno)', sector: 'obra', flag: 'observacion',
    db: { inData: true, supplierId: 'R/210002980010', contracts: 121, years: '2003–2026',
      note: { es: 'Integrado por Saceem, Berkes, Ciemsa y Fast — todos grandes contratistas presentes en la base por separado.', en: 'Made up of Saceem, Berkes, Ciemsa and Fast — all major contractors present in the data individually.' } },
    allegation: { es: 'El consorcio fue adjudicatario del Proyecto Neptuno de OSE (potabilizadora en Arazatí, que toma agua del Río de la Plata) bajo participación privada a 20 años. El Tribunal de Cuentas observó el contrato y su renegociación por modificar «sustancialmente el objeto del contrato», vulnerando la igualdad y la concurrencia.', en: 'The consortium won OSE\'s Neptuno Project (a water plant in Arazatí drawing from the Río de la Plata) under a 20-year private-participation scheme. The Tribunal de Cuentas observed both the contract and its renegotiation for "substantially changing the object of the contract", breaching equality and competition.' },
    status: { es: 'Observación del Tribunal de Cuentas (4 a 3, 2026); OSE resolvió reiterar el gasto y seguir adelante pese a la observación.', en: 'Tribunal de Cuentas observation (4-to-3, 2026); OSE resolved to override and proceed despite it.' },
    caveat: { es: 'Es una observación de regularidad jurídica sobre un contrato de gran controversia política y ambiental, no una imputación penal a las empresas.', en: 'It is a legal-regularity observation on a highly politically and environmentally contested contract, not a criminal charge against the firms.' },
    sources: [
      { outlet: 'El Observador', url: 'https://www.elobservador.com.uy/nacional/tribunal-cuentas-observo-reformulacion-del-contrato-del-proyecto-neptuno-impulsada-el-gobierno-orsi-n6034988' },
      { outlet: 'La Diaria', url: 'https://ladiaria.com.uy/politica/articulo/2026/3/ose-y-el-consorcio-aguas-de-montevideo-firmaron-la-modificacion-del-contrato-del-proyecto-neptuno/' },
    ],
  },
  {
    key: 'katoen', company: 'Katoen Natie / Terminal Cuenca del Plata', sector: 'obra', flag: 'observacion',
    db: { inData: false, reason: { es: 'Es una concesión portuaria: la empresa opera la terminal, no le vende bienes al Estado, así que no figura como proveedora.', en: 'It is a port concession: the firm operates the terminal, it does not sell goods to the State, so it does not appear as a supplier.' } },
    amount: { es: 'Concesión extendida hasta 2081; ~US$ 455 M de inversión comprometida', en: 'Concession extended to 2081; ~US$455 M of committed investment' },
    allegation: { es: 'Presuntas irregularidades en el acuerdo de 2021 que extendió hasta 2081 la concesión exclusiva de la terminal de contenedores del puerto de Montevideo a la belga Katoen Natie. Senadores denunciaron que el presidente de la ANP aprobó la prórroga sin pasar por el directorio.', en: 'Alleged irregularities in the 2021 deal that extended to 2081 the exclusive container-terminal concession at the Port of Montevideo to Belgium\'s Katoen Natie. Senators charged that the ANP president approved the extension without the board.' },
    status: { es: 'El Tribunal de Cuentas concluyó que el acuerdo es «objetable en cuanto a su regularidad jurídica»; la causa penal fue archivada (2022) y desarchivada (2023).', en: 'The Tribunal de Cuentas found the deal "objectionable as to its legal regularity"; the criminal case was archived (2022) and reopened (2023).' },
    caveat: { es: 'Es una concesión, no una compra: el señalamiento es de regularidad del acuerdo, no de un contrato de suministro. Competidores tramitan arbitrajes internacionales.', en: 'It is a concession, not a purchase: the flag is about the deal\'s regularity, not a supply contract. Competitors are pursuing international arbitration.' },
    sources: [
      { outlet: 'El Observador', url: 'https://www.elobservador.com.uy/nota/puerto-informe-tecnico-cuestiona-regularidad-juridica-del-acuerdo-con-tcp-y-fiscal-le-pide-informacion-al-gobierno-202222415160' },
      { outlet: 'Ámbito', url: 'https://www.ambito.com/uruguay/se-desarchivo-la-causa-katoen-natie-el-puerto-montevideo-n5728604' },
    ],
  },
  {
    key: 'cosmo-pluna', company: 'Cosmo (aviones de Pluna)', sector: 'obra', flag: 'condena',
    db: { inData: false, reason: { es: 'Cosmo fue oferente en un remate de liquidación estatal, no proveedora del Estado; no figura en la base.', en: 'Cosmo was a bidder in a State liquidation auction, not a State supplier; it does not appear in the data.' } },
    amount: { es: 'Aval del Banco República por US$ 13,6 M', en: 'Banco República guarantee of US$13.6 M' },
    allegation: { es: 'En el remate de 2012 de los siete aviones de la aerolínea estatal Pluna, la firma Cosmo (usada como «pantalla», vinculada a Juan Carlos López Mena) ofertó respaldada por un aval del Banco República otorgado de forma «clara y arbitrariamente abusiva». La Suprema Corte calificó de «turbio o poco cristalino» el aval.', en: 'In the 2012 auction of state airline Pluna\'s seven planes, Cosmo (a "front" tied to Juan Carlos López Mena) bid backed by a Banco República guarantee granted in a "clearly and arbitrarily abusive" way. The Supreme Court called the guarantee "murky or less than transparent".' },
    status: { es: 'Condena firme por abuso de funciones del expresidente del BROU Fernando Calloia (confirmada por la Suprema Corte) y del exministro de Economía Fernando Lorenzo.', en: 'Final conviction for abuse of office of former BROU president Fernando Calloia (upheld by the Supreme Court) and former Economy Minister Fernando Lorenzo.' },
    caveat: { es: 'La indagatoria contra los privados (López Mena, Calvo Sánchez) fue archivada por falta de dolo. La condena recae sobre los funcionarios que dieron el aval, no sobre Cosmo.', en: 'The probe of the private parties (López Mena, Calvo Sánchez) was archived for lack of intent. The conviction falls on the officials who granted the guarantee, not on Cosmo.' },
    sources: [
      { outlet: 'El Observador', url: 'https://www.elobservador.com.uy/nota/suprema-corte-confirmo-condena-a-calloia-por-el-aval-fraudulento-en-venta-de-aviones-de-pluna-2021761931' },
      { outlet: 'Teledoce', url: 'https://www.teledoce.com/telemundo/nacionales/caso-pluna-suprema-corte-tildo-de-turbio-o-poco-cristalino-el-accionar-de-calloia-al-entregar-el-aval-a-cosmo/' },
    ],
  },

  /* ---------------- INTENDENCIAS ---------------- */
  {
    key: 'prodie-luminarias', company: 'Prodie · Habilis (luminarias LED de Montevideo)', sector: 'intendencias', flag: 'denuncia',
    db: { inData: true, supplierId: 'R/212263900017', contracts: 313, years: '2004–2026',
      note: { es: 'Ambas son proveedoras habituales del Estado: Prodie (165 contratos) y Habilis (148).', en: 'Both are regular State suppliers: Prodie (165 contracts) and Habilis (148).' } },
    amount: { es: 'Licitación de ~US$ 25 M por ~70.000 luminarias; oferta de Prodie US$ 19 M', en: '~US$25 M tender for ~70,000 luminaires; Prodie\'s bid US$19 M' },
    allegation: { es: 'En la megalicitación de la Intendencia de Montevideo para renovar ~70.000 luminarias LED, la IM denunció penalmente a Prodie (acusada de falsificar certificaciones de laboratorio y alterar ensayos para cumplir los requisitos) y a Habilis (adulterar parámetros y luego descalificada).', en: 'In Montevideo\'s mega-tender to renew ~70,000 LED luminaires, the city filed criminal complaints against Prodie (accused of faking lab certifications and altering tests to meet requirements) and Habilis (altering parameters, then disqualified).' },
    status: { es: 'Denuncia penal de la Intendencia ante Fiscalía (2019); proceso de compra suspendido; observaciones del Tribunal de Cuentas por trato desigual.', en: 'City criminal complaint (2019); procurement suspended; Tribunal de Cuentas observations over unequal treatment.' },
    caveat: { es: 'Es una denuncia de la propia Intendencia; a un año la Fiscalía aún no había empezado a investigar. Sin condena conocida.', en: 'It is a complaint by the city itself; a year on, prosecutors had not begun investigating. No known conviction.' },
    sources: [
      { outlet: 'El Observador', url: 'https://www.elobservador.com.uy/nota/el-plan-de-renovar-las-luminarias-de-montevideo-termina-en-la-justicia-2019731813' },
      { outlet: 'El Observador', url: 'https://www.elobservador.com.uy/nota/a-un-ano-de-presentada-la-denuncia-penal-por-licitacion-de-luminarias-led-fiscalia-no-empezo-a-investigar-2020826508' },
    ],
  },
  {
    key: 'artigas', company: 'Grupo de Artigas (Jiménez Felice · Pedrera del Norte)', sector: 'intendencias', flag: 'observacion',
    db: { inData: true, supplierId: 'R/010175850019', contracts: 67, years: '2014–2024',
      note: { es: 'Pedrera del Norte (32 contratos) y su vinculada Prenorte (35) figuran en la base como proveedoras de obra de la zona.', en: 'Pedrera del Norte (32 contracts) and its linked Prenorte (35) appear as regional works suppliers.' } },
    amount: { es: 'Más de $146 M adjudicados al grupo en cuatro años y medio (~US$ 3,8 M)', en: 'Over $146 M awarded to the group in four and a half years (~US$3.8 M)' },
    allegation: { es: 'Empresas vinculadas a funcionarios de la Intendencia de Artigas: a Rodrigo Jiménez Felice se le adjudicaron obras por $120 M mientras el asesor del intendente figuraba como representante de la firma; Pedrera del Norte tiene entre sus socios al hermano de un contador de la comuna. JUTEP halló fraccionamiento del gasto y ampliaciones irregulares.', en: 'Firms tied to Artigas city officials: Rodrigo Jiménez Felice was awarded $120 M in works while the mayor\'s adviser was listed as the firm\'s representative; Pedrera del Norte counts among its partners the brother of a city accountant. JUTEP found spending split up and irregular tender extensions.' },
    status: { es: 'Resolución de JUTEP (2020) por violación de probidad, legalidad y transparencia; el intendente Pablo Caram fue condenado en causa conexa e inhabilitado.', en: 'JUTEP ruling (2020) for breach of probity, legality and transparency; mayor Pablo Caram was convicted in a related case and disqualified.' },
    caveat: { es: 'La condena a Caram (14 meses, condicional) fue por omitir denunciar irregularidades. JUTEP es un órgano de transparencia, no un tribunal penal.', en: 'Caram\'s conviction (14 months, suspended) was for failing to report irregularities. JUTEP is a transparency body, not a criminal court.' },
    sources: [
      { outlet: 'El Observador', url: 'https://www.elobservador.com.uy/nota/jutep-senalo-que-intendencia-de-artigas-contrato-a-tres-empresas-vinculadas-a-funcionarios-202012321310' },
      { outlet: 'Montevideo Portal', url: 'https://www.montevideo.com.uy/Noticias/Jutep-divulgo-la-resolucion-en-la-que-constan-irregularidades-en-la-Intendencia-de-Artigas-uc742426' },
    ],
  },
  {
    key: 'florida-castellini', company: 'Rodríguez Castellini y Coito (Intendencia de Florida)', sector: 'intendencias', flag: 'denuncia',
    db: { inData: true, supplierId: 'R/070252600011', contracts: 39, years: '2021–2025',
      note: { es: 'Figura en la base con 39 contratos de la comuna de Florida (~$7,4 M), en su mayoría compras directas.', en: 'Appears with 39 Florida city contracts (~$7.4 M), mostly direct purchases.' } },
    amount: { es: '~US$ 70.000 en 37 compras directas (2020-2023)', en: '~US$70,000 across 37 direct purchases (2020-2023)' },
    allegation: { es: 'Empresa del hijo y del ex esposo de la secretaria personal del intendente de Florida, contratada de forma directa 37 veces eludiendo la licitación exigida al superarse los topes de la compra directa.', en: 'A firm owned by the son and ex-husband of the Florida mayor\'s personal secretary, directly contracted 37 times, dodging the tendering required once direct-purchase caps were exceeded.' },
    status: { es: 'JUTEP recomendó y elevó el caso a la Justicia Penal (2024); observado por el Tribunal de Cuentas por violar los límites de la compra directa.', en: 'JUTEP recommended and elevated the case to criminal justice (2024); observed by the Tribunal de Cuentas for breaching direct-purchase limits.' },
    caveat: { es: 'El intendente denunció una «campaña de desprestigio». Es una denuncia elevada a Fiscalía, sin condena.', en: 'The mayor alleged a "smear campaign". It is a complaint elevated to prosecutors, without conviction.' },
    sources: [
      { outlet: 'Subrayado', url: 'https://www.subrayado.com.uy/jutep-elevo-la-justicia-penal-caso-presuntas-irregularidades-intendencia-florida-n953818' },
      { outlet: 'Búsqueda', url: 'https://www.busqueda.com.uy/informe-juridico-la-junta-anticorrupcion-recomienda-denunciar-fiscalia-contrataciones-la-intendencia-florida-n5392286' },
    ],
  },
  {
    key: 'walfur', company: 'Walfur (pauta oficial a empresas embargadas)', sector: 'intendencias', flag: 'periodistica',
    db: { inData: true, supplierId: 'R/216945310012', contracts: 330, years: '2018–2025',
      note: { es: 'Figura en la base con 330 contratos, pese a que el propio Estado (BPS, BROU) la ejecutaba judicialmente por deudas.', en: 'Appears with 330 contracts, even as the State itself (BPS, BROU) was suing it for debts.' } },
    amount: { es: '~US$ 1,8 M a Walfur (2022-2024); +US$ 4,7 M al grupo vinculado a La República', en: '~US$1.8 M to Walfur (2022-2024); +US$4.7 M to the group tied to La República' },
    allegation: { es: 'Organismos públicos siguieron adjudicando contratos de publicidad oficial y suscripciones a empresas embargadas vinculadas al diario La República —Walfur entre ellas, con la peor calificación crediticia— mientras el propio Estado las ejecutaba por deudas. El Ministerio de Ambiente le dio contratos incluso tras un embargo genérico.', en: 'Public bodies kept awarding official-advertising and subscription contracts to embargoed firms tied to newspaper La República —Walfur among them, with the worst credit rating— while the State itself was suing them for debts. The Environment Ministry gave it contracts even after a general embargo.' },
    status: { es: 'Investigación periodística (Búsqueda, El Observador); embargos del BPS y BROU y juicios ejecutivos en trámite.', en: 'Press investigation (Búsqueda, El Observador); BPS and BROU embargoes and enforcement suits ongoing.' },
    caveat: { es: 'Señalamiento periodístico sobre el flujo de dinero público a firmas embargadas; sin proceso penal por corrupción conocido.', en: 'A press flag about the flow of public money to embargoed firms; no known criminal corruption case.' },
    sources: [
      { outlet: 'Búsqueda', url: 'https://www.busqueda.com.uy/politica/organismos-publicos-continuan-contratando-publicidad-y-suscripciones-empresas-embargadas-identificadas-como-diario-la-republica-n5412415' },
      { outlet: 'Uruguay Al Día', url: 'https://uruguayaldia.com.uy/el-festin-de-los-sellos-como-el-estado-uruguayo-inyecta-millones-en-empresas-fantasma-vinculadas-a-la-republica/' },
    ],
  },
  {
    key: 'valorarte', company: 'Valorarte (contratos artísticos de la IM)', sector: 'intendencias', flag: 'periodistica',
    db: { inData: true, supplierId: 'R/216594640015', contracts: 1631, years: '2014–2026',
      note: { es: 'Figura en la base con 1.631 contratos (~$326 M): una cooperativa usada como vehículo de pago por la Intendencia de Montevideo.', en: 'Appears with 1,631 contracts (~$326 M): a cooperative used as a payment vehicle by the Montevideo city government.' } },
    amount: { es: '~$848.000 anuales por persona (2022-2025) en contratos «artísticos»', en: '~$848,000 a year per person (2022-2025) in "artistic" contracts' },
    allegation: { es: 'Cooperativa usada por la Intendencia de Montevideo para pagar como «artistas» —vía órdenes de compra— a personas sin obra artística documentada, incluida una gestora cultural administrativa. Según la investigación, funcionó como «fachada de pagos irregulares» que se sumaban a otros salarios.', en: 'A cooperative used by the Montevideo city government to pay as "artists" —via purchase orders— people with no documented artistic work, including an administrative cultural coordinator. Per the investigation, it worked as a "front for irregular payments" added to other salaries.' },
    status: { es: 'Investigación periodística (Contraviento, Búsqueda); denuncias ante JUTEP contra la Intendencia por estas contrataciones.', en: 'Press investigation (Contraviento, Búsqueda); JUTEP complaints against the city over these contracts.' },
    caveat: { es: 'El señalamiento apunta al uso que la Intendencia hizo de la cooperativa como vehículo de pago, más que a la cooperativa en sí. Sin proceso penal conocido.', en: 'The flag targets the city\'s use of the cooperative as a payment vehicle, more than the cooperative itself. No known criminal case.' },
    sources: [
      { outlet: 'Contraviento', url: 'https://contraviento.uy/2025/03/29/imm-contratos-artisticos-como-fachada-de-pagos-irregulares/' },
      { outlet: 'Búsqueda', url: 'https://www.busqueda.com.uy/vida-cultural/la-cooperativa-las-artes-y-los-trabajadores-tercerizados-la-intendencia-montevideo-n5394893' },
    ],
  },

  /* ---------------- ESTAFAS (no proveedoras del Estado) ---------------- */
  {
    key: 'ganaderas', company: 'Conexión Ganadera · República Ganadera · Grupo Larrarte', sector: 'estafas', flag: 'imputacion',
    db: { inData: false, reason: { es: 'Son fondos de inversión privados que captaron ahorro del público: nunca fueron proveedores del Estado, por eso no dejan ninguna ficha.', en: 'They are private investment funds that took in public savings: they were never State suppliers, so they leave no record.' } },
    amount: { es: 'Conexión Ganadera ~US$ 250 M y ~4.000 ahorristas; República Ganadera ~US$ 60 M de agujero; Larrarte ~US$ 12 M', en: 'Conexión Ganadera ~US$250 M and ~4,000 savers; República Ganadera ~US$60 M hole; Larrarte ~US$12 M' },
    allegation: { es: 'Presuntas megaestafas tipo Ponzi: captaron ahorros prometiendo rentas fijas respaldadas por ganado que en gran parte no existía, usando dinero de nuevos inversores para pagar a los anteriores. La mayor de la historia uruguaya.', en: 'Alleged Ponzi mega-frauds: they took in savings promising fixed returns backed by cattle that largely did not exist, using new investors\' money to pay earlier ones. The largest in Uruguayan history.' },
    status: { es: 'Pablo Carrasco (Conexión Ganadera) y Jairo Larrarte formalizados/condenados por estafa; concursos con embargos por cientos de millones; causas en la Fiscalía de Delitos Económicos.', en: 'Pablo Carrasco (Conexión Ganadera) and Jairo Larrarte charged/convicted for fraud; bankruptcies with hundred-million embargoes; cases before the Economic Crimes Prosecutor.' },
    caveat: { es: 'Se incluyen para marcar el límite del dato: son estafas privadas, ajenas a la contratación pública, y por eso NO son verificables en esta base. El daño es a ahorristas, no al erario vía contratos.', en: 'Included to mark the data\'s limit: these are private frauds, outside public procurement, and thus NOT verifiable in this data. The harm is to savers, not to the treasury via contracts.' },
    sources: [
      { outlet: 'la diaria', url: 'https://ladiaria.com.uy/justicia/articulo/2025/4/conexion-ganadera-cronologia-de-una-estafa/' },
      { outlet: 'Infobae', url: 'https://www.infobae.com/america/america-latina/2025/07/26/conexion-ganadera-el-escandalo-del-fondo-inversor-que-es-investigado-por-una-millonaria-estafa-en-uruguay/' },
    ],
  },
]

/* ============================================================================
 *  DEEP-DIVE 1 — ITHG + Solidar · ambulancias de ASSE (la invisibilidad)
 * ========================================================================== */
export interface EmpLedgerRow { ocid: string, idc: string, year: number, buyer: string, desc: string, amount: number, url: string }

/** Las 5 fichas de ITHG que la base SÍ registra (verificadas en releases). */
export const ITHG_LEDGER: EmpLedgerRow[] = [
  { ocid: 'ocds-yfs5dr-902017', idc: '902017', year: 2021, buyer: 'ASSE (central)', desc: 'Servicio de equipo técnico + ambulancia común y especializada (11 renglones)', amount: 21323014, url: GOV('902017') },
  { ocid: 'ocds-yfs5dr-1023474', idc: '1023474', year: 2023, buyer: 'Atención de Urgencia, Emergencia Prehospitalaria y Traslado', desc: 'Equipo técnico de traslado + ambulancia + transporte con chofer', amount: 8164130, url: GOV('1023474') },
  { ocid: 'ocds-yfs5dr-1028317', idc: '1028317', year: 2023, buyer: 'Atención de Urgencia, Emergencia Prehospitalaria y Traslado', desc: 'Arrendamiento de ambulancia', amount: 2925000, url: GOV('1028317') },
  { ocid: 'ocds-yfs5dr-1213486', idc: '1213486', year: 2025, buyer: 'Centro de Rehabilitación Médico Ocupacional y Sicosocial', desc: 'Arrendamiento de ambulancia', amount: 125000, url: GOV('1213486') },
  { ocid: 'ocds-yfs5dr-1267284', idc: '1267284', year: 2025, buyer: 'Centro de Rehabilitación Médico Ocupacional y Sicosocial', desc: 'Arrendamiento de ambulancia', amount: 125000, url: GOV('1267284') },
]

export const ITHG_STATS = {
  visibleFichas: 5,
  visibleUYU: 32662144,
  documentadoUYUmin: 792501285, // compras directas 2021–inicios 2023 (la diaria)
  observadoUYU: 2030000000, // 100% del gasto en traslados 2022-2024, Tribunal de Cuentas
  usdTres: 20, // ~US$20 M en 3 años
  concentracionPct: 96.47, // del gasto del SAME 105
  ambulanciaUSD: 800000, // por una ambulancia con un traslado cada 2 días
  solidarFichas: 49, // JD&A SAS
  denunciaAnio: 2026,
}

/* ============================================================================
 *  DEEP-DIVE 2 — Frigorífico Saturno · la carne de las FF.AA.
 * ========================================================================== */
export const SATURNO_BY_YEAR: { year: number, n: number, spend: number }[] = [
  { year: 2012, n: 2, spend: 2627313 }, { year: 2013, n: 1, spend: 1937440 }, { year: 2014, n: 1, spend: 6138000 },
  { year: 2016, n: 5, spend: 7528969 }, { year: 2017, n: 6, spend: 11870129 }, { year: 2018, n: 14, spend: 29439479 },
  { year: 2019, n: 10, spend: 31396859 }, { year: 2020, n: 2, spend: 1330844 }, { year: 2021, n: 19, spend: 61487452 },
  { year: 2022, n: 18, spend: 210874633 }, { year: 2023, n: 29, spend: 59375161 }, { year: 2024, n: 26, spend: 242798379 },
  { year: 2025, n: 78, spend: 216412061 }, { year: 2026, n: 72, spend: 255142672 },
]

export const SATURNO_BY_BUYER: { buyer: string, n: number, spend: number, force: boolean }[] = [
  { buyer: 'Instituto Nacional de Alimentación (INDA)', n: 4, spend: 572094817, force: false },
  { buyer: 'Comando General del Ejército', n: 8, spend: 206011403, force: true },
  { buyer: 'Comando General de la Armada', n: 26, spend: 141040829, force: true },
  { buyer: 'Comando General de la Fuerza Aérea', n: 19, spend: 93132887, force: true },
  { buyer: 'Dirección Nacional de Sanidad de las FF.AA.', n: 3, spend: 41937939, force: true },
  { buyer: 'INAU', n: 1, spend: 23369087, force: false },
  { buyer: 'Estado Mayor de la Defensa', n: 18, spend: 6811669, force: true },
  { buyer: 'Otros (hospitales, comuna)', n: 174, spend: 53000000, force: false },
]

/** Las compras de carne PORCINA (bondiola) de la Armada — el corazón de la causa penal. */
export const SATURNO_ARMADA_LEDGER: EmpLedgerRow[] = [
  { ocid: 'ocds-yfs5dr-931845', idc: '931845', year: 2022, buyer: 'Comando General de la Armada', desc: 'Carne vacuna (uso humano) — 8 renglones', amount: 19679088, url: GOV('931845') },
  { ocid: 'ocds-yfs5dr-908806', idc: '908806', year: 2021, buyer: 'Comando General de la Armada', desc: 'Carne vacuna (uso humano)', amount: 10208940, url: GOV('908806') },
  { ocid: 'ocds-yfs5dr-858910', idc: '858910', year: 2021, buyer: 'Comando General de la Armada', desc: 'Carne porcina (bondiola) — el corte del faltante', amount: 9124255, url: GOV('858910') },
  { ocid: 'ocds-yfs5dr-908807', idc: '908807', year: 2021, buyer: 'Comando General de la Armada', desc: 'Carne porcina (bondiola) — el corte del faltante', amount: 9124255, url: GOV('908807') },
  { ocid: 'ocds-yfs5dr-924956', idc: '924956', year: 2022, buyer: 'Comando General de la Armada', desc: 'Carne porcina (bondiola)', amount: 8765365, url: GOV('924956') },
  { ocid: 'ocds-yfs5dr-948067', idc: '948067', year: 2022, buyer: 'Comando General de la Armada', desc: 'Carne porcina (bondiola)', amount: 8765365, url: GOV('948067') },
]

export const SATURNO_STATS = {
  contracts: 283,
  totalUYU: 1138359389,
  buyers: 32,
  firstYear: 2012,
  lastYear: 2026,
  armadaFichas: 26,
  armadaUYU: 141040829,
  faltanteKg: 57398,
  faltanteUYU: 8405690,
  remitosIrregulares: 26,
}

/* ============================================================================
 *  Cifras del catálogo (para los tiles del overview)
 * ========================================================================== */
export const EMP_OVERVIEW_STATS = {
  companies: EMP_CASES.length,
  inData: EMP_CASES.filter(c => c.db.inData).length,
  notInData: EMP_CASES.filter(c => !c.db.inData).length,
  condenas: EMP_CASES.filter(c => c.flag === 'condena').length,
}

/* ============================================================================
 *  CONTENIDO bilingüe (chrome)
 * ========================================================================== */
export const EMP_CONTENT = {
  es: {
    common: {
      source: 'Prensa y Justicia + Compras Estatales (OCDS) · verificado',
      verified: 'Fuentes verificadas',
      ficha: 'Ver ficha oficial',
      supplierProfile: 'Ver proveedor en el sitio',
      readMore: 'Abrir la investigación',
      inData: 'Aparece en la base',
      notInData: 'Fuera del alcance de la base',
    },
    sector: {
      salud: 'Salud pública / ASSE', defensa: 'Defensa y FF.AA.', seguridad: 'Seguridad y vigilancia',
      energia: 'Energía y entes (Ancap · UTE)', obra: 'Obra pública e infraestructura',
      intendencias: 'Intendencias', estafas: 'Estafas privadas (fuera del Estado)',
    },
    flag: {
      condena: 'Condena firme', procesamiento: 'Procesamiento', imputacion: 'Imputación / formalización',
      denuncia: 'Denuncia penal', investigacion: 'Investigación fiscal', observacion: 'Observación (TCR / JUTEP)',
      periodistica: 'Señalamiento periodístico',
    },
    file: { org: 'Empresas señaladas', tag: 'Corrupción y contratación pública', period: '2006–2026' },
    kicker: 'Investigación · Con la tuya, contribuyente',
    title: 'Empresas señaladas por corrupción: ¿lo confirma la base?',
    dek: 'Partimos de empresas señaladas en la prensa y la Justicia por corrupción, fraude o irregularidades con el Estado uruguayo. Después buscamos cada una en la base de Compras Estatales para ver si el señalamiento deja rastro en los datos abiertos. Algunas están de cuerpo entero; otras —las más grandes— casi no aparecen, y esa invisibilidad también dice algo.',
    chips: ['Prensa + Justicia', 'Cruzado con la base', 'Cada dato con fuente'],
    tiles: {
      companies: 'empresas señaladas', companiesSub: 'de prensa y Justicia, verificadas',
      inData: 'verificables en la base', inDataSub: 'aparecen como proveedoras del Estado',
      notInData: 'fuera del alcance', notInDataSub: 'defensa, concesiones, PPP, estafas privadas',
      condenas: 'con condena firme', condenasSub: 'el resto: denuncia, investigación u observación',
    },
    method: {
      tag: 'Cómo se hizo', title: 'Dos pasos: primero el señalamiento, después la base',
      p1: 'Primero se listaron empresas señaladas públicamente por corrupción o irregularidades con organismos del Estado. Cada caso se verificó de forma adversarial contra al menos dos fuentes independientes —Fiscalía, Poder Judicial, Tribunal de Cuentas, JUTEP o prensa seria— y se corrigieron cifras y estados legales. Se guardó siempre el descargo y la precisión.',
      p2: 'Recién entonces se buscó cada empresa en la base del sitio (Compras Estatales / OCDS): si figura como proveedora, con cuántos contratos y con qué organismos. Los números de la columna «base» salen de esa consulta, hecha sobre la base en vivo. Donde el señalamiento no deja rastro —compra militar, concesiones, PPP o estafas privadas— se dice explícitamente.',
    },
    gap: {
      tag: 'El punto ciego', title: 'Lo más grande casi no se ve',
      p: 'Los escándalos de mayor monto tienden a ser los menos visibles en los datos abiertos: la compra de defensa (Cardama, €82 M), las concesiones (Katoen Natie), los PPP y proyectos como Gas Sayago quedan fuera del feed de Compras Estatales. Y aun cuando la empresa está —como ITHG en ASSE— la base puede registrar una fracción mínima del dinero pagado por vía directa. La transparencia del gasto es más fina justo donde más plata se mueve.',
    },
    cta: { tag: 'Seguí explorando', title: 'Los casos con página propia', intro: 'Dos investigaciones desarrolladas, ficha por ficha, a partir de esta lista.' },
    sourcesTitle: 'Fuentes',
    disclaimerTitle: 'Cómo leer esta investigación',
    disclaimer: [
      'Es un análisis de datos públicos y de causas y resoluciones también públicas. Documenta hechos verificables —contratos, montos, estados judiciales— y distingue lo probado (condenas) de lo que es denuncia, investigación o pregunta abierta.',
      'Aparecer aquí NO equivale a ser culpable. Muchas de estas empresas no están imputadas: en varios casos la Justicia apunta a los funcionarios del Estado, no al proveedor. Un contrato observado o una compra directa no es, por sí solo, prueba de delito.',
      'Se nombran empresas y personas solo en su carácter de proveedoras del Estado o partes de causas públicas, tal como figuran en las fuentes citadas. Quien quiera aportar su descargo o corregir un dato puede hacerlo, y se incorporará.',
    ],
  },
  en: {
    common: {
      source: 'Press & courts + State procurement (OCDS) · verified',
      verified: 'Verified sources',
      ficha: 'View official record',
      supplierProfile: 'View supplier on the site',
      readMore: 'Open the investigation',
      inData: 'Appears in the data',
      notInData: 'Outside the data\'s scope',
    },
    sector: {
      salud: 'Public health / ASSE', defensa: 'Defense & armed forces', seguridad: 'Security & surveillance',
      energia: 'Energy & state firms (Ancap · UTE)', obra: 'Public works & infrastructure',
      intendencias: 'City governments', estafas: 'Private frauds (outside the State)',
    },
    flag: {
      condena: 'Final conviction', procesamiento: 'Prosecution', imputacion: 'Charged / indicted',
      denuncia: 'Criminal complaint', investigacion: 'Prosecutorial investigation', observacion: 'Observation (TCR / JUTEP)',
      periodistica: 'Press flag',
    },
    file: { org: 'Flagged companies', tag: 'Corruption & public procurement', period: '2006–2026' },
    kicker: 'Investigation · Con la tuya, contribuyente',
    title: 'Companies flagged for corruption: does the data confirm it?',
    dek: 'We start from companies flagged in the press and courts for corruption, fraud or irregularities with the Uruguayan State. Then we look each one up in the State procurement data to see whether the flag leaves a trace in the open records. Some are fully there; others —the biggest— barely appear, and that invisibility says something too.',
    chips: ['Press + courts', 'Cross-checked with the data', 'Every figure sourced'],
    tiles: {
      companies: 'flagged companies', companiesSub: 'from press and courts, verified',
      inData: 'verifiable in the data', inDataSub: 'appear as State suppliers',
      notInData: 'outside the scope', notInDataSub: 'defense, concessions, PPP, private frauds',
      condenas: 'with a final conviction', condenasSub: 'the rest: complaint, investigation or observation',
    },
    method: {
      tag: 'How it was done', title: 'Two steps: the flag first, then the data',
      p1: 'First we listed companies publicly flagged for corruption or irregularities with State bodies. Each case was adversarially verified against at least two independent sources —prosecutors, the judiciary, the Tribunal de Cuentas, JUTEP or serious press— and figures and legal statuses were corrected. The rebuttal and the caveat were always kept.',
      p2: 'Only then did we look each company up in the site\'s data (State procurement / OCDS): whether it appears as a supplier, with how many contracts and with which bodies. The numbers in the "data" column come from that query, run against the live database. Where the flag leaves no trace —military procurement, concessions, PPPs or private frauds— we say so explicitly.',
    },
    gap: {
      tag: 'The blind spot', title: 'The biggest cases are the hardest to see',
      p: 'The highest-value scandals tend to be the least visible in the open data: defense procurement (Cardama, €82 M), concessions (Katoen Natie), PPPs and projects like Gas Sayago fall outside the State-procurement feed. And even when the company is there —like ITHG at ASSE— the data may record a tiny fraction of the money paid directly. Spending transparency thins out exactly where the most money moves.',
    },
    cta: { tag: 'Keep exploring', title: 'The cases with their own page', intro: 'Two investigations built record by record from this list.' },
    sourcesTitle: 'Sources',
    disclaimerTitle: 'How to read this investigation',
    disclaimer: [
      'This is an analysis of public data and of court cases and rulings that are also public. It documents verifiable facts —contracts, amounts, legal statuses— and keeps proven facts (convictions) apart from complaints, investigations or open questions.',
      'Appearing here does NOT mean being guilty. Many of these firms are not charged: in several cases the courts target the State officials, not the supplier. An observed contract or a direct purchase is not, on its own, proof of a crime.',
      'Companies and people are named only as State suppliers or as parties in public cases, as they appear in the cited sources. Anyone named may add their response or correct a figure, and it will be incorporated.',
    ],
  },
} as const

export function empContent(locale: string) {
  return (EMP_CONTENT as Record<string, typeof EMP_CONTENT.es>)[locale] ?? EMP_CONTENT.es
}
