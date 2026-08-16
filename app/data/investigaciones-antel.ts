/**
 * Investigación · «La cuadrilla de Antel»: quién instala la fibra y qué se puede saber de lo que cobra.
 *
 * DE DÓNDE SALE. Un lector preguntó por un dicho de boca en boca: que la cuadrilla de Antel es una
 * empresa tercerizada y que cobra «unos 7 palos por tapa soldada». La pieza contesta las dos mitades
 * por separado, porque una es verdadera y la otra no cierra.
 *
 * LA MITAD VERDADERA. La obra de fibra al hogar es tercerizada, y está en el pliego, no en el rumor.
 * La cláusula 2.6 define «encargado de cuadrilla» como personal DE LA EMPRESA. La 20.23 exige un
 * encargado por cuadrilla en el lugar de trabajo. La declaración jurada del Anexo II prohíbe que ese
 * personal trabaje para cualquier empresa privada de telecomunicaciones.
 *
 * LA MITAD QUE NO CIERRA, Y CÓMO SE PRUEBA SIN SUPONER NADA. El rubro existe: 210.80.50, «Soldadura
 * de tapa de cámara o camarita», y entra 20 veces en la Planilla de Cotización con la que se
 * adjudicó. El contrato entero se adjudicó en $ 95.508.755 sin impuestos. Dividido por esas 20
 * soldaduras da $ 4.775.438 — y eso suponiendo que el contrato no comprara NADA MÁS, cuando compra
 * 90.000 metros de cable aéreo, 33.000 de zanja y 119 rubros más. El límite superior absoluto queda
 * por debajo de los 7 millones. No hay que estimar un reparto de precios para cerrarlo.
 *
 * EL HALLAZGO PROPIO, que es lo que no se sabía. De 164 llamados de obra de red que ANTEL publicó
 * desde 2008, 6 tienen adjudicatario publicado, y uno solo es la obra de red en sí. ANTEL publica el
 * 3,3% de sus registros con nombre de empresa; OSE publica el 82,7%, ANCAP el 72,0%.
 *
 * TRAMPA QUE CASI ENTRA COMO HALLAZGO FALSO. Las dos empresas figuran con el MISMO monto al centavo
 * ($ 47.754.377,50 cada una). No es un empate sospechoso: el acta 368/26 dice que ORITECNO y CIETEL
 * ofertaron como «consorcio a constituirse». El registro parte la oferta única en dos mitades.
 *
 * SEGUNDA TRAMPA. Los títulos de ANTEL son el procedimiento pelado («Licitación Abreviada K104237/
 * 2023»): el objeto vive en `tender.description`, no en `tender.title`. Buscar por título da cero.
 *
 * Medido el 2026-08-16 contra el corpus en vivo. Ver tests/unit/antel-cuadrillas.verify.ts.
 */

export type Locale = 'es' | 'en'

export interface AntelCifra { valor: string, etiqueta: string, sub: string }
export interface AntelFuente { label: string, url: string }
export interface AntelBloque { titulo: string, parrafos: string[] }
/** Una fila del comparativo de transparencia entre empresas públicas. */
export interface AntelCobertura { ente: string, releases: string, conAdj: string, pct: string, destacar?: boolean }
/** Un paso de la cuenta que desarma el dicho. Se muestra en orden. */
export interface AntelPaso { label: string, valor: string, nota: string }

export interface AntelLado {
  titulo: string
  bajada: string
  kicker: string
  alcance: string
  origen: string
  portada: { cifras: AntelCifra[], parrafos: string[] }
  afirmacion: { titulo: string, dicho: string, parrafos: string[] }
  tercerizada: { titulo: string, parrafos: string[], clausulas: { cita: string, texto: string }[], matiz: string }
  aritmetica: {
    titulo: string
    parrafos: string[]
    rubro: { codigo: string, item: string, unidad: string, cantidad: string }
    pasos: AntelPaso[]
    veredicto: string
  }
  noSePuede: AntelBloque
  cobertura: { titulo: string, parrafos: string[], filas: AntelCobertura[], nota: string }
  antecedente: AntelBloque
  limites: { titulo: string, puntos: string[] }
  fuentes: AntelFuente[]
}

/** Medido el 2026-08-16 sobre los 7.582 registros de ANTEL en el corpus. */
export const ANTEL_MEASURED_ON = '2026-08-16'

