// The long-form text of the privacy policy, terms and cookie policy.
//
// It lives here rather than in the i18n JSON for two reasons: the volume would
// dwarf every other locale block, and legal prose is edited as prose — as whole
// paragraphs a human reads top to bottom — not as scattered keys. Keeping the
// two languages side by side in one typed module is the way to keep them from
// drifting apart. Page chrome (nav labels, buttons) still goes through t().
//
// Every factual claim here must match what the code actually does. If you change
// what is stored or measured, change it here in the same commit — a privacy
// policy that overstates is worse than none.

export type Locale = 'es' | 'en'

/** A run of body paragraphs under a heading. */
export interface LegalSection {
  heading: string
  /** Paragraphs. A leading "- " marks a bullet; everything else is a <p>. */
  body: string[]
}

export interface LegalDoc {
  title: string
  updated: string
  intro: string[]
  sections: LegalSection[]
}

export interface CookieRow {
  name: string
  purpose: string
  duration: string
  /** 'necessary' = functional, always on; 'measure' = analytics, consent-gated. */
  kind: 'necessary' | 'measure'
}

const UPDATED = { es: '19 de julio de 2026', en: 'July 19, 2026' }
const CONTACT = 'shellixs750@gmail.com'

// ── The real client-side storage inventory ─────────────────────────────────
// Keep in sync with the codebase. Verified keys, do not pad the list:
//   cltc-theme            layouts/default.vue
//   cltc-tour:v1 / -seen  composables/useTour.ts
//   gg.audience           composables/useAudience.ts
//   gg:pendingVote        components/AnomalyFeedback.vue
//   monitor:magicEmail    composables/useAuth.ts
//   cltc-consent          composables/useConsent.ts
//   session cookie        httpOnly, set by the server on login
//   _ga / _ga_*           Google Analytics, only after consent is granted
const COOKIE_ROWS: Record<Locale, CookieRow[]> = {
  es: [
    { name: 'cltc-consent', purpose: 'Recuerda si aceptaste o rechazaste la medición.', duration: 'Permanente (hasta que la borres)', kind: 'necessary' },
    { name: 'Cookie de sesión', purpose: 'Te mantiene con la sesión iniciada. Es httpOnly y no es accesible por JavaScript.', duration: 'La sesión', kind: 'necessary' },
    { name: 'cltc-theme', purpose: 'Recuerda si elegiste tema claro u oscuro.', duration: 'Permanente', kind: 'necessary' },
    { name: 'cltc-tour:v1 / cltc-tour-seen', purpose: 'Recuerda el progreso del tour guiado para no repetírtelo.', duration: 'Permanente', kind: 'necessary' },
    { name: 'gg.audience', purpose: 'Recuerda si te interesa la mirada de ciudadano o de empresa.', duration: 'Permanente', kind: 'necessary' },
    { name: 'gg:pendingVote', purpose: 'Guarda un voto sobre una anomalía mientras iniciás sesión, para no perderlo.', duration: 'Temporal', kind: 'necessary' },
    { name: 'monitor:magicEmail', purpose: 'Guarda tu correo mientras completás el ingreso por enlace mágico.', duration: 'Temporal', kind: 'necessary' },
    { name: '_ga, _ga_*', purpose: 'Google Analytics: distingue visitantes para medir el uso del sitio. Solo se escriben si aceptás.', duration: 'Hasta 2 años', kind: 'measure' },
  ],
  en: [
    { name: 'cltc-consent', purpose: 'Remembers whether you accepted or rejected measurement.', duration: 'Persistent (until you clear it)', kind: 'necessary' },
    { name: 'Session cookie', purpose: 'Keeps you signed in. It is httpOnly and not readable by JavaScript.', duration: 'The session', kind: 'necessary' },
    { name: 'cltc-theme', purpose: 'Remembers whether you chose the light or dark theme.', duration: 'Persistent', kind: 'necessary' },
    { name: 'cltc-tour:v1 / cltc-tour-seen', purpose: 'Remembers your progress through the guided tour so it is not repeated.', duration: 'Persistent', kind: 'necessary' },
    { name: 'gg.audience', purpose: 'Remembers whether you prefer the citizen or the supplier view.', duration: 'Persistent', kind: 'necessary' },
    { name: 'gg:pendingVote', purpose: 'Holds a vote on an anomaly while you sign in, so it is not lost.', duration: 'Temporary', kind: 'necessary' },
    { name: 'monitor:magicEmail', purpose: 'Holds your email while you complete a magic-link sign-in.', duration: 'Temporary', kind: 'necessary' },
    { name: '_ga, _ga_*', purpose: 'Google Analytics: distinguishes visitors to measure site usage. Written only if you accept.', duration: 'Up to 2 years', kind: 'measure' },
  ],
}

