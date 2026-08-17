/**
 * Investigación · Cuatro horas menos: qué ganó la construcción y por dónde pasa la cuenta.
 *
 * QUÉ MIDE. El convenio de la industria de la construcción, firmado el 15 de agosto de 2026, baja la
 * jornada de 44 a 40 horas semanales hasta 2030 sin bajar el salario. La pieza mide una sola cosa que
 * el debate público no midió: por qué canal ese costo llega al presupuesto del Estado, y de qué
 * tamaño es ese canal en el registro de compras públicas.
 *
 * EL HALLAZGO ESTÁ EN LOS RUBROS, NO EN UNA OPINIÓN. Los contratos de obra pública del corpus traen
 * líneas de precio con nombre propio: «Ajuste Paramétrico» y «LL SS» (leyes sociales). En el mayor
 * contrato de obra del registro —OSE, Licitación Pública 24711/2023, saneamiento— esas dos líneas son
 * el 20,59% del lado en pesos. Eso no es una estimación: es la propia estructura de precios que el
 * organismo publicó.
 *
 * ESTA PIEZA NO TOMA PARTIDO. Un convenio colectivo es un contrato entre privados, amparado por la
 * Ley 10.449 y por el Consejo de Salarios del Grupo 9. Nada de lo medido acá describe un
 * incumplimiento. La sección «qué se acordó» va antes que cualquier cifra de costo, para que la pieza
 * no se lea como un cargo contra el sindicato ni como una defensa de las cámaras.
 *
 * ARITMÉTICA QUE LA PRENSA MEZCLÓ. Bajar de 44 a 40 horas es −9,09% de horas. A salario semanal
 * constante, es +10,00% de costo por hora. Son dos números distintos y varios medios los usaron como
 * si fueran el mismo. La sección «la aritmética» los separa.
 *
 * TRAMPAS DE MEDICIÓN, todas ya aplicadas acá:
 *   - `awards.items.unit.value` mezcla monedas dentro del mismo contrato. Sumar sin agrupar por
 *     `currency` produce un total sin sentido. Todas las cifras de rubros de esta pieza son UYU.
 *   - El proveedor se mide por `awards.suppliers.id` y con las DOS grafías del RUT (`R/…` y `R…`).
 *     Medir SACEEM por nombre da 43.859 millones; por RUT da 48.034.
 *   - Se descartan las adjudicaciones de más de 50.000 millones de pesos (techo de artefacto del
 *     sitio). Sin ese techo, 2019 da 111.056 millones en rubros de obra, más que todo el gasto
 *     registrado de ese año.
 *   - Deduplicación por `ocid`: el feed publica varios registros por compra (aclaración, ajuste).
 *
 * Medido el 2026-08-16 sobre el corpus en vivo.
 */

export type Locale = 'es' | 'en'

export interface SuncaFuente { label: string, url: string }
export interface SuncaCifra { valor: string, etiqueta: string, sub?: string }

/** Un hito de la línea de tiempo: qué ganó el sindicato y cuándo. */
export interface SuncaHito {
  fecha: string
  titulo: string
  detalle: string
  /** De dónde sale el hito. Sin fuente no entra. */
  fuente: SuncaFuente
}

/** Una cifra que circuló en prensa, con el estado de su respaldo. */
export interface SuncaClaim {
  cifra: string
  dicho: string
  medio: string
  url: string
  /** Qué encontramos cuando fuimos a buscar el respaldo. */
  respaldo: string
  estado: 'sin fuente citada' | 'verificable' | 'inconsistente'
}

/** Una línea de precio del contrato de obra, tal como la publica el organismo. */
export interface SuncaRubro {
  nombre: string
  monto: string
  pct: string
  nota: string
}

export interface SuncaBloque { titulo: string, parrafos: string[] }

/** Un contrato del carril de «escala». Sólo los siete que concentran la serie. */
export interface SuncaContrato {
  nombre: string
  organismo: string
  ano: string
  monto: string
}

export interface SuncaContent {
  kicker: string
  titulo: string
  bajada: string
  alcance: string
  periodo: string
  origen: string
  portada: { cifras: SuncaCifra[], parrafos: string[], ficha: { titulo: string, filas: { k: string, v: string }[] } }
  acuerdo: SuncaBloque & { cronograma: { fecha: string, horas: string, nota: string }[] }
  hitos: { titulo: string, dek: string, items: SuncaHito[] }
  aritmetica: SuncaBloque & { cuentas: { formula: string, resultado: string, lectura: string }[] }
  claims: { titulo: string, dek: string, items: SuncaClaim[] }
  canal: SuncaBloque & {
    contrato: { titulo: string, subtitulo: string, total: string, rubros: SuncaRubro[] }
    derivacion: string[]
  }
  escala: SuncaBloque & { contratos: SuncaContrato[] }
  limites: { titulo: string, puntos: string[] }
  fuentes: SuncaFuente[]
}

/** Fecha de medición sobre el corpus en vivo. */
export const SUNCA_MEASURED_ON = '2026-08-16'