/** La licitación que sostiene la pieza. Todo dato de obra sale de acá. */
export const ANTEL_FTTH = {
  ocid: 'ocds-yfs5dr-1301270',
  idCompra: '1301270',
  llamado: 'Licitación Pública 108693/2025',
  resolucion: 'Resolución 368/26 del 25/03/2026',
  montoSinIva: 95508755,
  montoConIva: 116520681.1,
  porEmpresa: 47754377.5,
  ofertas: 8,
  fichaUrl: 'https://www.comprasestatales.gub.uy/consultas/detalle/id/1301270',
  pliegoUrl: 'http://www.comprasestatales.gub.uy/Pliegos/pliego_1301270.zip',
  actaUrl: 'http://www.comprasestatales.gub.uy/Resoluciones/acta_1301270.pdf',
} as const

/** Las ocho empresas que ofertaron, tal como las nombra el acta 368/26. */
export const ANTEL_OFERENTES = [
  'Compañía Electrotécnica Industrial S.A.',
  'CIEMSA',
  'ORITECNO S.A. y CIETEL S.A. (consorcio a constituirse)',
  'Electrosistemas S.A.',
  'Gofinal S.A.',
  'Montelecnor S.A.',
  'SACEEM',
  'Teyma Uruguay S.A.',
] as const