// ── Privacy ────────────────────────────────────────────────────────────────
const PRIVACY: Record<Locale, LegalDoc> = {
  es: {
    title: 'Política de privacidad',
    updated: UPDATED.es,
    intro: [
      'Este sitio es un proyecto personal e independiente, sin fines comerciales, que hace buscables los datos abiertos de compras del Estado uruguayo. Esta política explica qué datos tratamos, por qué, con quién y qué derechos tenés. Está redactada según la Ley N.º 18.331 de Protección de Datos Personales del Uruguay y su decreto reglamentario.',
      `Responsable del tratamiento: Eduardo Airaudo. Contacto: ${CONTACT}.`,
    ],
    sections: [
      {
        heading: 'Qué datos tratamos',
        body: [
          'Si solo navegás, sin crear una cuenta: no te pedimos ningún dato. Solo medimos, de forma agregada y con tu consentimiento, qué páginas se usan (ver la sección de analítica).',
          'Si creás una cuenta, tratamos lo mínimo para que el servicio funcione:',
          '- Tu correo electrónico y un identificador de usuario de Firebase (el sistema de autenticación de Google que usamos).',
          '- Tus preferencias de notificación, las alertas que guardás, los llamados que seguís y los recordatorios que fijás.',
          '- Si las activás: tus suscripciones a notificaciones push y la vinculación con Telegram.',
          '- Si sos desarrollador: tus claves de API y tus webhooks.',
          'No pedimos ni almacenamos tarjetas de crédito ni datos de pago: el sitio es gratuito.',
        ],
      },
      {
        heading: 'Con qué base legal y para qué',
        body: [
          'Tratamos tus datos para prestarte el servicio que pediste (ejecución de la relación cuando creás una cuenta o una alerta), y para medir el uso del sitio sobre la base de tu consentimiento, que podés retirar cuando quieras.',
          'No vendemos tus datos. No los usamos para publicidad ni para perfilar tu comportamiento fuera de este sitio.',
        ],
      },
      {
        heading: 'Con quién los compartimos',
        body: [
          'Google (Firebase Authentication) procesa tu correo y tu contraseña para autenticarte, y Google Analytics procesa la medición de uso. Esto implica una transferencia internacional de datos a servidores de Google en Estados Unidos.',
          'Nuestro proveedor de correo transaccional envía los avisos de alertas y los correos de tu cuenta.',
          'Telegram recibe datos únicamente si vos vinculás tu cuenta con nuestro bot, y solo para poder enviarte los avisos por ese canal.',
          'El resto de tus datos se guarda en nuestra propia base de datos. No los cedemos a terceros salvo obligación legal.',
        ],
      },
      {
        heading: 'Analítica y qué mandamos a Google',
        body: [
          'Usamos Google Analytics 4 (identificador de medición G-E3V3E1LLC0) para saber qué páginas resultan útiles. Funciona con el Modo de Consentimiento (Consent Mode v2): hasta que decidís, Analytics no escribe ninguna cookie y solo envía mediciones sin identificadores; si rechazás, el script de Google no se carga en absoluto.',
          'Cuando tenés una cuenta y aceptaste la medición, enviamos a Analytics un hash SHA-256 de tu identificador de usuario, nunca el identificador en claro ni tu correo. Sirve para no contar dos veces a la misma persona entre dispositivos, sin entregarle a Google un dato que te identifique.',
          'También pedimos a Google que anonimice tu dirección IP.',
        ],
      },
      {
        heading: 'Cuánto tiempo los conservamos',
        body: [
          'Conservamos los datos de tu cuenta mientras la mantengas abierta. Si la borrás, eliminamos tus datos personales asociados; algunos registros técnicos pueden persistir el tiempo mínimo necesario. Los datos de Analytics se conservan según la configuración de retención de Google Analytics.',
        ],
      },
      {
        heading: 'Tus derechos',
        body: [
          'Tenés derecho a acceder a tus datos, rectificarlos, suprimirlos y a oponerte a su tratamiento o a retirar tu consentimiento. Para ejercerlos, escribinos a ' + CONTACT + '. Respondemos en los plazos que fija la ley.',
          'La autoridad de control en Uruguay es la Unidad Reguladora y de Control de Datos Personales (URCDP). Si considerás que no atendimos tu reclamo, podés dirigirte a ella.',
        ],
      },
      {
        heading: 'Correos y cómo darte de baja',
        body: [
          'Cada correo de alertas incluye un enlace para darte de baja, y podés gestionar tus canales y frecuencia desde tu cuenta. La baja no borra tu cuenta; solo detiene los envíos.',
        ],
      },
      {
        heading: 'Menores y cambios',
        body: [
          'El servicio no está dirigido a menores de edad y no recolectamos deliberadamente sus datos.',
          'Podemos actualizar esta política. Cuando el cambio sea importante, lo indicaremos aquí y actualizaremos la fecha de arriba.',
        ],
      },
    ],
  },
  en: {
    title: 'Privacy policy',
    updated: UPDATED.en,
    intro: [
      'This site is a personal, independent, non-commercial project that makes Uruguay’s open government-procurement data searchable. This policy explains what data we process, why, with whom, and what rights you have. It is written under Uruguay’s Personal Data Protection Act (Law No. 18.331) and its implementing decree.',
      `Data controller: Eduardo Airaudo. Contact: ${CONTACT}.`,
    ],
    sections: [
      {
        heading: 'What data we process',
        body: [
          'If you only browse, without creating an account: we ask for nothing. We only measure, in aggregate and with your consent, which pages get used (see the analytics section).',
          'If you create an account, we process the minimum needed for the service to work:',
          '- Your email address and a Firebase user identifier (Google’s authentication system, which we use).',
          '- Your notification preferences, the alerts you save, the calls you follow and the reminders you set.',
          '- If you enable them: your push-notification subscriptions and your Telegram link.',
          '- If you are a developer: your API keys and webhooks.',
          'We do not ask for or store credit cards or payment data: the site is free.',
        ],
      },
      {
        heading: 'On what legal basis and for what',
        body: [
          'We process your data to provide the service you asked for (performing the relationship when you create an account or an alert), and to measure site usage on the basis of your consent, which you can withdraw at any time.',
          'We do not sell your data. We do not use it for advertising or to profile your behaviour off this site.',
        ],
      },
      {
        heading: 'Who we share it with',
        body: [
          'Google (Firebase Authentication) processes your email and password to sign you in, and Google Analytics processes usage measurement. This involves an international transfer of data to Google servers in the United States.',
          'Our transactional email provider sends alert notices and your account emails.',
          'Telegram receives data only if you link your account to our bot, and only so we can deliver notices through that channel.',
          'The rest of your data is kept in our own database. We do not hand it to third parties except where legally required.',
        ],
      },
      {
        heading: 'Analytics and what we send Google',
        body: [
          'We use Google Analytics 4 (measurement ID G-E3V3E1LLC0) to learn which pages are useful. It runs under Consent Mode v2: until you decide, Analytics writes no cookie and sends only identifier-less measurement; if you reject, Google’s script is not loaded at all.',
          'When you have an account and have accepted measurement, we send Analytics a SHA-256 hash of your user identifier, never the identifier in the clear and never your email. It lets us avoid counting the same person twice across devices without handing Google anything that identifies you.',
          'We also ask Google to anonymise your IP address.',
        ],
      },
      {
        heading: 'How long we keep it',
        body: [
          'We keep your account data while your account is open. If you delete it, we remove your associated personal data; some technical records may persist for the minimum time required. Analytics data is retained per Google Analytics’ retention settings.',
        ],
      },
      {
        heading: 'Your rights',
        body: [
          'You have the right to access, rectify and erase your data, and to object to its processing or withdraw your consent. To exercise them, write to ' + CONTACT + '. We respond within the time limits set by law.',
          'The supervisory authority in Uruguay is the Personal Data Regulation and Control Unit (URCDP). If you feel we did not address your request, you may turn to it.',
        ],
      },
      {
        heading: 'Emails and how to unsubscribe',
        body: [
          'Every alert email includes an unsubscribe link, and you can manage your channels and frequency from your account. Unsubscribing does not delete your account; it only stops the sends.',
        ],
      },
      {
        heading: 'Minors and changes',
        body: [
          'The service is not directed at minors and we do not knowingly collect their data.',
          'We may update this policy. When a change is material we will note it here and update the date above.',
        ],
      },
    ],
  },
}

