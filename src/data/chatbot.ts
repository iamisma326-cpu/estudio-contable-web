/**
 * Base de conocimiento del asistente virtual del sitio.
 *
 * Todo el "cerebro" vive aquí: intenciones (palabras clave + respuesta),
 * respuestas dinámicas calculadas con los mismos datos del sitio (cronograma
 * SUNAT) y el clasificador que decide qué responder.
 *
 * No hay modelo ni API: es JavaScript puro que corre en el navegador, así el
 * sitio sigue siendo estático, responde al instante y no depende de una clave.
 *
 * La voz es la del estudio: tuteo, sin jerga innecesaria, cifras concretas.
 * Los datos duros salen de los mismos módulos que usa el resto de la web
 * (sunatSchedule) para que el asistente nunca contradiga una página publicada.
 */
import { upcomingDeadlines, formatLongDate } from './sunatSchedule';

/* ============================================================
   Tipos
   ============================================================ */

export interface ChatLink {
  label: string;
  to: string;
}

export interface ChatReply {
  /** Texto con saltos de párrafo y **negritas** opcionales */
  text: string;
  /** Preguntas sugeridas que el visitante puede tocar */
  suggestions?: string[];
  /** Acciones de navegación interna (se renderizan como botones) */
  links?: ChatLink[];
}

export interface ChatIntent {
  id: string;
  /** Frases en cualquier forma; se normalizan al comparar */
  keywords: string[];
  /**
   * Predicado propio. Devuelve una puntuación (0 = no aplica) para casos que
   * las palabras clave no alcanzan a cubrir, como el dígito del RUC.
   */
  match?: (norm: string) => number;
  /** Función cuando hay variantes o depende de lo que escribió el visitante */
  reply: ChatReply | ((norm: string) => ChatReply);
}

/* ============================================================
   Normalización
   ============================================================ */

/**
 * Minúsculas, sin acentos y sin puntuación.
 * Así "¿Cuándo VENCE mi declaración?" compara igual que "cuando vence".
 */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Peso de una palabra clave: cuanto más larga la frase, más específica */
function keywordScore(keyword: string, norm: string): number {
  const kw = normalize(keyword);
  if (!kw || !norm.includes(kw)) return 0;
  const words = kw.split(' ').length;
  return 1 + (words - 1) * 0.75;
}

/** Extrae un dígito suelto ("termina en 5"); ignora años y RUC completos */
function extractDigit(norm: string): number | null {
  const runs = norm.match(/\d+/g);
  if (!runs) return null;
  const single = runs.find((r) => r.length === 1);
  return single === undefined ? null : Number(single);
}

/** Palabras que indican que la pregunta va de fechas de vencimiento */
const DEADLINE_HINTS = /(venc|plazo|cronograma|declaracion|pagar|pago|fecha|regimen|ruc)/;

/** Etiqueta del grupo de dígito, tal como lo publica SUNAT */
function groupLabel(digit: number): string {
  if (digit === 1) return '1';
  if (digit === 2 || digit === 3) return '2 y 3';
  if (digit === 4 || digit === 5) return '4 y 5';
  if (digit === 6 || digit === 7) return '6 y 7';
  if (digit === 8 || digit === 9) return '8 y 9';
  return 'todos los contribuyentes';
}

/* ============================================================
   Respuestas dinámicas
   ============================================================ */

/**
 * Próximos vencimientos para el último dígito del RUC que mencionó el
 * visitante. Se calculan contra el cronograma oficial embebido, igual que la
 * tabla de Recursos, para que chat y página digan siempre lo mismo.
 */