const CONTENT: Record<Locale, AntelLado> = {
  es: {
    titulo: '«La cuadrilla de Antel»: quién instala la fibra, y qué se puede saber de lo que cobra',
    bajada: 'La cuadrilla que le instala la fibra sí es de una empresa contratada: está escrito en el pliego. Lo que no cierra es el precio del dicho. La «tapa soldada» es un rubro real —el 210.80.50— y entra veinte veces en la planilla con la que Antel adjudicó la obra de todo el país por 95,5 millones de pesos. Aunque el contrato entero no comprara otra cosa, cada soldadura daría 4,8 millones.',
    kicker: 'Tercerización · ANTEL',
    alcance: '7.582 registros de ANTEL, 2008-2026',
    origen: 'Registro de compras públicas (OCDS), el pliego y el acta de adjudicación',
    portada: {
      cifras: [
        { valor: '6 de 164', etiqueta: 'llamados de obra de red de Antel que publican quién los ganó', sub: 'Y uno solo de esos seis es la obra de red en sí. Los otros cinco son parkas, calzado de trabajo, un depósito en Rivera y una digitalización de planos.' },
        { valor: '3,3%', etiqueta: 'de los registros de Antel llevan el nombre de la empresa adjudicataria', sub: '250 de 7.582. OSE publica el 82,7% de los suyos, ANCAP el 72,0%. No es el formato del dato: es qué se publica.' },
        { valor: '95.508.755', etiqueta: 'de pesos sin impuestos: la obra de fibra al hogar de todo el país, adjudicada en marzo de 2026', sub: 'Ocho empresas ofertaron. Ganó el consorcio ORITECNO + CIETEL. Con impuestos, 116.520.681 pesos.' },
        { valor: '4.775.438', etiqueta: 'de pesos daría cada «tapa soldada» si el contrato entero no comprara otra cosa', sub: 'Es el techo aritmético, no un precio. El contrato también compra 90.000 metros de cable aéreo, 33.000 de zanja y 119 rubros más.' },
      ],
      parrafos: [
        'Esta pieza nace de una pregunta de un lector, y la contesta partida en dos, porque las dos mitades no corren la misma suerte. La primera —que la cuadrilla de Antel suele ser de una empresa tercerizada— es verdadera, y no hace falta creerle a nadie: está en el pliego de condiciones que Antel publica.',
        'La segunda —que cobra unos siete millones de pesos por tapa soldada— no cierra. El rubro existe, tiene código y está en la planilla con la que se adjudicó la obra. Con el total adjudicado y la cantidad de veces que ese rubro entra en la planilla alcanza para descartarlo sin suponer nada sobre cómo se reparten los precios.',
        'Y en el camino apareció algo que no estaba en la pregunta y que es peor que el rumor: de los 164 llamados de obra de red que Antel publicó desde 2008, uno solo dice quién construye la red.',
      ],
    },
    afirmacion: {
      titulo: 'La afirmación, tal como llegó',
      dicho: 'Generalmente «la cuadrilla de Antel» es una empresa tercerizada que cobra unos 7 palos por tapa soldada… un negoción.',
      parrafos: [
        'Se contesta en dos partes: si la cuadrilla es tercerizada, y si el precio es ese. La primera se verifica. La segunda se puede acotar, aunque el precio exacto no sea público.',
        'En Uruguay «un palo» es un millón de pesos, y así se lee acá. Si quien lo dijo manejaba otra escala, el registro público no permite ni confirmarlo ni desmentirlo, por la razón que explica la anteúltima sección: los precios unitarios no se publican.',
      ],
    },
    tercerizada: {
      titulo: 'La primera mitad es verdadera, y está escrita',
      parrafos: [
        'En diciembre de 2025 Antel llamó a Licitación Pública 108693/2025 por los «trabajos de instalación de redes, ampliaciones y reposiciones de fibra óptica hasta el hogar, en todo el territorio nacional». El pliego de condiciones es público y ocupa 124 páginas. Ahí la cuadrilla no es una figura del habla: es una categoría contractual.',
        'La adjudicación se resolvió el 25 de marzo de 2026. Ofertaron ocho empresas y ganó el consorcio de ORITECNO S.A. y CIETEL S.A., por 95.508.755 pesos sin impuestos. El registro las anota con la mitad cada una, 47.754.377,50: no es un empate, es una oferta sola partida en dos, porque se presentaron como consorcio a constituirse.',
      ],
      clausulas: [
        { cita: 'Cláusula 2.6', texto: '«Capataz» y «Encargado de cuadrilla» se refiere a personal de la empresa, designado por ésta, que esté en obra y que tienen a cargo los trabajos notificados por la Administración.' },
        { cita: 'Cláusula 20.23', texto: 'La empresa deberá contar en todas las cuadrillas con un encargado de cuadrilla el que deberá estar en el lugar de trabajo en forma permanente.' },
        { cita: 'Declaración jurada, Anexo II', texto: 'Todo el personal asignado a la presente contratación ya sea el de las distintas cuadrillas, así como los encargados de las mismas y el representante técnico, no podrán realizar trabajos (directos o subcontratados) para ninguna empresa privada que brinde servicios de telecomunicaciones.' },
      ],
      matiz: 'El «generalmente» del dicho es donde conviene frenar. Antel tiene además su propia planta externa, con funcionarios propios: 53 de sus llamados la nombran, y entre ellos hay compras de calzado de trabajo y de parkas de invierno «para los funcionarios de las Plantas Externas de todo el país». Conviven los dos modelos. Lo que se terceriza es el despliegue y la ampliación de la red; el mantenimiento aparece de las dos formas.',
    },
    aritmetica: {
      titulo: 'La segunda mitad: la cuenta que la desarma',
      parrafos: [
        'La «tapa soldada» no es una invención del rumor. Es el rubro 210.80.50 de la planilla de cotización, y soldar la tapa de una cámara es exactamente lo que suena: sellar la tapa de la boca de registro donde entran los cables.',
        'La planilla tiene 122 rubros y funciona así: la empresa le pone precio unitario a cada uno, Antel fija las cantidades y el total de esa planilla es lo que se compara entre oferentes y lo que se adjudica. Lo dice la cláusula 15.2. Las cantidades son estimadas y pueden variar durante la obra —cláusula 15.7—, pero el total adjudicado es ese.',
        'Con eso alcanza. No hace falta saber cuánto puso cada empresa en cada renglón.',
      ],
      rubro: { codigo: '210.80.50', item: 'Soldadura de tapa de cámara o camarita', unidad: 'un', cantidad: '20' },
      pasos: [
        { label: 'Si cada soldadura valiera 7 millones', valor: '140.000.000', nota: '20 soldaduras × 7.000.000. Ese solo renglón sería 1,47 veces todo el contrato nacional.' },
        { label: 'Y el contrato entero se adjudicó en', valor: '95.508.755', nota: 'Sin impuestos, para las dos empresas del consorcio juntas. Verificado en la ficha oficial y en el acta.' },
        { label: 'Techo absoluto por soldadura', valor: '4.775.438', nota: 'El contrato entero dividido en 20, o sea suponiendo que no comprara ninguna otra cosa. Sigue por debajo de 7 millones.' },
      ],
      veredicto: 'Y el contrato compra muchísimo más que eso: 90.000 metros de cable de 8 fibras tendido en poste, 33.000 metros de zanja a 70 centímetros, 950 columnas de 5,70 metros, 700 camaritas prefabricadas y 400 aperturas y cierres de caja de empalme, entre otros 117 rubros. En la práctica la soldadura de tapa es uno de los renglones más chicos de la planilla: veinte unidades contra decenas de miles de metros. El precio del dicho no entra en el contrato ni forzando la cuenta a su límite.',
    },
    noSePuede: {
      titulo: 'Lo que no se puede saber, y por qué',
      parrafos: [
        'Ni esta pieza ni ninguna otra puede decir cuánto se paga exactamente por una tapa soldada. La planilla de cotización con los precios unitarios viaja dentro de la oferta de cada empresa, y las ofertas no se publican. Lo que el Estado publica es el total.',
        'Es una distinción que importa, porque es la que separa lo verificable de lo opinable. Se puede afirmar que el precio del dicho no cabe en el contrato. No se puede afirmar cuál es el precio real, ni si es caro o barato contra el mercado.',
        'Quien quiera cerrar esa brecha tiene un camino: pedir el cuadro comparativo de precios por acceso a la información pública. Es un documento que existe —el acta lo cita— y que hoy no está en línea.',
      ],
    },
    cobertura: {
      titulo: 'El hallazgo que no estaba en la pregunta',
      parrafos: [
        'Al ir a buscar cuánto le paga Antel a sus contratistas apareció que casi nunca se puede saber. Antel publica sus llamados —eso lo hace, y bien—, pero rara vez publica quién los ganó.',
        'De los 7.582 registros de Antel en el corpus, 250 llevan el nombre de una empresa adjudicataria: el 3,3%. En OSE esa proporción es el 82,7% y en ANCAP el 72,0%. No es una diferencia de formato ni un problema de nuestra ingesta: son los mismos archivos abiertos, el mismo portal y el mismo período.',
        'Acotado a lo que motivó esta nota, es más marcado todavía. Antel publicó 164 llamados de obra de red desde 2008 —fibra óptica, planta externa, red de acceso, canalizaciones—. Seis tienen adjudicatario publicado, y de esos seis uno solo es la obra de red: la licitación de fibra al hogar de 2025. Los otros cinco son ropa de trabajo, calzado, un depósito y una digitalización de planos.',
        'La plata está a la vista, sin nombre. Antel tiene 538 registros que publican un monto sin decir a quién se le adjudicó, y suman 11.641 millones de pesos: casi cinco veces los 2.426 millones que sí tienen nombre. Entre ellos, una compra por excepción de 781 millones por «servicios de operación y mantenimiento, reparación» y una licitación pública de 244 millones por «perfil técnico de planta externa» — es decir, cuadrillas.',
      ],
      filas: [
        { ente: 'ANTEL', releases: '7.582', conAdj: '250', pct: '3,3%', destacar: true },
        { ente: 'OSE', releases: '9.072', conAdj: '7.500', pct: '82,7%' },
        { ente: 'AFE', releases: '5.666', conAdj: '4.126', pct: '72,8%' },
        { ente: 'UTE', releases: '6.955', conAdj: '5.030', pct: '72,3%' },
        { ente: 'ANCAP', releases: '25.234', conAdj: '18.169', pct: '72,0%' },
        { ente: 'ANP', releases: '10.722', conAdj: '7.119', pct: '66,4%' },
        { ente: 'Banco de Seguros', releases: '776', conAdj: '382', pct: '49,2%' },
      ],
      nota: 'Son siete empresas públicas medidas con el mismo criterio, y Antel no está última por poco: la penúltima es el Banco de Seguros, con 49,2%. UTE es un caso aparte y conviene decirlo: publica el 72,3%, pero sus adjudicaciones en el corpus se cortan en 2016. Las de ANCAP y OSE llegan hasta hoy. Las de Antel existen casi sólo desde 2025: entre 2011 y 2020 no hay ninguna.',
    },
    antecedente: {
      titulo: 'El antecedente que conviene tener a mano',
      parrafos: [
        'Esta no es la primera vez que las licitaciones de fibra de Antel quedan bajo la lupa. En 2021 la empresa adjudicó siete llamados de fibra al hogar repartidos por zonas, y el Tribunal de Cuentas advirtió que podían haberse repartido entre los oferentes: derivó los antecedentes a la Comisión de Promoción y Defensa de la Competencia, que abrió una investigación de oficio y la cerró en diciembre de 2024 sin sanciones publicadas.',
        'Los nombres se repiten. Varias de las empresas que Brecha listó entonces —Montelecnor, Electrosistemas, Ciemsa, SACEEM, Gofinal, Oritecno— son las que volvieron a ofertar en 2026. Que se repitan no prueba nada por sí solo: es un mercado chico y son las empresas que hacen este trabajo en el país.',
        'La diferencia entre aquel episodio y este es que en 2026 hubo ocho ofertas en un único llamado nacional y ganó la más barata del comparativo. Eso es lo que dice el acta.',
      ],
    },
    limites: {
      titulo: 'Los límites de esta nota',
      puntos: [
        'No se publica ningún precio unitario porque no existe públicamente. La cuenta que desarma el dicho usa sólo el total adjudicado y la cantidad del rubro en la planilla, que sí son públicos.',
        'El techo de 4.775.438 pesos por soldadura no es una estimación de precio: es el resultado de una hipótesis absurda a propósito —que el contrato no comprara nada más— usada como cota superior.',
        'Que la obra sea tercerizada no es una irregularidad. Es el mecanismo previsto y licitado, con ocho empresas compitiendo en el último llamado.',
        'Las cantidades de la planilla son estimadas y pueden variar durante la ejecución, según la cláusula 15.7. Lo que no varía es el monto adjudicado.',
        'Nombrar a ORITECNO, CIETEL o a cualquiera de los otros oferentes no implica ningún señalamiento: figuran como proveedores del Estado en el registro oficial, y la adjudicación de 2026 no tiene ninguna observación conocida.',
        'La comparación de transparencia mide qué publica cada organismo en los datos abiertos, no qué gasta. Que Antel publique poco no dice que gaste mal: dice que no se puede mirar.',
      ],
    },
    fuentes: [
      { label: 'Ficha oficial de la Licitación Pública 108693/2025 — obra de fibra al hogar en todo el país', url: 'https://www.comprasestatales.gub.uy/consultas/detalle/id/1301270' },
      { label: 'Pliego de condiciones particulares y generales de la licitación (124 páginas, con la planilla de cotización)', url: 'http://www.comprasestatales.gub.uy/Pliegos/pliego_1301270.zip' },
      { label: 'Acta de adjudicación — Resolución 368/26 del 25 de marzo de 2026', url: 'http://www.comprasestatales.gub.uy/Resoluciones/acta_1301270.pdf' },
      { label: 'Montevideo Portal — «Califican de “confusa” la situación de los trabajadores tercerizados de Antel» (17/10/2021)', url: 'https://www.montevideo.com.uy/Noticias/Califican-de-confusa-la-situacion-de-los-trabajadores-tercerizados-de-Antel-uc801392' },
      { label: 'Brecha — «El Tribunal de Cuentas alerta presunta colusión en licitaciones de ANTEL» (20/05/2022)', url: 'https://brecha.com.uy/acuerdo-de-precios-el-tribunal-de-cuentas-alerta-presunta-colusion-en-licitaciones-de-antel/' },
      { label: 'la diaria — «Autoridades de Antel analizarán presuntos sobrecostos en licitaciones para la instalación de fibra óptica» (19/11/2021)', url: 'https://ladiaria.com.uy/politica/articulo/2021/11/autoridades-de-antel-analizaran-presuntos-sobrecostos-en-licitaciones-para-la-instalacion-de-fibra-optica/' },
      { label: 'MEF, Comisión de Promoción y Defensa de la Competencia — Resolución 215/024, cierre de la investigación de oficio sobre ANTEL', url: 'https://www.gub.uy/ministerio-economia-finanzas/institucional/normativa/resolucion-n-215024-asunto-n-2022-05-150-7-tribunal-cuentas-antel' },
      { label: 'Nuestro corpus: registros OCDS de Compras Estatales, medidos el 16 de agosto de 2026', url: 'https://www.comprasestatales.gub.uy/' },
    ],
  },
  en: {
    titulo: '"The Antel crew": who installs the fibre, and what can be known about what they charge',
    bajada: 'The crew that installs your fibre does work for a contractor: it is written into the tender documents. What does not add up is the price in the rumour. The "welded lid" is a real line item — code 210.80.50 — and it appears twenty times in the price schedule Antel used to award the nationwide works for 95.5 million pesos. Even if the whole contract bought nothing else, each weld would come to 4.8 million.',
    kicker: 'Outsourcing · ANTEL',
    alcance: '7,582 ANTEL records, 2008-2026',
    origen: 'Public procurement record (OCDS), the tender documents and the award resolution',
    portada: {
      cifras: [
        { valor: '6 of 164', etiqueta: 'Antel network-works tenders that publish who won them', sub: 'And only one of those six is the network works itself. The other five are parkas, work boots, a depot in Rivera and a drawings-digitisation job.' },
        { valor: '3.3%', etiqueta: 'of Antel records carry the name of the winning company', sub: '250 out of 7,582. OSE publishes 82.7% of its own, ANCAP 72.0%. This is not a data-format problem: it is what gets published.' },
        { valor: '95,508,755', etiqueta: 'pesos before tax: the nationwide fibre-to-the-home works, awarded in March 2026', sub: 'Eight companies bid. The ORITECNO + CIETEL consortium won. With tax, 116,520,681 pesos.' },
        { valor: '4,775,438', etiqueta: 'pesos is what each "welded lid" would come to if the whole contract bought nothing else', sub: 'That is an arithmetic ceiling, not a price. The contract also buys 90,000 metres of aerial cable, 33,000 of trench and 119 other line items.' },
      ],
      parrafos: [
        'This piece comes from a reader\'s question, and it answers it in two halves, because the two do not fare the same. The first — that the Antel crew is usually a contractor\'s crew — is true, and you need not take anyone\'s word for it: it is in the tender conditions Antel publishes.',
        'The second — that it charges some seven million pesos per welded lid — does not add up. The line item exists, it has a code and it sits in the schedule the works were awarded on. The awarded total and the quantity of that line item are enough to rule it out without assuming anything about how prices are split.',
        'Along the way something turned up that was not in the question and is worse than the rumour: of the 164 network-works tenders Antel has published since 2008, exactly one says who builds the network.',
      ],
    },
    afirmacion: {
      titulo: 'The claim, as it arrived',
      dicho: 'Generally "the Antel crew" is an outsourced company that charges some 7 million pesos per welded lid… quite the racket.',
      parrafos: [
        'It splits in two: whether the crew is outsourced, and whether the price is that. The first can be verified. The second can be bounded, even though the exact price is not public.',
        'In Uruguay "un palo" means one million pesos, and that is how it is read here. If the speaker had another scale in mind, the public record can neither confirm nor deny it, for the reason the second-to-last section explains: unit prices are not published.',
      ],
    },
    tercerizada: {
      titulo: 'The first half is true, and it is in writing',
      parrafos: [
        'In December 2025 Antel called Public Tender 108693/2025 for "network installation, extension and replacement works for fibre to the home, across the entire national territory". The tender conditions are public and run to 124 pages. There the crew is not a figure of speech: it is a contractual category.',
        'The award was resolved on 25 March 2026. Eight companies bid and the consortium of ORITECNO S.A. and CIETEL S.A. won, for 95,508,755 pesos before tax. The record lists each at half that, 47,754,377.50: not a tie, but a single bid split in two, because they bid as a consortium to be formed.',
      ],
      clausulas: [
        { cita: 'Clause 2.6', texto: '"Foreman" and "crew supervisor" refer to company personnel, designated by the company, present on site and in charge of the works notified by the Administration.' },
        { cita: 'Clause 20.23', texto: 'The company must have a crew supervisor on every crew, who must be at the work site permanently.' },
        { cita: 'Sworn statement, Annex II', texto: 'All personnel assigned to this contract, whether crew members, their supervisors or the technical representative, may not carry out work (direct or subcontracted) for any private telecommunications company.' },
      ],
      matiz: 'The "generally" in the claim is where to slow down. Antel also has its own outside plant department, staffed by its own employees: 53 of its tenders name it, and among them are purchases of work boots and winter parkas "for the staff of the Outside Plant units across the country". Both models coexist. What is outsourced is network rollout and extension; maintenance appears in both forms.',
    },
    aritmetica: {
      titulo: 'The second half: the arithmetic that undoes it',
      parrafos: [
        'The "welded lid" is not an invention of the rumour. It is line item 210.80.50 in the price schedule, and welding a chamber lid is exactly what it sounds like: sealing the lid of the access chamber the cables run into.',
        'The schedule has 122 line items and works like this: the company prices each one, Antel sets the quantities, and the schedule total is what gets compared between bidders and what gets awarded. Clause 15.2 says so. Quantities are estimates and may vary during the works — clause 15.7 — but the awarded total is that.',
        'That is enough. There is no need to know what each company entered on each line.',
      ],
      rubro: { codigo: '210.80.50', item: 'Welding of a chamber or handhole lid', unidad: 'unit', cantidad: '20' },
      pasos: [
        { label: 'If each weld were worth 7 million', valor: '140,000,000', nota: '20 welds × 7,000,000. That single line would be 1.47 times the whole national contract.' },
        { label: 'And the whole contract was awarded at', valor: '95,508,755', nota: 'Before tax, for both consortium companies together. Verified on the official record and in the award resolution.' },
        { label: 'Absolute ceiling per weld', valor: '4,775,438', nota: 'The entire contract divided by 20, i.e. assuming it bought nothing else at all. Still under 7 million.' },
      ],
      veredicto: 'And the contract buys far more than that: 90,000 metres of 8-fibre cable strung on poles, 33,000 metres of trench at 70 centimetres, 950 poles of 5.70 metres, 700 prefabricated handholes and 400 splice-closure openings and closings, among 117 other items. In practice the lid weld is one of the smallest lines in the schedule: twenty units against tens of thousands of metres. The price in the rumour does not fit in the contract even when the arithmetic is pushed to its limit.',
    },
    noSePuede: {
      titulo: 'What cannot be known, and why',
      parrafos: [
        'Neither this piece nor any other can say exactly what is paid for one welded lid. The priced schedule travels inside each company\'s bid, and bids are not published. What the state publishes is the total.',
        'The distinction matters, because it is what separates the verifiable from the arguable. One can state that the rumoured price does not fit in the contract. One cannot state what the real price is, or whether it is dear or cheap against the market.',
        'Anyone wanting to close that gap has a route: request the comparative price table under freedom-of-information law. It is a document that exists — the award resolution cites it — and that is not online today.',
      ],
    },
    cobertura: {
      titulo: 'The finding that was not in the question',
      parrafos: [
        'Going to look for how much Antel pays its contractors turned up the fact that you almost never can. Antel publishes its tenders — it does that, and well — but it rarely publishes who won them.',
        'Of Antel\'s 7,582 records in the corpus, 250 carry a winning company\'s name: 3.3%. At OSE that share is 82.7% and at ANCAP 72.0%. This is not a formatting difference or a gap in our ingestion: same open files, same portal, same period.',
        'Narrowed to what prompted this piece, it is starker still. Antel has published 164 network-works tenders since 2008 — fibre optics, outside plant, access network, ducting. Six have a published winner, and of those six exactly one is the network works itself: the 2025 fibre-to-the-home tender. The other five are workwear, boots, a depot and a drawings digitisation.',
        'The money is in plain sight, without a name. Antel has 538 records that publish an amount without saying who was awarded it, adding up to 11,641 million pesos: almost five times the 2,426 million that do carry a name. Among them, an exception purchase of 781 million for "operation and maintenance, repair services" and a public tender of 244 million for an "outside plant technical profile" — that is, crews.',
      ],
      filas: [
        { ente: 'ANTEL', releases: '7,582', conAdj: '250', pct: '3.3%', destacar: true },
        { ente: 'OSE', releases: '9,072', conAdj: '7,500', pct: '82.7%' },
        { ente: 'AFE', releases: '5,666', conAdj: '4,126', pct: '72.8%' },
        { ente: 'UTE', releases: '6,955', conAdj: '5,030', pct: '72.3%' },
        { ente: 'ANCAP', releases: '25,234', conAdj: '18,169', pct: '72.0%' },
        { ente: 'ANP', releases: '10,722', conAdj: '7,119', pct: '66.4%' },
        { ente: 'State Insurance Bank', releases: '776', conAdj: '382', pct: '49.2%' },
      ],
      nota: 'Seven state companies measured on the same criterion, and Antel is not last by a hair: second-to-last is the State Insurance Bank at 49.2%. UTE is a case apart and worth saying so: it publishes 72.3%, but its awards in the corpus stop in 2016. ANCAP\'s and OSE\'s run to today. Antel\'s exist almost only from 2025: between 2011 and 2020 there are none at all.',
    },
    antecedente: {
      titulo: 'The precedent worth keeping to hand',
      parrafos: [
        'This is not the first time Antel\'s fibre tenders have come under scrutiny. In 2021 the company awarded seven fibre-to-the-home tenders split by geographic zone, and the Court of Audit warned they might have been shared out among the bidders: it referred the file to the Competition Promotion and Defence Commission, which opened an ex-officio investigation and closed it in December 2024 with no published sanctions.',
        'The names recur. Several of the firms Brecha listed then — Montelecnor, Electrosistemas, Ciemsa, SACEEM, Gofinal, Oritecno — are the ones that bid again in 2026. Recurrence proves nothing on its own: it is a small market and these are the firms that do this work in the country.',
        'The difference between that episode and this one is that in 2026 there were eight bids in a single national tender and the cheapest on the comparison won. That is what the award resolution says.',
      ],
    },
    limites: {
      titulo: 'The limits of this piece',
      puntos: [
        'No unit price is published here because none exists publicly. The arithmetic that undoes the rumour uses only the awarded total and the line item\'s quantity in the schedule, both of which are public.',
        'The ceiling of 4,775,438 pesos per weld is not a price estimate: it is the result of a deliberately absurd hypothesis — that the contract bought nothing else — used as an upper bound.',
        'That the works are outsourced is not an irregularity. It is the mechanism foreseen and tendered, with eight companies competing in the latest call.',
        'The schedule quantities are estimates and may vary during execution, per clause 15.7. What does not vary is the awarded amount.',
        'Naming ORITECNO, CIETEL or any of the other bidders implies no accusation: they appear as state suppliers in the official record, and the 2026 award carries no known objection.',
        'The transparency comparison measures what each agency publishes in the open data, not what it spends. Antel publishing little does not say it spends badly: it says it cannot be watched.',
      ],
    },
    fuentes: [
      { label: 'Official record for Public Tender 108693/2025 — nationwide fibre-to-the-home works', url: 'https://www.comprasestatales.gub.uy/consultas/detalle/id/1301270' },
      { label: 'Particular and general tender conditions (124 pages, including the price schedule)', url: 'http://www.comprasestatales.gub.uy/Pliegos/pliego_1301270.zip' },
      { label: 'Award resolution — Resolution 368/26 of 25 March 2026', url: 'http://www.comprasestatales.gub.uy/Resoluciones/acta_1301270.pdf' },
      { label: 'Montevideo Portal — "Antel\'s outsourced workers\' situation called \'confusing\'" (17/10/2021)', url: 'https://www.montevideo.com.uy/Noticias/Califican-de-confusa-la-situacion-de-los-trabajadores-tercerizados-de-Antel-uc801392' },
      { label: 'Brecha — "The Court of Audit flags suspected collusion in ANTEL tenders" (20/05/2022)', url: 'https://brecha.com.uy/acuerdo-de-precios-el-tribunal-de-cuentas-alerta-presunta-colusion-en-licitaciones-de-antel/' },
      { label: 'la diaria — "Antel authorities will look into alleged cost overruns in fibre-optic installation tenders" (19/11/2021)', url: 'https://ladiaria.com.uy/politica/articulo/2021/11/autoridades-de-antel-analizaran-presuntos-sobrecostos-en-licitaciones-para-la-instalacion-de-fibra-optica/' },
      { label: 'Ministry of Economy, Competition Commission — Resolution 215/024, closing the ex-officio investigation into ANTEL', url: 'https://www.gub.uy/ministerio-economia-finanzas/institucional/normativa/resolucion-n-215024-asunto-n-2022-05-150-7-tribunal-cuentas-antel' },
      { label: 'Our own corpus: OCDS procurement records from Compras Estatales, measured on 16 August 2026', url: 'https://www.comprasestatales.gub.uy/' },
    ],
  },
}

export function antelContent(locale: string): AntelLado {
  return CONTENT[(locale === 'en' ? 'en' : 'es') as Locale]
}