// ── Terms ──────────────────────────────────────────────────────────────────
const TERMS: Record<Locale, LegalDoc> = {
  es: {
    title: 'Términos y condiciones',
    updated: UPDATED.es,
    intro: [
      'Al usar este sitio aceptás estos términos. Si no estás de acuerdo, no lo uses. Es un proyecto personal e independiente mantenido por Eduardo Airaudo; escribinos a ' + CONTACT + ' por cualquier consulta.',
    ],
    sections: [
      {
        heading: 'Qué es y qué no es este sitio',
        body: [
          'Este sitio hace buscables y analiza los datos abiertos de compras del Estado uruguayo. No es un sitio oficial del Estado. La fuente autoritativa es comprasestatales.gub.uy: ante cualquier diferencia, manda la fuente oficial.',
          'Los datos provienen del propio Estado y pueden contener errores de carga de origen. De hecho publicamos una sección dedicada a esos errores. Nuestro análisis y las señales de anomalía son indicios para mirar con atención, no acusaciones ni conclusiones.',
        ],
      },
      {
        heading: 'Sin garantías',
        body: [
          'El servicio se ofrece «tal cual» y «según disponibilidad», sin garantía de exactitud, integridad, puntualidad ni disponibilidad continua. En particular, no garantizamos que una alerta o notificación llegue, ni que llegue a tiempo.',
          'No uses este sitio como única base para una decisión comercial, periodística o legal: verificá siempre contra la fuente oficial.',
        ],
      },
      {
        heading: 'Uso aceptable',
        body: [
          'Podés usar el sitio y su API pública para fines legítimos. No está permitido el scraping abusivo que degrade el servicio, revender el acceso, ni eludir los límites de uso (rate limits) de la API.',
          'Las claves de API son personales e intransferibles; sos responsable de su uso y de mantenerlas en secreto.',
        ],
      },
      {
        heading: 'Cuentas',
        body: [
          'Sos responsable de la seguridad de tu contraseña y de la actividad de tu cuenta. Podemos suspender o cerrar cuentas ante abuso o incumplimiento de estos términos. Podés pedir el borrado de tu cuenta cuando quieras.',
        ],
      },
      {
        heading: 'Propiedad y cómo citar',
        body: [
          'Los datos de compras son de fuente pública estatal. El código de este sitio es abierto y está disponible en su repositorio. El análisis, los textos y la identidad del sitio son de su autor.',
          'Podés citar el sitio enlazándolo. Si reutilizás los datos, indicá también la fuente oficial (Compras Estatales / catalogodatos.gub.uy).',
        ],
      },
      {
        heading: 'Enlaces a terceros',
        body: [
          'El sitio enlaza a fichas oficiales, documentos y otras fuentes. No controlamos esos sitios ni respondemos por su contenido.',
        ],
      },
      {
        heading: 'Cambios y ley aplicable',
        body: [
          'Podemos modificar estos términos; la versión vigente es la publicada aquí, con su fecha. Estos términos se rigen por la ley de la República Oriental del Uruguay, y cualquier controversia se somete a sus tribunales.',
        ],
      },
    ],
  },
  en: {
    title: 'Terms and conditions',
    updated: UPDATED.en,
    intro: [
      'By using this site you accept these terms. If you disagree, do not use it. It is a personal, independent project maintained by Eduardo Airaudo; write to ' + CONTACT + ' with any question.',
    ],
    sections: [
      {
        heading: 'What this site is and is not',
        body: [
          'This site makes Uruguay’s open government-procurement data searchable and analyses it. It is not an official state site. The authoritative source is comprasestatales.gub.uy: in case of any discrepancy, the official source prevails.',
          'The data comes from the state itself and may contain load errors at source. We even publish a section dedicated to those errors. Our analysis and anomaly signals are prompts to look closely, not accusations or conclusions.',
        ],
      },
      {
        heading: 'No warranty',
        body: [
          'The service is provided “as is” and “as available,” with no warranty of accuracy, completeness, timeliness or continuous availability. In particular, we do not guarantee that an alert or notification will arrive, or arrive in time.',
          'Do not use this site as the sole basis for a commercial, journalistic or legal decision: always verify against the official source.',
        ],
      },
      {
        heading: 'Acceptable use',
        body: [
          'You may use the site and its public API for legitimate purposes. Abusive scraping that degrades the service, reselling access, and circumventing the API’s rate limits are not permitted.',
          'API keys are personal and non-transferable; you are responsible for their use and for keeping them secret.',
        ],
      },
      {
        heading: 'Accounts',
        body: [
          'You are responsible for the security of your password and for activity on your account. We may suspend or close accounts for abuse or breach of these terms. You may request deletion of your account at any time.',
        ],
      },
      {
        heading: 'Ownership and how to cite',
        body: [
          'The procurement data is from a public, state source. This site’s code is open and available in its repository. The analysis, text and identity of the site belong to its author.',
          'You may cite the site by linking to it. If you reuse the data, also credit the official source (Compras Estatales / catalogodatos.gub.uy).',
        ],
      },
      {
        heading: 'Third-party links',
        body: [
          'The site links to official records, documents and other sources. We do not control those sites and are not responsible for their content.',
        ],
      },
      {
        heading: 'Changes and governing law',
        body: [
          'We may amend these terms; the version in force is the one published here, with its date. These terms are governed by the law of the Oriental Republic of Uruguay, and any dispute is submitted to its courts.',
        ],
      },
    ],
  },
}

export function getPrivacy(locale: Locale): LegalDoc {
  return PRIVACY[locale] ?? PRIVACY.es
}

export function getTerms(locale: Locale): LegalDoc {
  return TERMS[locale] ?? TERMS.es
}

export function getCookieRows(locale: Locale): CookieRow[] {
  return COOKIE_ROWS[locale] ?? COOKIE_ROWS.es
}