const CONTENT: Record<Locale, SuncaContent> = {
  es: {
    kicker: 'Convenio de la construcción',
    titulo: 'Cuatro horas menos: qué ganó la construcción y por dónde pasa la cuenta',
    bajada: 'El 15 de agosto de 2026 el SUNCA y las cámaras firmaron un convenio a cinco años que baja la jornada de 44 a 40 horas semanales sin bajar el salario. La discusión pública se llenó de porcentajes sin fuente. Fuimos a buscar el único tramo que sí se puede medir desde el registro de compras públicas: el canal por el que el costo laboral de la obra llega al presupuesto del Estado.',
    alcance: 'Convenio del Grupo 9 · rubros de obra del catálogo estatal',
    periodo: '1958 – 2031',
    origen: 'Registro de compras públicas (OCDS), prensa uruguaya contrastada y normas citadas',
    portada: {
      cifras: [
        { valor: '−9,09%', etiqueta: 'de horas por semana, no −10%: la jornada baja de 44 a 40', sub: 'A salario semanal constante, el costo por hora sube +10,00%. Son dos números distintos y varios medios los publicaron como si fueran el mismo.' },
        { valor: '20,59%', etiqueta: 'del lado en pesos del mayor contrato de obra del registro son ajuste paramétrico y leyes sociales', sub: 'OSE, Licitación Pública 24711/2023. No es una estimación: son dos líneas de precio con nombre propio en la adjudicación publicada.' },
        { valor: '159.853 millones', etiqueta: 'de pesos adjudicó el Estado en rubros de obra entre 2019 y 2026', sub: '9.874 adjudicaciones. Siete contratos concentran el 71,56%: seis viales y un centro de reclusión.' },
        { valor: '4 de 4', etiqueta: 'cifras de costo que circularon en prensa no citan el estudio del que salen', sub: 'El 9% de mano de obra, el 10% de costo de obra, el 5,5% de precio de venta y el 30% de brecha de productividad. Ninguna nota nombra la fuente.' },
      ],
      parrafos: [
        'El 4 de agosto de 2026 el SUNCA y las gremiales empresariales de la construcción anunciaron un preacuerdo. La asamblea del sindicato lo aprobó el 13 de agosto y la firma fue el 15 en la Dirección Nacional de Trabajo. El convenio rige de abril de 2026 a marzo de 2031. Baja la jornada de 44 a 40 horas semanales en cuatro escalones, entre 2027 y 2030, sin reducción de salario.',
        'A partir de ahí la discusión se movió a los costos, y ahí empezó el problema. Los porcentajes que circularon —9% de aumento del costo de la mano de obra por hora, 10% de aumento del costo de obra, 5,5% de aumento del precio de venta de una vivienda— aparecen atribuidos a «estudios comparativos internacionales» que ningún medio nombra. Fuimos a buscarlos y no están.',
        'Este sitio no puede medir salarios: el registro de compras públicas no los tiene. Sí puede medir una cosa que nadie midió, y que es específica del Estado. Cuando el Estado contrata una obra, el precio no es fijo. El Pliego Único de obras públicas prevé fórmulas paramétricas, y el índice de mano de obra que las alimenta se calcula a partir del laudo del Consejo de Salarios. Es decir: el convenio que firmaron el sindicato y las cámaras reprecia, por diseño, lo que paga el contribuyente.',
        'El tamaño de ese canal se ve en los rubros. En el mayor contrato de obra del registro —el saneamiento de OSE adjudicado en 2024 a SACEEM, CIEMSA, TEYMA y una empresa brasileña— la adjudicación publica 416 líneas de precio. Entre ellas hay 80 líneas llamadas «Ajuste Paramétrico» por 3.408 millones de pesos y 151 líneas llamadas «LL SS» —leyes sociales— por 2.824 millones. Juntas son el 20,59% del lado en pesos del contrato, y el contrato tiene rubros previstos hasta 2029.',
        'Con eso alcanza para una cuenta que el debate no hizo. Si la mano de obra con sus leyes sociales es el 20,16% de ese contrato, un aumento del 10% en el costo por hora agrega alrededor del 2% al contrato, no el 10% que se publicó. Para que un contrato de obra subiera 10% por esta vía, la mano de obra tendría que ser casi todo el costo. No lo es en ninguno de los contratos que pudimos abrir.',
      ],
      ficha: {
        titulo: 'El convenio en once líneas',
        filas: [
          { k: 'Ámbito', v: 'Grupo 9, subgrupo 01 — industria de la construcción y actividades complementarias' },
          { k: 'Partes', v: 'SUNCA y las gremiales empresariales de la construcción' },
          { k: 'Preacuerdo', v: '4 de agosto de 2026' },
          { k: 'Asamblea', v: '13 de agosto de 2026, aprobado' },
          { k: 'Firma', v: '15 de agosto de 2026, Dirección Nacional de Trabajo' },
          { k: 'Vigencia', v: 'Abril de 2026 a marzo de 2031' },
          { k: 'Jornada', v: 'De 44 a 40 horas semanales, entre 2027 y 2030' },
          { k: 'Salario', v: 'Sin reducción. Ajuste de 5,17% retroactivo a abril de 2026' },
          { k: 'Ajustes', v: 'Anuales cada abril hasta 2030, con correctivos por inflación' },
          { k: 'Conflicto previo', v: 'Más de 120 días. El sindicato contó 126' },
          { k: 'Empieza a bajar horas', v: '30 de agosto de 2027' },
        ],
      },
    },
    acuerdo: {
      titulo: 'Qué se acordó, exactamente',
      parrafos: [
        'El convenio es del Grupo 9, subgrupo 01, «Industria de la construcción y actividades complementarias». Dura cinco años: de abril de 2026 a marzo de 2031. Es el primer convenio del sector con esa extensión, y las dos partes lo llamaron histórico por eso antes que por las horas.',
        'La jornada baja una hora por año en cuatro escalones. La reducción no toca el salario. Las empresas pueden aplicarla de dos formas: una hora menos de lunes a jueves, o hasta cuatro horas menos el viernes. Las cámaras pidieron esa flexibilidad y quedó en el texto.',
        'El convenio incluye un ajuste salarial de 5,17% retroactivo a abril de 2026 y ajustes anuales cada abril hasta 2030, con correctivos por inflación. Garantiza crecimiento del salario real en todo el período. Suma además el reintegro de los trabajadores que estaban en seguro de paro, 8 millones de pesos para reembolsar exámenes médicos preventivos a mayores de 40 años, una hora paga por semestre para actividades de salud mental, el doble de entregas de ropa de trabajo desde abril de 2028 y un plazo de 120 días para acordar un protocolo de calor.',
        'El conflicto previo duró más de 120 días. El secretario general del sindicato, Javier Díaz, lo contó como 126 días de lucha. El ministro de Trabajo, Juan Castillo, y el presidente de la Cámara de la Construcción, Alejandro Ruibal, usaron los dos la palabra «histórico».',
      ],
      cronograma: [
        { fecha: '30 de agosto de 2027', horas: '43 horas', nota: 'Primer escalón. Hasta esa fecha rigen las 44 horas actuales.' },
        { fecha: '1º de mayo de 2028', horas: '42 horas', nota: 'Segundo escalón.' },
        { fecha: '1º de mayo de 2029', horas: '41 horas', nota: 'Tercer escalón.' },
        { fecha: '28 de enero de 2030', horas: '40 horas', nota: 'Escalón final, un año antes de que venza el convenio.' },
      ],
    },
    hitos: {
      titulo: 'Las conquistas anteriores, con su norma',
      dek: 'El sindicato llama «conquistas» a lo que consiguió en 68 años. La lista de abajo sólo incluye las que tienen una norma o un hecho verificable detrás. Las que no la tienen quedan afuera, aunque el sindicato las reivindique.',
      items: [
        {
          fecha: '11 de mayo de 1958',
          titulo: 'Se funda el SUNCA',
          detalle: 'Primer Congreso Nacional del sindicato único de la construcción. El gremio participa después en la creación de la Convención Nacional de Trabajadores.',
          fuente: { label: 'SUNCA — Wikipedia', url: 'https://es.wikipedia.org/wiki/Sindicato_%C3%9Anico_Nacional_de_la_Construcci%C3%B3n_y_Anexos' },
        },
        {
          fecha: '7 de agosto de 1975',
          titulo: 'Aporte Unificado de la Construcción',
          detalle: 'La Ley 14.411 crea un régimen de aportación propio del sector. Un solo porcentaje sobre los jornales cubre jubilación, salud y cargas salariales. El obligado al pago es el dueño del inmueble, no la empresa constructora. Hoy la tasa es 71,8%, y llega a 75,8% con el aporte a la Caja de Profesionales.',
          fuente: { label: 'BPS — Régimen Construcción, tasas vigentes', url: 'https://www.bps.gub.uy/837/regimen-construccion.html' },
        },
        {
          fecha: '26 de diciembre de 2007',
          titulo: 'Fondo de Cesantía y Retiro',
          detalle: 'La Ley 18.236 crea el fondo del sector. Cuando el trabajador se retira definitivamente de la industria, por cualquier causa, cobra todo lo depositado en su cuenta individual. Si fallece, lo cobran el cónyuge o los herederos.',
          fuente: { label: 'Ley N° 18.236 — texto en FOCER', url: 'https://www.focer.org.uy/v4/home/ley-n-18-236' },
        },
        {
          fecha: '2008',
          titulo: 'La jornada baja de 48 a 44 horas',
          detalle: 'El precedente directo del convenio de 2026. El sector fue el primero en bajar de la jornada legal de 48 horas por convenio colectivo, dieciocho años antes de bajar a 40.',
          fuente: { label: 'Infonegocios — la construcción se suma a la reducción de carga horaria', url: 'https://infonegocios.biz/plus/la-construccion-se-suma-a-la-reduccion-de-carga-horaria' },
        },
        {
          fecha: '15 de agosto de 2026',
          titulo: 'La jornada baja de 44 a 40 horas',
          detalle: 'Convenio a cinco años, con reducción escalonada entre 2027 y 2030, sin pérdida de salario, y ajustes anuales hasta 2030.',
          fuente: { label: 'PIT-CNT — el preacuerdo del SUNCA', url: 'https://www.pitcnt.uy/novedades/sunca-alcanzo-un-preacuerdo-historico-con-reduccion-de-la-jornada-40-horas-y-aumento-del' },
        },
      ],
    },
    aritmetica: {
      titulo: 'La aritmética de las cuatro horas',
      parrafos: [
        'Bajar de 44 a 40 horas produce dos porcentajes distintos, y en la cobertura aparecieron mezclados. El primero mide horas. El segundo mide costo por hora. No son el mismo número y no se pueden usar uno por otro.',
        'El tercer número es el que importa para el costo total, y depende de un supuesto que casi nadie explicitó. Si la obra necesita la misma cantidad de horas de trabajo, la empresa tiene que agregar 10% de horas para hacer lo mismo, y la masa salarial sube 10%. Si la productividad por hora mejora, sube menos. El presidente de la Cámara de la Construcción lo dijo con esas palabras: «la productividad de la industria no se protege exclusivamente con la hora hombre».',
      ],
      cuentas: [
        { formula: '4 ÷ 44', resultado: '−9,09%', lectura: 'Cuánto baja la jornada. Es el número que corresponde a «cuatro horas menos».' },
        { formula: '44 ÷ 40', resultado: '+10,00%', lectura: 'Cuánto sube el costo de cada hora, si el salario semanal no cambia.' },
        { formula: '+10,00% × 20,16%', resultado: '≈ +2,0%', lectura: 'Cuánto agrega al mayor contrato de obra del registro, donde el jornal con sus leyes sociales es el 20,16% del total.' },
      ],
    },
    claims: {
      titulo: 'Las cifras que circularon, y qué pasó cuando fuimos a buscarlas',
      dek: 'Estas cuatro cifras ordenaron el debate sobre el costo del convenio. Ninguna de las cuatro llega con el estudio que la respalda. Lo que sigue no dice que sean falsas: dice que, como están publicadas, no se pueden verificar.',
      items: [
        {
          cifra: '9%',
          dicho: 'Aumento inmediato del costo de la mano de obra por hora.',
          medio: 'Uruguay Al Día',
          url: 'https://uruguayaldia.com.uy/preacuerdo-de-la-jornada-laboral/',
          respaldo: 'La nota no nombra el estudio. Además, 9,09% es cuánto BAJAN las horas; el costo por hora sube 10,00%. La cifra parece ser el porcentaje equivocado de los dos.',
          estado: 'inconsistente',
        },
        {
          cifra: '10%',
          dicho: 'Aumento del costo total de obra al reducir cuatro horas manteniendo el salario.',
          medio: 'Uruguay Al Día, citando «estudios comparativos internacionales»',
          url: 'https://uruguayaldia.com.uy/preacuerdo-de-la-jornada-laboral/',
          respaldo: 'No se nombra ningún estudio. Para que el costo de obra suba 10% por un aumento del 10% en el costo horario, la mano de obra tendría que ser casi el 100% del costo. En el mayor contrato de obra del registro es el 20,16%.',
          estado: 'inconsistente',
        },
        {
          cifra: '5,5%',
          dicho: 'Aumento inmediato del precio final de venta de una vivienda.',
          medio: 'Uruguay Al Día',
          url: 'https://uruguayaldia.com.uy/preacuerdo-de-la-jornada-laboral/',
          respaldo: 'Sin estudio citado y sin método. El precio de venta de una vivienda depende del terreno, del financiamiento y de la demanda, no sólo del costo de obra.',
          estado: 'sin fuente citada',
        },
        {
          cifra: '30%',
          dicho: 'La productividad horaria de Uruguay es 30% inferior a la media de los países de la OCDE.',
          medio: 'La Mañana',
          url: 'https://www.xn--lamaana-7za.uy/actualidad/de-44-a-40-horas-en-la-construccion-el-impacto-en-los-costos-y-la-competitividad-del-sector/',
          respaldo: 'Se atribuye a la OCDE sin año ni publicación. Uruguay no es miembro de la OCDE, así que la comparación necesita explicar contra qué agregado se hace.',
          estado: 'sin fuente citada',
        },
      ],
    },
    canal: {
      titulo: 'Por dónde entra el costo laboral en el presupuesto',
      parrafos: [
        'Un convenio colectivo obliga a las empresas del sector, no al Estado. Pero el Estado es cliente de esas empresas, y sus contratos de obra no tienen precio fijo. El Pliego Único de obras públicas prevé fórmulas paramétricas con coeficientes de mano de obra y de materiales declarados en el pliego. El índice de mano de obra se construye a partir del laudo del Consejo de Salarios: cuando el laudo se mueve, el índice se mueve.',
        'Eso convierte al Estado en el que carga el riesgo del costo laboral en obra pública. Un comprador privado que ve subir el precio puede postergar la obra. Las certificaciones de avance de obra que paga el Estado absorben la variación paramétrica y siguen. La diferencia no es de tamaño: es de quién puede decir que no.',
        'El registro de compras públicas lo muestra sin necesidad de interpretar nada, porque cuatro organismos publican la adjudicación abierta por rubro. La mayor de todas es la de OSE.',
      ],
      contrato: {
        titulo: 'OSE · Licitación Pública 24711/2023',
        subtitulo: 'Proyecto Universalización del Saneamiento en el Uruguay. Adjudicado el 26 de julio de 2024 a SACEEM, CIEMSA, TEYMA URUGUAY y FAST Indústria e Comércio. 416 líneas de precio, con rubros previstos hasta 2029.',
        total: '30.266.489.897 pesos + US$ 81.031.355',
        rubros: [
          { nombre: 'Obra (rubros globales y unitarios)', monto: '22.875.003.794', pct: '75,58%', nota: '84 líneas en pesos. Otras 18 líneas, por US$ 81.031.355, están en dólares y no entran en este porcentaje.' },
          { nombre: 'Ajuste Paramétrico', monto: '3.407.843.459', pct: '11,26%', nota: '80 líneas, una por año y por grupo de rubros, de 2024 a 2029. Es el renglón por el que un cambio de costos llega al precio que paga el organismo.' },
          { nombre: 'LL SS (leyes sociales)', monto: '2.823.784.792', pct: '9,33%', nota: '151 líneas. Es el Aporte Unificado de la Ley 14.411, que se calcula como porcentaje de los jornales.' },
          { nombre: 'Imprevistos', monto: '1.159.857.852', pct: '3,83%', nota: '83 líneas, con su propio ajuste paramétrico y sus propias leyes sociales asociadas.' },
        ],
      },
      derivacion: [
        'De la línea de leyes sociales se puede volver al jornal. El Aporte Unificado es hoy 71,8% de la remuneración del personal que trabaja directamente en obra. Si esa línea de 2.824 millones es exactamente ese porcentaje, el jornal imponible del contrato es del orden de 3.933 millones de pesos: el 12,99% del lado en pesos.',
        'Jornal más leyes sociales dan 6.757 millones. Eso es el 22,32% del lado en pesos y el 20,16% del contrato completo, contando la parte en dólares. Un aumento del 10% en el costo horario, si el contrato necesita la misma cantidad de horas, agrega unos 676 millones de pesos: alrededor del 2,0% del contrato.',
        'La derivación tiene tres supuestos declarados. Primero, que toda la línea de leyes sociales corresponde al régimen del 71,8% y no incluye el aporte a la Caja de Profesionales. Segundo, que la mano de obra fuera del régimen de obra —oficina, dirección, transporte— no está en esa línea. Tercero, que el organismo presupuestó los rubros con las tasas vigentes al momento de adjudicar. Los tres empujan la estimación en la misma dirección: el jornal real puede ser algo mayor que 3.933 millones, no menor.',
      ],
    },
    escala: {
      titulo: 'De qué tamaño es la obra pública en el registro',
      parrafos: [
        'Entre 2019 y 2026 el Estado adjudicó 159.853 millones de pesos en rubros de obra del catálogo estatal —la familia 6, «Construcciones, mejoras y reparaciones extraordinarias»— en 9.874 adjudicaciones. Es una serie muy concentrada: siete contratos son el 71,56% del total.',
        'Los siete son seis obras viales y un centro de reclusión. Los seis viales son contratos de diseño, construcción, operación y financiamiento de la Dirección Nacional de Vialidad —los circuitos 3, 5 y 6 y los grupos vial oriental uno y dos y San José—, todos expresados en unidades indexadas. El séptimo es el centro de rehabilitación con tres unidades de internación en Libertad, San José, adjudicado por el Ministerio del Interior en 2024.',
        'La cara visible del ajuste paramétrico es más chica que eso, y hay que decirlo con precisión. En todo el corpus, 1.188 compras publican rubros con línea de ajuste paramétrico, y son de cuatro organismos: OSE, UTE, la Administración Nacional de Puertos y la Intendencia de Montevideo. En esas compras el ajuste paramétrico es el 8,90% del monto y las leyes sociales el 6,46%. El contrato de saneamiento de OSE pesa tres cuartas partes de ese agregado, así que el porcentaje describe sobre todo a ese contrato.',
        'Vale una última cifra, porque conecta las dos puntas de esta historia. El presidente de la Cámara de la Construcción que firmó el convenio, Alejandro Ruibal, es director de SACEEM. SACEEM tiene 48.034 millones de pesos adjudicados por el Estado en 130 compras, medido por su RUT en las dos grafías con que el registro lo escribe. Eso no describe ninguna irregularidad. Describe que quien negocia el costo laboral del sector es, además, uno de los mayores contratistas del Estado.',
      ],
      contratos: [
        { nombre: 'Circuito 3 · Ruta 14 centro-oeste, by pass Sarandí del Yí y conexión con la Ruta 3', organismo: 'Dirección Nacional de Vialidad', ano: '2020', monto: '25.921' },
        { nombre: 'Circuito 5 · tramos de las rutas 14 y 15', organismo: 'Dirección Nacional de Vialidad', ano: '2023', monto: '18.958' },
        { nombre: 'Grupo Vial Oriental uno', organismo: 'Dirección Nacional de Vialidad', ano: '2021', monto: '18.246' },
        { nombre: 'Grupo Vial Oriental dos', organismo: 'Dirección Nacional de Vialidad', ano: '2022', monto: '17.056' },
        { nombre: 'Centro de rehabilitación con tres unidades de internación, Libertad', organismo: 'Ministerio del Interior', ano: '2024', monto: '12.231' },
        { nombre: 'Circuito 6 · Cuchilla Grande', organismo: 'Dirección Nacional de Vialidad', ano: '2023', monto: '11.612' },
        { nombre: 'Grupo San José', organismo: 'Dirección Nacional de Vialidad', ano: '2022', monto: '10.369' },
      ],
    },
    limites: {
      titulo: 'Lo que esta medición no puede decir',
      puntos: [
        'El registro de compras públicas no tiene salarios. No podemos medir cuánto gana un trabajador de la construcción, ni cuánto cambia con el convenio. Todo lo salarial de esta pieza viene de prensa y de normas, no del corpus.',
        'El ajuste paramétrico sólo se ve donde el organismo publica la adjudicación abierta por rubro. Son cuatro: OSE, UTE, Puertos y la Intendencia de Montevideo. La Dirección Nacional de Vialidad, que es el mayor comprador de obra del registro, no publica sus contratos con ese desglose. La fórmula existe igual —está en el Pliego Único—, pero no se puede medir desde afuera.',
        'La estimación del jornal a partir de las leyes sociales es una derivación, no un dato publicado. Los tres supuestos están declarados arriba. Si alguno no se cumple, el porcentaje de mano de obra cambia, aunque no lo suficiente como para acercarse al 100% que exigiría la cifra del 10% que circuló.',
        'Una parte importante de la obra pública uruguaya no pasa por este registro. Los contratos de participación público-privada, los fideicomisos viales y las obras que financia la Corporación Vial del Uruguay tienen sus propios circuitos. Los siete contratos grandes que sí aparecen acá son la parte que el portal de compras publicó, no el universo.',
        'No medimos el efecto del convenio sobre el empleo, ni sobre la informalidad del sector, ni sobre el precio de la vivienda. Son preguntas legítimas y no se responden con este corpus. Cualquiera que las responda con una cifra debería decir de qué serie salió.',
        'El convenio empieza a bajar horas el 30 de agosto de 2027. Todo lo que se diga hoy sobre su efecto es una proyección. Esta pieza mide el canal y su tamaño, no el resultado.',
      ],
    },
    fuentes: [
      { label: 'Subrayado — el presidente del SUNCA anuncia el acuerdo (4/8/2026)', url: 'https://www.subrayado.com.uy/presidente-del-sunca-anuncio-un-acuerdo-las-empresas-reducir-la-jornada-laboral-perdida-salario-n1014389' },
      { label: 'PIT-CNT — preacuerdo con reducción a 40 horas y aumento del salario real', url: 'https://www.pitcnt.uy/novedades/sunca-alcanzo-un-preacuerdo-historico-con-reduccion-de-la-jornada-40-horas-y-aumento-del' },
      { label: 'Punta News — las cláusulas y las fechas exactas de cada escalón', url: 'https://www.puntanews.com.uy/preacuerdo-sunca-clausulas-fijan' },
      { label: 'la diaria — la asamblea del SUNCA aprueba el preacuerdo (13/8/2026)', url: 'https://ladiaria.com.uy/trabajo/articulo/2026/8/asamblea-del-sunca-aprobo-preacuerdo-con-empresarios-por-el-convenio-colectivo/' },
      { label: 'Teledoce — el preacuerdo, desde la cobertura del anuncio', url: 'https://www.teledoce.com/telemundo/nacionales/historico-sunca-y-camaras-empresariales-alcanzaron-preacuerdo-de-convenio-colectivo-que-incluye-reducir-las-horas-de-trabajo/' },
      { label: 'VTV — Alejandro Ruibal sobre productividad y hora hombre', url: 'https://noticias.vtv.com.uy/alejandro-ruibal-la-productividad-de-la-industria-no-se-protege-exclusivamente-con-la-hora-hombre/' },
      { label: 'VTV — el ministro de Trabajo califica el acuerdo de histórico', url: 'https://noticias.vtv.com.uy/castillo-destaco-como-historico-el-acuerdo-entre-trabajadores-y-empresarios-de-la-construccion/' },
      { label: 'El Observador — el SUNCA rechaza la pauta salarial y exige blindar beneficios', url: 'https://www.elobservador.com.uy/economia-y-empresas/construccion-sunca-rechaza-pauta-salarial-del-gobierno-y-exige-blindar-beneficios-historicos-n6043656' },
      { label: 'Uruguay Al Día — las cifras de costo y el traslado al erario público', url: 'https://uruguayaldia.com.uy/alejandro-ruibal-saceem-preacuerdo-40-horas/' },
      { label: 'La Mañana — impacto en costos y competitividad del sector', url: 'https://www.xn--lamaana-7za.uy/actualidad/de-44-a-40-horas-en-la-construccion-el-impacto-en-los-costos-y-la-competitividad-del-sector/' },
      { label: 'INE — metodología del Índice de Costo de la Construcción de Vivienda', url: 'https://www5.ine.gub.uy/documents/Estad%C3%ADsticasecon%C3%B3micas/PDF/ICC/Metodolog%C3%ADa_ICCV_junio2023.pdf' },
      { label: 'BPS — Régimen Construcción: tasas del Aporte Unificado', url: 'https://www.bps.gub.uy/837/regimen-construccion.html' },
      { label: 'BPS — Ley N° 14.411, aporte unificado de la construcción', url: 'https://www.bps.gub.uy/3569/' },
      { label: 'FOCER — Ley N° 18.236, Fondo de Cesantía y Retiro', url: 'https://www.focer.org.uy/v4/home/ley-n-18-236' },
      { label: 'GPA — acta de ajuste salarial del Grupo 9, subgrupo 01', url: 'https://www.gpa.uy/posts/informes/9107-grupo-09-01-industria-de-la-construccion-acta-al-01-04-25/' },
    ],
  },
  en: {
    kicker: 'Construction collective agreement',
    titulo: 'Four hours less: what construction won, and where the bill lands',
    bajada: 'On 15 August 2026 SUNCA and the employer chambers signed a five-year agreement cutting the working week from 44 to 40 hours with no pay cut. The public argument filled up with unsourced percentages. We went after the one stretch that the public procurement record can actually measure: the channel through which construction labour costs reach the state budget.',
    alcance: 'Group 9 agreement · public works categories of the state catalogue',
    periodo: '1958 – 2031',
    origen: 'Public procurement record (OCDS), cross-checked Uruguayan press and the cited laws',
    portada: {
      cifras: [
        { valor: '−9.09%', etiqueta: 'fewer hours per week — not −10%: the week goes from 44 to 40', sub: 'At constant weekly pay, hourly cost rises +10.00%. Two different numbers, and several outlets published them as if they were one.' },
        { valor: '20.59%', etiqueta: 'of the peso side of the largest works contract on record is parametric adjustment plus social contributions', sub: 'OSE, Public Tender 24711/2023. Not an estimate: two named price lines in the published award.' },
        { valor: '159,853 million', etiqueta: 'pesos awarded by the state in works categories between 2019 and 2026', sub: '9,874 awards. Seven contracts are 71.56% of it: six road schemes and one prison complex.' },
        { valor: '4 of 4', etiqueta: 'cost figures that circulated in the press cite no study', sub: 'The 9% labour cost, the 10% works cost, the 5.5% sale price and the 30% productivity gap. No article names the source.' },
      ],
      parrafos: [
        'On 4 August 2026 SUNCA and the construction employer chambers announced a pre-agreement. The union assembly approved it on 13 August and it was signed on the 15th at the National Labour Directorate. The agreement runs from April 2026 to March 2031. It cuts the week from 44 to 40 hours in four steps between 2027 and 2030, with no pay cut.',
        'From there the argument moved to costs, and that is where it broke down. The percentages that circulated — 9% higher hourly labour cost, 10% higher works cost, 5.5% higher house sale price — are attributed to "international comparative studies" that no outlet names. We went looking for them and they are not there.',
        'This site cannot measure wages: the procurement record does not hold them. It can measure one thing nobody measured, and it is specific to the state. When the state contracts works, the price is not fixed. The standard public works conditions provide for parametric formulas, and the labour index feeding them is built from the wage council rate. So the agreement signed by the union and the chambers reprices, by design, what the taxpayer pays.',
        'The size of that channel shows up in the price lines. In the largest works contract on record — the OSE sanitation scheme awarded in 2024 to SACEEM, CIEMSA, TEYMA and a Brazilian firm — the award publishes 416 price lines. Among them are 80 lines called "Ajuste Paramétrico" worth 3,408 million pesos and 151 lines called "LL SS" — social contributions — worth 2,824 million. Together they are 20.59% of the peso side, and the contract has lines budgeted through 2029.',
        'That is enough for a calculation the debate never made. If labour plus its social contributions is 20.16% of that contract, a 10% rise in hourly cost adds about 2% to the contract, not the 10% that was published. For a works contract to rise 10% through this channel, labour would have to be nearly the whole cost. It is not, in any contract we could open.',
      ],
      ficha: {
        titulo: 'The agreement in eleven lines',
        filas: [
          { k: 'Scope', v: 'Group 9, subgroup 01 — construction industry and complementary activities' },
          { k: 'Parties', v: 'SUNCA and the construction employer chambers' },
          { k: 'Pre-agreement', v: '4 August 2026' },
          { k: 'Assembly', v: '13 August 2026, approved' },
          { k: 'Signed', v: '15 August 2026, National Labour Directorate' },
          { k: 'Term', v: 'April 2026 to March 2031' },
          { k: 'Week', v: 'From 44 to 40 hours, between 2027 and 2030' },
          { k: 'Pay', v: 'No cut. 5.17% rise backdated to April 2026' },
          { k: 'Rises', v: 'Annual each April through 2030, with inflation correctives' },
          { k: 'Dispute before it', v: 'More than 120 days. The union counted 126' },
          { k: 'Hours start falling', v: '30 August 2027' },
        ],
      },
    },
    acuerdo: {
      titulo: 'What was agreed, exactly',
      parrafos: [
        'The agreement covers Group 9, subgroup 01, "Construction industry and complementary activities". It runs five years, April 2026 to March 2031. It is the first agreement in the sector of that length, and both sides called it historic for that before they called it historic for the hours.',
        'The week falls by one hour a year in four steps. The cut does not touch pay. Firms may apply it two ways: one hour less Monday to Thursday, or up to four hours less on Friday. The chambers asked for that flexibility and it is in the text.',
        'The agreement includes a 5.17% pay rise backdated to April 2026 and annual rises each April through 2030, with inflation correctives. It guarantees real wage growth across the period. It also adds reinstatement of workers on unemployment insurance, 8 million pesos to reimburse preventive medical checks for workers over 40, one paid hour per half-year for mental health activities, double the work clothing deliveries from April 2028 and a 120-day deadline to agree a heat protocol.',
        'The dispute before it lasted more than 120 days. Union general secretary Javier Díaz counted 126 days of struggle. Labour minister Juan Castillo and construction chamber president Alejandro Ruibal both used the word "historic".',
      ],
      cronograma: [
        { fecha: '30 August 2027', horas: '43 hours', nota: 'First step. Until then the current 44 hours apply.' },
        { fecha: '1 May 2028', horas: '42 hours', nota: 'Second step.' },
        { fecha: '1 May 2029', horas: '41 hours', nota: 'Third step.' },
        { fecha: '28 January 2030', horas: '40 hours', nota: 'Final step, a year before the agreement expires.' },
      ],
    },
    hitos: {
      titulo: 'The earlier wins, with the law behind each',
      dek: 'The union calls what it won over 68 years "conquistas". The list below only includes those with a law or a verifiable fact behind them. Those without one are left out, even where the union claims them.',
      items: [
        {
          fecha: '11 May 1958',
          titulo: 'SUNCA is founded',
          detalle: 'First national congress of the single construction union. The union later takes part in founding the National Workers Convention.',
          fuente: { label: 'SUNCA — Wikipedia', url: 'https://es.wikipedia.org/wiki/Sindicato_%C3%9Anico_Nacional_de_la_Construcci%C3%B3n_y_Anexos' },
        },
        {
          fecha: '7 August 1975',
          titulo: 'Unified construction contribution',
          detalle: 'Law 14,411 creates a contribution regime specific to the sector. A single percentage on wages covers pensions, health and payroll charges. The party liable is the property owner, not the contractor. The rate today is 71.8%, rising to 75.8% with the professionals fund levy.',
          fuente: { label: 'BPS — construction regime, current rates', url: 'https://www.bps.gub.uy/837/regimen-construccion.html' },
        },
        {
          fecha: '26 December 2007',
          titulo: 'Severance and retirement fund',
          detalle: 'Law 18,236 creates the sector fund. When a worker leaves the industry for good, for any reason, they collect everything held in their individual account. On death it goes to the spouse or heirs.',
          fuente: { label: 'Law 18,236 — text at FOCER', url: 'https://www.focer.org.uy/v4/home/ley-n-18-236' },
        },
        {
          fecha: '2008',
          titulo: 'The week falls from 48 to 44 hours',
          detalle: 'The direct precedent for the 2026 agreement. The sector was the first to go below the 48-hour legal week by collective agreement, eighteen years before going to 40.',
          fuente: { label: 'Infonegocios — construction joins the hours reduction', url: 'https://infonegocios.biz/plus/la-construccion-se-suma-a-la-reduccion-de-carga-horaria' },
        },
        {
          fecha: '15 August 2026',
          titulo: 'The week falls from 44 to 40 hours',
          detalle: 'Five-year agreement, stepped reduction between 2027 and 2030, no pay loss, annual rises through 2030.',
          fuente: { label: 'PIT-CNT — the SUNCA pre-agreement', url: 'https://www.pitcnt.uy/novedades/sunca-alcanzo-un-preacuerdo-historico-con-reduccion-de-la-jornada-40-horas-y-aumento-del' },
        },
      ],
    },
    aritmetica: {
      titulo: 'The arithmetic of four hours',
      parrafos: [
        'Going from 44 to 40 hours produces two different percentages, and the coverage mixed them. The first measures hours. The second measures cost per hour. They are not the same number and cannot stand in for each other.',
        'The third number is the one that matters for total cost, and it rests on an assumption almost nobody stated. If the job needs the same number of working hours, the firm must add 10% more hours to do the same work, and the wage bill rises 10%. If output per hour improves, it rises less. The construction chamber president put it in those terms: "the industry\'s productivity is not protected by the man-hour alone".',
      ],
      cuentas: [
        { formula: '4 ÷ 44', resultado: '−9.09%', lectura: 'How much the week falls. This is the number that matches "four hours less".' },
        { formula: '44 ÷ 40', resultado: '+10.00%', lectura: 'How much each hour costs more, if weekly pay does not change.' },
        { formula: '+10.00% × 20.16%', resultado: '≈ +2.0%', lectura: 'How much it adds to the largest works contract on record, where wages plus social contributions are 20.16% of the total.' },
      ],
    },
    claims: {
      titulo: 'The figures that circulated, and what happened when we went after them',
      dek: 'These four figures framed the argument about the cost of the agreement. None of the four arrives with the study behind it. What follows does not say they are false: it says that, as published, they cannot be verified.',
      items: [
        {
          cifra: '9%',
          dicho: 'Immediate rise in hourly labour cost.',
          medio: 'Uruguay Al Día',
          url: 'https://uruguayaldia.com.uy/preacuerdo-de-la-jornada-laboral/',
          respaldo: 'The article names no study. Also, 9.09% is how much hours FALL; hourly cost rises 10.00%. The figure looks like the wrong one of the two.',
          estado: 'inconsistente',
        },
        {
          cifra: '10%',
          dicho: 'Rise in total works cost from cutting four hours at constant pay.',
          medio: 'Uruguay Al Día, citing "international comparative studies"',
          url: 'https://uruguayaldia.com.uy/preacuerdo-de-la-jornada-laboral/',
          respaldo: 'No study is named. For works cost to rise 10% off a 10% rise in hourly cost, labour would have to be nearly 100% of cost. In the largest works contract on record it is 20.16%.',
          estado: 'inconsistente',
        },
        {
          cifra: '5.5%',
          dicho: 'Immediate rise in the final sale price of a home.',
          medio: 'Uruguay Al Día',
          url: 'https://uruguayaldia.com.uy/preacuerdo-de-la-jornada-laboral/',
          respaldo: 'No study cited and no method. A home sale price depends on land, financing and demand, not only on works cost.',
          estado: 'sin fuente citada',
        },
        {
          cifra: '30%',
          dicho: 'Uruguayan hourly productivity is 30% below the OECD member average.',
          medio: 'La Mañana',
          url: 'https://www.xn--lamaana-7za.uy/actualidad/de-44-a-40-horas-en-la-construccion-el-impacto-en-los-costos-y-la-competitividad-del-sector/',
          respaldo: 'Attributed to the OECD with no year and no publication. Uruguay is not an OECD member, so the comparison needs to say which aggregate it is against.',
          estado: 'sin fuente citada',
        },
      ],
    },
    canal: {
      titulo: 'Where labour cost enters the budget',
      parrafos: [
        'A collective agreement binds the firms in the sector, not the state. But the state is a client of those firms, and its works contracts are not fixed-price. The standard public works conditions provide for parametric formulas with labour and materials coefficients declared in the tender documents. The labour index is built from the wage council rate: when the rate moves, the index moves.',
        'That makes the state the party carrying labour cost risk on public works. A private buyer facing a rising price can postpone the job. The progress certificates the state pays absorb the parametric variation and carry on. The difference is not one of size: it is who gets to say no.',
        'The procurement record shows this without any interpretation, because four bodies publish the award broken out by price line. The largest of them is OSE.',
      ],
      contrato: {
        titulo: 'OSE · Public Tender 24711/2023',
        subtitulo: 'Universal Sanitation Project for Uruguay. Awarded 26 July 2024 to SACEEM, CIEMSA, TEYMA URUGUAY and FAST Indústria e Comércio. 416 price lines, with items budgeted through 2029.',
        total: '30,266,489,897 pesos + US$ 81,031,355',
        rubros: [
          { nombre: 'Works (global and unit items)', monto: '22,875,003,794', pct: '75.58%', nota: '84 peso lines. Another 18 lines, worth US$ 81,031,355, are in dollars and are outside this percentage.' },
          { nombre: 'Parametric adjustment', monto: '3,407,843,459', pct: '11.26%', nota: '80 lines, one per year and item group, 2024 to 2029. This is the line through which a cost change reaches the price the body pays.' },
          { nombre: 'Social contributions (LL SS)', monto: '2,823,784,792', pct: '9.33%', nota: '151 lines. This is the Law 14,411 unified contribution, charged as a percentage of wages.' },
          { nombre: 'Contingencies', monto: '1,159,857,852', pct: '3.83%', nota: '83 lines, each with its own parametric adjustment and its own associated social contributions.' },
        ],
      },
      derivacion: [
        'The social contributions line lets you work back to the wage bill. The unified contribution is now 71.8% of pay for staff working directly on site. If that 2,824 million line is exactly that percentage, the contract\'s contributable wage bill is on the order of 3,933 million pesos: 12.99% of the peso side.',
        'Wages plus social contributions come to 6,757 million. That is 22.32% of the peso side and 20.16% of the whole contract, counting the dollar portion. A 10% rise in hourly cost, if the contract needs the same number of hours, adds about 676 million pesos: around 2.0% of the contract.',
        'The derivation carries three stated assumptions. First, that the whole social contributions line sits under the 71.8% regime and excludes the professionals fund levy. Second, that labour outside the on-site regime — office, management, transport — is not in that line. Third, that the body budgeted the items at the rates in force when it awarded. All three push the estimate the same way: the real wage bill may be somewhat above 3,933 million, not below.',
      ],
    },
    escala: {
      titulo: 'How big public works are in the record',
      parrafos: [
        'Between 2019 and 2026 the state awarded 159,853 million pesos in works categories of the state catalogue — family 6, "Construction, improvements and extraordinary repairs" — across 9,874 awards. The series is highly concentrated: seven contracts are 71.56% of the total.',
        'The seven are six road schemes and one prison complex. The six road schemes are design, build, operate and finance contracts from the National Roads Directorate — circuits 3, 5 and 6, the two Grupo Vial Oriental contracts and San José — all denominated in indexed units. The seventh is the rehabilitation centre with three detention units at Libertad, San José, awarded by the Interior Ministry in 2024.',
        'The visible face of parametric adjustment is smaller than that, and it has to be said precisely. Across the whole corpus, 1,188 purchases publish items with a parametric adjustment line, and they come from four bodies: OSE, UTE, the National Ports Administration and the Montevideo city government. In those purchases parametric adjustment is 8.90% of the amount and social contributions 6.46%. The OSE sanitation contract is three quarters of that aggregate, so the percentage mostly describes that one contract.',
        'One last figure, because it links both ends of this story. The construction chamber president who signed the agreement, Alejandro Ruibal, is a director of SACEEM. SACEEM holds 48,034 million pesos awarded by the state across 130 purchases, measured by its tax ID in both spellings the record uses. That describes no irregularity. It describes that the person negotiating the sector\'s labour cost is also one of the state\'s largest contractors.',
      ],
      contratos: [
        { nombre: 'Circuit 3 · Route 14 centre-west, Sarandí del Yí bypass and the link to Route 3', organismo: 'National Roads Directorate', ano: '2020', monto: '25,921' },
        { nombre: 'Circuit 5 · sections of routes 14 and 15', organismo: 'National Roads Directorate', ano: '2023', monto: '18,958' },
        { nombre: 'Grupo Vial Oriental one', organismo: 'National Roads Directorate', ano: '2021', monto: '18,246' },
        { nombre: 'Grupo Vial Oriental two', organismo: 'National Roads Directorate', ano: '2022', monto: '17,056' },
        { nombre: 'Rehabilitation centre with three detention units, Libertad', organismo: 'Interior Ministry', ano: '2024', monto: '12,231' },
        { nombre: 'Circuit 6 · Cuchilla Grande', organismo: 'National Roads Directorate', ano: '2023', monto: '11,612' },
        { nombre: 'Grupo San José', organismo: 'National Roads Directorate', ano: '2022', monto: '10,369' },
      ],
    },
    limites: {
      titulo: 'What this measurement cannot say',
      puntos: [
        'The procurement record holds no wages. We cannot measure what a construction worker earns, or how the agreement changes it. Everything about pay here comes from the press and from law, not from the corpus.',
        'Parametric adjustment is only visible where the body publishes the award broken out by price line. Four do: OSE, UTE, Ports and the Montevideo city government. The National Roads Directorate, the largest works buyer on record, does not publish its contracts with that breakdown. The formula exists all the same — it is in the standard conditions — but it cannot be measured from outside.',
        'Estimating the wage bill from the social contributions line is a derivation, not a published figure. The three assumptions are stated above. If one fails the labour share moves, though not nearly enough to approach the 100% that the circulated 10% figure would require.',
        'A large part of Uruguayan public works never passes through this record. Public-private partnership contracts, road trusts and works financed by Corporación Vial del Uruguay run on their own circuits. The seven large contracts that do appear here are what the procurement portal published, not the universe.',
        'We do not measure the agreement\'s effect on employment, on informality in the sector, or on house prices. Those are legitimate questions and this corpus does not answer them. Anyone answering them with a figure should say which series it came from.',
        'The agreement starts cutting hours on 30 August 2027. Everything said today about its effect is a projection. This piece measures the channel and its size, not the outcome.',
      ],
    },
    fuentes: [
      { label: 'Subrayado — the SUNCA president announces the agreement (4/8/2026)', url: 'https://www.subrayado.com.uy/presidente-del-sunca-anuncio-un-acuerdo-las-empresas-reducir-la-jornada-laboral-perdida-salario-n1014389' },
      { label: 'PIT-CNT — pre-agreement with a cut to 40 hours and real wage growth', url: 'https://www.pitcnt.uy/novedades/sunca-alcanzo-un-preacuerdo-historico-con-reduccion-de-la-jornada-40-horas-y-aumento-del' },
      { label: 'Punta News — the clauses and the exact date of each step', url: 'https://www.puntanews.com.uy/preacuerdo-sunca-clausulas-fijan' },
      { label: 'la diaria — the SUNCA assembly approves the pre-agreement (13/8/2026)', url: 'https://ladiaria.com.uy/trabajo/articulo/2026/8/asamblea-del-sunca-aprobo-preacuerdo-con-empresarios-por-el-convenio-colectivo/' },
      { label: 'Teledoce — the pre-agreement, from the announcement coverage', url: 'https://www.teledoce.com/telemundo/nacionales/historico-sunca-y-camaras-empresariales-alcanzaron-preacuerdo-de-convenio-colectivo-que-incluye-reducir-las-horas-de-trabajo/' },
      { label: 'VTV — Alejandro Ruibal on productivity and the man-hour', url: 'https://noticias.vtv.com.uy/alejandro-ruibal-la-productividad-de-la-industria-no-se-protege-exclusivamente-con-la-hora-hombre/' },
      { label: 'VTV — the labour minister calls the agreement historic', url: 'https://noticias.vtv.com.uy/castillo-destaco-como-historico-el-acuerdo-entre-trabajadores-y-empresarios-de-la-construccion/' },
      { label: 'El Observador — SUNCA rejects the wage guideline and demands its benefits be locked in', url: 'https://www.elobservador.com.uy/economia-y-empresas/construccion-sunca-rechaza-pauta-salarial-del-gobierno-y-exige-blindar-beneficios-historicos-n6043656' },
      { label: 'Uruguay Al Día — the cost figures and the transfer to the public purse', url: 'https://uruguayaldia.com.uy/alejandro-ruibal-saceem-preacuerdo-40-horas/' },
      { label: 'La Mañana — impact on the sector\'s costs and competitiveness', url: 'https://www.xn--lamaana-7za.uy/actualidad/de-44-a-40-horas-en-la-construccion-el-impacto-en-los-costos-y-la-competitividad-del-sector/' },
      { label: 'INE — methodology of the housing construction cost index', url: 'https://www5.ine.gub.uy/documents/Estad%C3%ADsticasecon%C3%B3micas/PDF/ICC/Metodolog%C3%ADa_ICCV_junio2023.pdf' },
      { label: 'BPS — construction regime: unified contribution rates', url: 'https://www.bps.gub.uy/837/regimen-construccion.html' },
      { label: 'BPS — Law 14,411, unified construction contribution', url: 'https://www.bps.gub.uy/3569/' },
      { label: 'FOCER — Law 18,236, severance and retirement fund', url: 'https://www.focer.org.uy/v4/home/ley-n-18-236' },
      { label: 'GPA — Group 9 subgroup 01 wage adjustment record', url: 'https://www.gpa.uy/posts/informes/9107-grupo-09-01-industria-de-la-construccion-acta-al-01-04-25/' },
    ],
  },
}

export function suncaContent(locale: string): SuncaContent {
  return CONTENT[locale === 'en' ? 'en' : 'es']
}