function deadlinesReply(digit: number): ChatReply {
  const upcoming = upcomingDeadlines(digit, 3);

  if (upcoming.length === 0) {
    return {
      text:
        'Con tu cronograma no quedan declaraciones pendientes este año. 🎉\n\n' +
        'Igual conviene revisar que no haya nada presentado fuera de plazo.',
      suggestions: ['Tengo declaraciones atrasadas', 'Quiero un diagnóstico gratuito'],
      links: [{ label: 'Ver cronograma completo', to: '/recursos' }],
    };
  }

  const lines = upcoming
    .map((d) => {
      const falta =
        d.daysLeft === 0
          ? 'vence **hoy**'
          : d.daysLeft === 1
            ? 'vence **mañana**'
            : `faltan **${d.daysLeft} días**`;
      return `• ${d.periodLabel}: ${formatLongDate(d.dueDate)} (${falta})`;
    })
    .join('\n');

  return {
    text:
      `Listo: con el último dígito **${digit}** caes en el grupo ${groupLabel(digit)} del cronograma. ` +
      'Estos son tus próximos vencimientos de declaración mensual (PDT 621 e ITF):\n\n' +
      `${lines}\n\n` +
      'Si eres **Buenos Contribuyentes** la fecha es otra: dímelo y la recalculo.',
    suggestions: ['¿Y si soy Buenos Contribuyentes?', 'Tengo declaraciones atrasadas', 'Ver el cronograma'],
    links: [{ label: 'Ver tabla por dígito', to: '/recursos' }],
  };
}

/** Buenos Contribuyentes: el cronograma los trata en una columna aparta */
function goodTaxpayerReply(): ChatReply {
  const upcoming = upcomingDeadlines(10, 3);
  const lines = upcoming
    .map((d) => `• ${d.periodLabel}: ${formatLongDate(d.dueDate)}`)
    .join('\n');

  return {
    text:
      'Si eres **Buenos Contribuyentes o UESP** vences siempre en el último grupo del mes:\n\n' +
      `${lines}\n\n` +
      'Son fechas distintas a las del resto de dígitos, así que vale la pena tenerlas a mano.',
    suggestions: ['Tengo declaraciones atrasadas', 'Ver el cronograma'],
    links: [{ label: 'Ver tabla por dígito', to: '/recursos' }],
  };
}

/* ============================================================
   Intenciones
   ============================================================ */

/** Mensaje de bienvenida: se envía la primera vez que se abre el chat */
export const GREETING: ChatReply = {
  text:
    '¡Hola! 👋 Soy el asistente de **Sánchez Delgado & Asociados**, estudio contable y tributario en San Isidro.\n\n' +
    'Puedo darte honorarios orientativos, decirte qué régimen te conviene, calcular cuándo vence tu próxima declaración o agendarte con un contador.\n\n' +
    '¿Por dónde empezamos?',
  suggestions: ['¿Qué servicios tienen?', '¿Cuánto cuesta?', '¿Cuándo vence mi declaración?'],
};

/** Dos variantes al azar: la conversación no suena mecanizada */
const pick = (a: ChatReply, b: ChatReply) => (norm: string): ChatReply =>
  Math.random() < 0.5 ? a : b;

const INTENTS: ChatIntent[] = [
  /* ---------- Fechas por dígito del RUC (puntaje propio) ---------- */
  {
    id: 'vencimiento-digito',
    keywords: [],
    match: (norm) => {
      if (norm.includes('buenos contribuyentes') || norm.includes('buen contribuyente')) return 7;
      if (!DEADLINE_HINTS.test(norm)) return 0;
      if (extractDigit(norm) === null) return 0;
      return 6;
    },
    reply: (norm) => {
      if (norm.includes('buenos contribuyentes')) return goodTaxpayerReply();
      const digit = extractDigit(norm);
      return digit === null ? fallbackReply() : deadlinesReply(digit);
    },
  },

  /* ---------- Conversación social ---------- */
  {
    id: 'saludo',
    keywords: ['hola', 'buenos dias', 'buenas tardes', 'buenas noches', 'que tal', 'saludos', 'hey'],
    reply: pick(
      {
        text:
          '¡Hola! 👋 Encantado: soy el asistente virtual de **Sánchez Delgado & Asociados**.\n\n' +
          'Puedo darte honorarios orientativos, explicarte qué régimen te conviene, decirte cuándo vence tu próxima declaración o agendarte con un contador.\n\n' +
          '¿Por dónde empezamos?',
        suggestions: ['¿Qué servicios tienen?', '¿Cuánto cuesta?', '¿Cuándo vence mi declaración?'],
      },
      {
        text:
          '¡Buenas! 👋 Bienvenido al estudio.\n\n' +
          'Estoy aquí para lo que necesites: honorarios, régimen tributario, declaraciones atrasadas o una cita con el equipo. ¿Empezamos?',
        suggestions: ['¿Qué servicios tienen?', 'Quiero un diagnóstico gratuito', 'Hablar con un asesor'],
      }
    ),
  },
  {
    id: 'identidad',
    keywords: [
      'quien eres',
      'que eres',
      'eres un bot',
      'eres bot',
      'eres ia',
      'eres una ia',
      'eres humano',
      'eres real',
      'como funcionas',
      'como te usas',
      'chatbot',
      'inteligencia artificial',
    ],
    reply: {
      text:
        'Soy un **asistente virtual** con respuestas preparadas por el equipo del estudio: respondo al instante las dudas más frecuentes sobre contabilidad, SUNAT y planillas.\n\n' +
        'Cuando el tema da para revisar tus números reales (comparar regímenes, declaraciones atrasadas, auditoría), te paso con un contador del equipo.\n\n' +
        '¿Sigo contigo o te conecto con alguien?',
      suggestions: ['Hablar con un asesor', '¿Qué servicios tienen?', '¿Cuánto cuesta?'],
    },
  },
  {
    id: 'gracias',
    keywords: ['gracias', 'muchas gracias', 'te lo agradezco', 'genial', 'excelente', 'buenisimo'],
    reply: pick(
      {
        text: '¡A ti! 🙌 Me alegra poder ayudar. Si surge otra duda por el camino, aquí estaré.',
        suggestions: ['¿Qué servicios tienen?', '¿Cuándo vence mi declaración?'],
      },
      {
        text: '¡De nada! 😊 Cualquier otra consulta, escríbeme cuando quieras.',
        suggestions: ['Quiero un diagnóstico gratuito', 'Hablar con un asesor'],
      }
    ),
  },
  {
    id: 'despedida',
    keywords: ['adios', 'bye', 'chao', 'chau', 'hasta luego', 'nos vemos'],
    reply: {
      text:
        '¡Hasta luego! 👋 Recuerda que el diagnóstico inicial es gratuito y sin compromiso.\n\n' +
        'Cuando quieras, retomamos por aquí.',
      suggestions: ['Quiero un diagnóstico gratuito'],
    },
  },

  /* ---------- El estudio y sus servicios ---------- */
  {
    id: 'servicios',
    keywords: [
      'servicios',
      'que hacen',
      'que ofrece',
      'que ofrecen',
      'que tratan',
      'asesoria contable',
      'asesoria tributaria',
      'que incluyen',
    ],
    reply: {
      text:
        'Estos son los seis pilares del estudio:\n\n' +
        '• **Outsourcing contable** — contabilidad al día, conciliaciones y estados financieros mensuales.\n' +
        '• **Asesoría tributaria** — declaraciones, cronograma y representación ante SUNAT.\n' +
        '• **Planillas y laboral** — PLAME, CTS, gratificaciones, T-Registro.\n' +
        '• **Auditoría** — revisión de estados financieros y preparación ante fiscalización.\n' +
        '• **Constitución de empresa** — del RUC a la firma electrónica.\n' +
        '• **Asesoría financiera** — presupuestos, proyecciones y rentabilidad.\n\n' +
        '¿Sobre cuál quieres que profundice?',
      suggestions: ['Outsourcing contable', 'Planillas y laboral', 'Auditoría', '¿Cuánto cuesta?'],
      links: [{ label: 'Ver servicios en detalle', to: '/servicios' }],
    },
  },
  {
    id: 'outsourcing',
    keywords: [
      'outsourcing',
      'llevan mi contabilidad',
      'llevar mi contabilidad',
      'contabilidad completa',
      'contabilidad mensual',
      'estados financieros',
      'reportes contables',
      'conciliacion',
    ],
    reply: {
      text:
        'El **outsourcing contable** es nuestro servicio más contratado. Incluye:\n\n' +
        '• Registro de tus operaciones al día (ventas, compras, bancos).\n' +
        '• Conciliación bancaria y clasificación según el PCGE.\n' +
        '• Estados financieros mensuales y acumulados.\n' +
        '• Reporte de resultados en lenguaje claro, no en jerga contable.\n\n' +
        'Trabajamos en la nube: tú subes facturas y comprobantes, nosotros los ordenamos y presentamos el PDT 621 cuando toca.',
      suggestions: ['¿Cuánto cuesta?', '¿Qué revisan en el diagnóstico?'],
      links: [{ label: 'Ver servicios', to: '/servicios' }],
    },
  },
  {
    id: 'precios',
    keywords: [
      'precio',
      'precios',
      'cuanto cuesta',
      'cuanto es',
      'cuanto vale',
      'cuesta',
      'cobran',
      'honorarios',
      'tarifa',
      'tarifas',
      'costo',
      'costos',
      'presupuesto',
      'mensualidad',
    ],
    reply: {
      text:
        'Depende del volumen de operaciones y de si tienes planilla. Como referencia de mercado en Lima:\n\n' +
        '• Empresa pequeña en **RER o RMT** con hasta 50 comprobantes al mes: **S/ 250 – 450** mensuales.\n' +
        '• **Régimen General** o con varios trabajadores en planilla: **S/ 500 – 1,500** mensuales.\n\n' +
        'Nosotros entregamos una propuesta con **precio fijo** después del diagnóstico gratuito: sin sorpresas a mitad de año.',
      suggestions: ['¿Qué revisan en el diagnóstico?', 'Quiero un diagnóstico gratuito'],
      links: [{ label: 'Pedir una propuesta', to: '/contacto' }],
    },
  },
  {
    id: 'diagnostico',
    keywords: [
      'diagnostico',
      'gratis',
      'gratuito',
      'gratuita',
      'sin costo',
      'sin compromiso',
      'cita',
      'agendar',
      'reunion',
      'reunirme',
      'consulta',
      'hablar con un contador',
      'hablar con un asesor',
      'asesor',
      'especialista',
      'persona humana',
      'equipo humano',
      'me atiende alguien',
    ],
    reply: {
      text:
        'El primer diagnóstico dura **45 minutos** y es **gratuito y sin compromiso**.\n\n' +
        'Revisamos tu situación actual y te entregamos un informe con los riesgos detectados y las oportunidades de ahorro, aunque decidas no trabajar con nosotros.\n\n' +
        'Se hace **presencial en San Isidro** o **por videollamada**.',
      suggestions: ['¿Qué revisan en el diagnóstico?', '¿Cuánto cuesta después?'],
      links: [{ label: 'Agendar diagnóstico gratuito', to: '/contacto' }],
    },
  },

  /* ---------- Temas tributarios ---------- */
  {
    id: 'cronograma',
    keywords: [
      'cronograma',
      'vencimiento',
      'vencimientos',
      'vence',
      'vencen',
      'fecha limite',
      'plazo',
      'declaracion',
      'declaraciones',
      'declarar',
      'pdt 621',
      'formulario 621',
      'itf',
      'obligaciones',
      'cuando se paga',
    ],
    reply: {
      text:
        'La declaración mensual (PDT 621 e ITF) vence según el **último dígito de tu RUC**:\n\n' +
        '• Dígito **0** → día 16 · **1** → 17 · **2 y 3** → 18\n' +
        '• **4 y 5** → 19 · **6 y 7** → 20 · **8 y 9** → 23\n' +
        '• **Buenos Contribuyentes** → 24\n\n' +
        'Los días se mueven un poco según el mes (30 o 31) y en diciembre vencen en enero.\n\n' +
        'Dime el último dígito de tu RUC y te calculo tu próxima fecha exacta.',
      suggestions: ['Mi RUC termina en 5', 'Tengo declaraciones atrasadas', 'Ver el cronograma'],
      links: [{ label: 'Ver cronograma SUNAT 2026', to: '/recursos' }],
    },
  },
  {
    id: 'regimen',
    keywords: [
      'regimen',
      'regimenes',
      'rer',
      'rmt',
      'nrus',
      'mype',
      'que regimen me conviene',
      'en que regimen estoy',
      'inscribir',
      'impuesto a la renta',
      'igv',
      'contribuyente',
      'factura',
      'boleta',
    ],
    reply: {
      text:
        'En tercera categoría hay cuatro caminos principales:\n\n' +
        '• **NRUS** — cuota fija de S/ 20 o S/ 50 para negocios muy pequeños.\n' +
        '• **RER** — 1.5 % sobre ingresos, definitivo; hasta S/ 525,000 al año.\n' +
        '• **RMT (MYPE)** — 10 % sobre la utilidad hasta 15 UIT y 29.5 % por el exceso; hasta 1,700 UIT (S/ 9,350,000).\n' +
        '• **Régimen General** — 29.5 % sobre la renta neta, sin límite de ingresos.\n\n' +
        'La elección depende de tus ingresos, compras, clientes y utilidad esperada: en el diagnóstico comparamos escenarios con tus números reales.',
      suggestions: ['Comparar mis regímenes', '¿Cuánto cuesta?', '¿Qué revisan en el diagnóstico?'],
      links: [{ label: 'Calculadora de regímenes', to: '/recursos' }],
    },
  },
  {
    id: 'renta',
    keywords: [
      'renta anual',
      'declaracion anual',
      'declarar la renta',
      'dj anual',
      'impuesto anual',
      'renta 2025',
      'regularizacion anual',
    ],
    reply: {
      text:
        'La **DJ Anual de Renta 2025** se presenta en 2026 y también se rige por el último dígito del RUC, con dos cronogramas:\n\n' +
        '• **General** (fuera del alcance de la Ley N° 31940): del **26 de marzo al 13 de abril de 2026**.\n' +
        '• **Ampliado** (personas naturales y MYPE, ingresos 2024 ≤ 1,700 UIT): del **27 de mayo al 10 de junio de 2026**.\n\n' +
        'En la página de Renta Anual ves tu fecha exacta según tu dígito.',
      suggestions: ['¿Qué régimen me conviene?', 'Tengo declaraciones atrasadas'],
      links: [{ label: 'Ver Renta Anual 2025', to: '/renta-anual-2025' }],
    },
  },
  {
    id: 'planillas',
    keywords: [
      'planilla',
      'planillas',
      'plame',
      'trabajador',
      'trabajadores',
      'cts',
      'gratificacion',
      'gratificaciones',
      'vacaciones',
      't registro',
      't-registro',
      'remuneracion',
      'sueldo',
      'nomina',
      'laboral',
      'empleador',
    ],
    reply: {
      text:
        'Sí, gestionamos planillas de punta a punta:\n\n' +
        '• Altas y bajas en el **T-Registro**.\n' +
        '• **Planilla electrónica (PLAME)** presentada al día.\n' +
        '• Cálculo de **CTS**, gratificaciones (incluida la bonificación del 9 %) y vacaciones.\n' +
        '• Liquidaciones y la declaración anual **T-4**.\n\n' +
        'Tanto en régimen laboral general como en el **régimen MYPE**.',
      suggestions: ['¿Cuánto cuesta?', 'Quiero un diagnóstico gratuito'],
      links: [{ label: 'Ver servicios laborales', to: '/servicios' }],
    },
  },
  {
    id: 'multas',
    keywords: [
      'multa',
      'multas',
      'declaraciones atrasadas',
      'declaracion atrasada',
      'declaraciones pendientes',
      'estoy atrasado',
      'atrasad',
      'atraso',
      'fuera de plazo',
      'mora',
      'subsanacion',
      'regularizar',
      'regularizacion',
      'sancion',
      'olvide declarar',
      'no declare',
      'debo declaraciones',
      'situacion irregular',
    ],
    reply: {
      text:
        'Tranquilo, es de lo que más vemos y **se puede regularizar**.\n\n' +
        '• Presentamos las declaraciones mensuales y anuales atrasadas.\n' +
        '• Coordinamos las órdenes de pago con SUNAT.\n' +
        '• Aplicamos la **rebaja por subsanación voluntaria**, que SUNAT concede hasta en un **92 %** según la infracción.\n\n' +
        'Cuantos menos meses pasen, más baja la multa. ¿Desde cuándo dejaste de declarar?',
      suggestions: ['Hablar con un asesor', 'Quiero un diagnóstico gratuito'],
      links: [{ label: 'Regularizar mi situación', to: '/contacto' }],
    },
  },
  {
    id: 'constitucion',
    keywords: [
      'constituir',
      'constitucion',
      'crear empresa',
      'montar empresa',
      'abrir empresa',
      'nueva empresa',
      'inscribir ruc',
      'alta de ruc',
      'firma electronica',
      'emprender',
      'que es el ruc',
      'pasar a sac',
    ],
    reply: {
      text:
        'Constituir una empresa en el Perú son **4 pasos** y nosotros hacemos los cuatro:\n\n' +
        '1. Registro de la denominación y del estatuto en SUNARP.\n' +
        '2. Obtención del **RUC** ante SUNAT y elección del régimen tributario.\n' +
        '3. **Firma electrónica** y, si aplica, inscripción en el T-Registro como empleador.\n' +
        '4. Apertura de cuentas y primeros comprobantes de pago.\n\n' +
        'También te orientamos si dudas entre S.A.C., S.A. o E.I.R.L.',
      suggestions: ['¿Qué régimen me conviene?', '¿Cuánto cuesta?'],
      links: [{ label: 'Constitución de empresa', to: '/contacto' }],
    },
  },
  {
    id: 'auditoria',
    keywords: [
      'auditoria',
      'auditar',
      'auditor',
      'revisar mis cuentas',
      'revisar mis numeros',
      'fiscalizacion',
      'visita de sunat',
      'sunat me revisa',
      'me revisaron',
      'control tributario',
      'carta de sunat',
    ],
    reply: {
      text:
        'Hacemos **auditoría externa** y también preparación previa ante fiscalización:\n\n' +
        '• Revisión de estados financieros y de obligaciones formales.\n' +
        '• Detección de riesgos antes de que SUNAT los encuentre.\n' +
        '• Acompañamiento en vistas de oposición y descargos.\n\n' +
        'Si recibiste una carta de SUNAT, cuéntanos la fecha: los plazos de respuesta son cortos.',
      suggestions: ['Hablar con un asesor', 'Quiero un diagnóstico gratuito'],
      links: [{ label: 'Solicitar auditoría', to: '/contacto' }],
    },
  },

  /* ---------- Utilidades del sitio ---------- */
  {
    id: 'recursos',
    keywords: [
      'recursos',
      'calculadora',
      'herramientas',
      'herramienta',
      'plantillas',
      'glosario',
      'descargar',
      'editor de pdf',
      'guias',
      'checklist',
      'es gratis',
    ],
    reply: {
      text:
        'La sección de **Recursos** es gratuita y sin registro. Ahí encontrarás:\n\n' +
        '• **Cronograma SUNAT 2026** con fechas por último dígito del RUC.\n' +
        '• **Tipo de cambio** oficial del día.\n' +
        '• **Calculadora de regímenes**: compara RER vs RMT vs Régimen General con tus números.\n' +
        '• **Glosario contable** en lenguaje sencillo y actualidad tributaria.\n\n' +
        '¿Te llevo directo?',
      suggestions: ['Comparar mis regímenes', '¿Cuándo vence mi declaración?'],
      links: [{ label: 'Ir a Recursos', to: '/recursos' }],
    },
  },
  {
    id: 'tipocambio',
    keywords: ['tipo de cambio', 'dolar', 'dolares', 'usd', 'moneda extranjera', 'cambio sunat', 'euro'],
    reply: {
      text:
        'El **tipo de cambio SUNAT** de referencia (compra y venta) se publica todos los días hábiles y es el que debes usar para facturar y regularizar en moneda extranjera.\n\n' +
        'Lo tienes actualizado en Recursos, junto con la calculadora de regímenes.',
      suggestions: ['Comparar mis regímenes', '¿Qué servicios tienen?'],
      links: [{ label: 'Ver tipo de cambio', to: '/recursos' }],
    },
  },
  {
    id: 'contacto',
    keywords: [
      'contacto',
      'telefono',
      'celular',
      'whatsapp',
      'correo',
      'email',
      'direccion',
      'donde estan',
      'oficina',
      'horario',
      'atienden',
      'sede',
      'ubicacion',
      'redes sociales',
    ],
    reply: {
      text:
        'Estamos en **Av. Canaval y Moreyra 480, Piso 12, Of. 1203 — San Isidro, Lima**.\n\n' +
        '• Teléfono: **(01) 480-2600**\n' +
        '• WhatsApp: **+51 922 375 598**\n' +
        '• Correo: **contacto@sanchezdelgado.pe**\n' +
        '• Horario: **Lun–Vie 8:30–18:00 · Sáb 9:00–13:00**\n\n' +
        'Respondemos en menos de 24 horas hábiles.',
      suggestions: ['Quiero un diagnóstico gratuito', '¿Qué servicios tienen?'],
      links: [{ label: 'Ir a Contacto', to: '/contacto' }],
    },
  },
  {
    id: 'ayuda',
    keywords: ['ayuda', 'que sabes', 'que puedes hacer', 'menu', 'opciones', 'como te uso', 'para que sirves'],
    reply: {
      text:
        'Puedo ayudarte con esto, entre otros temas:\n\n' +
        '• **Servicios y honorarios** — qué hacemos y cuánto cuesta.\n' +
        '• **Régimen tributario** — RER, RMT, Régimen General o NRUS.\n' +
        '• **Vencimientos SUNAT** — dime el último dígito de tu RUC y te doy tu fecha.\n' +
        '• **Planillas, multas y declaraciones atrasadas.**\n' +
        '• **Contacto y diagnóstico gratuito.**\n\n' +
        'Escríbelo con tus palabras, yo lo entiendo.',
      suggestions: ['¿Cuánto cuesta?', '¿Cuándo vence mi declaración?', 'Hablar con un asesor'],
    },
  },
  {
    id: 'cierre',
    keywords: ['estoy listo', 'ya esta', 'nada mas', 'eso es todo', 'no mas'],
    reply: {
      text: '¡Perfecto! Cuando quieras retomamos por aquí. 🙌',
      suggestions: ['Quiero un diagnóstico gratuito', '¿Qué servicios tienen?'],
      links: [{ label: 'Agendar diagnóstico gratuito', to: '/contacto' }],
    },
  },
];

/* ============================================================
   Respuestas de reserva
   ============================================================ */

let fallbackIndex = 0;

/** Variante rotativa: el "no lo sé" nunca suena idéntico dos veces seguidas */
function fallbackReply(): ChatReply {
  const variants: ChatReply[] = [
    {
      text:
        'Esa no la tengo clara y no quiero responderte a medias. 🤔\n\n' +
        'Puedo pasarte con un contador del equipo o ayudarte con otra de estas:',
      suggestions: ['¿Qué servicios tienen?', '¿Cuánto cuesta?', 'Hablar con un asesor'],
    },
    {
      text:
        'Hmm, todavía no tengo una respuesta preparada para eso.\n\n' +
        'Prueba con otra pregunta o te conecto con alguien del estudio:',
      suggestions: ['¿Cuándo vence mi declaración?', 'Quiero un diagnóstico gratuito', 'Hablar con un asesor'],
    },
    {
      text:
        'Perdón, me quedé sin frases para eso. 😅\n\n' +
        'Los temas que mejor manejo son servicios, honorarios, regímenes, vencimientos y planillas.',
      suggestions: ['¿Qué servicios tienen?', '¿Qué régimen me conviene?', 'Hablar con un asesor'],
    },
  ];

  const reply = variants[fallbackIndex % variants.length];
  fallbackIndex += 1;
  return reply;
}

/* ============================================================
   Clasificador
   ============================================================ */

/**
 * Clasifica lo que escribió el visitante y devuelve la respuesta a mostrar.
 *
 * Gana la intención con mayor puntaje: las frases largas pesan más que una
 * palabra suelta, así "hola, ¿cuánto cuesta?" va a precios y no a saludos.
 * Las intenciones con `match` propio (el dígito del RUC) entran con puntaje
 * alto porque no se pueden cubrir con palabras clave.
 */
export function findReply(input: string): ChatReply {
  const norm = normalize(input);
  if (!norm) return fallbackReply();

  let best: ChatIntent | null = null;
  let bestScore = 0;

  for (const intent of INTENTS) {
    let score = intent.match ? intent.match(norm) : 0;
    for (const kw of intent.keywords) {
      score += keywordScore(kw, norm);
    }
    if (score > bestScore) {
      bestScore = score;
      best = intent;
    }
  }

  if (!best || bestScore < 1) return fallbackReply();
  return typeof best.reply === 'function' ? best.reply(norm) : best.reply;
}
