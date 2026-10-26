/**
 * Multas de SUNAT: cuánto cuesta cada infracción y cuánto se rebaja si
 * subsanas.
 *
 * Fuentes (verificadas contra el texto oficial):
 * - Sanciones base: Tablas I y II de Infracciones y Sanciones del Código
 *   Tributario (TUO aprobado por D.S. 133-2013-EF y modificatorias) y sus
 *   Notas (10), (11), (12), (13), (14) para los topes de los porcentajes de
 *   ingresos netos.
 * - Gradualidad por subsanación: Anexo II del Reglamento del Régimen de
 *   Gradualidad (R.S. 063-2007/SUNAT), con las particularidades del
 *   artículo 13-A (R.S. 180-2012/SUNAT, art. 178 numerales 1 y 4) y del
 *   artículo 13-B (R.S. 078-2021/SUNAT y R.S. 007-2025/SUNAT, art. 176
 *   numeral 1).
 * - Gradualidad por frecuencia (comprobantes de pago): Anexo A de la
 *   R.S. 063-2007/SUNAT, en la versión vigente para infracciones cometidas o
 *   detectadas a partir del 03/01/2020 (R.S. 226-2019/SUNAT).
 *
 * El monto se calcula siempre con la UIT vigente a la fecha en que se cometió
 * la infracción (art. 180° del Código Tributario): aquí, la UIT 2026.
 *
 * Nada de esto reemplaza la revisión del caso concreto: la mayoría de las
 * rebajas exigen cumplir el pago en plazos perentorios y el criterio de
 * SUNAT sobre la etapa no siempre coincide con el del contribuyente.
 */

import { UIT_2026 } from './regimenes';

export type Tabla = 'I' | 'II';

/** Régimen del deudor tributario: determina qué Tabla del Código le aplica */
export type RegimenId = 'general' | 'mype' | 'rer' | 'natural';

export const REGIMENES_MULTA: { id: RegimenId; nombre: string; tabla: Tabla }[] = [
  { id: 'general', nombre: 'Régimen General', tabla: 'I' },
  { id: 'mype', nombre: 'Régimen MYPE Tributario', tabla: 'I' },
  { id: 'rer', nombre: 'Régimen Especial (RER)', tabla: 'II' },
  { id: 'natural', nombre: 'Persona natural sin negocio', tabla: 'II' },
];

export function tablaDe(regimen: RegimenId): Tabla {
  return REGIMENES_MULTA.find((r) => r.id === regimen)?.tabla ?? 'I';
}

export type GrupoId = 'declaraciones' | 'comprobantes' | 'libros' | 'informacion' | 'pago';

export const GRUPOS: { id: GrupoId; nombre: string }[] = [
  { id: 'declaraciones', nombre: 'Declaraciones y comunicaciones' },
  { id: 'comprobantes', nombre: 'Comprobantes de pago' },
  { id: 'libros', nombre: 'Libros y registros contables' },
  { id: 'informacion', nombre: 'Control, información y comparecencia' },
  { id: 'pago', nombre: 'Pago de tributos' },
];

/** Etapa del procedimiento en la que te encuentras */
export type EtapaId = 'voluntaria' | 'inducida' | 'requerida' | 'reclamada' | 'especial' | 'frecuencia';

export const ETAPAS: Record<EtapaId, string> = {
  voluntaria: 'Subsanación voluntaria',
  inducida: 'Subsanación inducida',
  requerida: 'Etapa requerida',
  reclamada: 'Etapa reclamada',
  especial: 'Caso especial',
  frecuencia: 'Por frecuencia (comprobantes)',
};

export interface Escalon {
  id: string;
  etapa: EtapaId;
  titulo: string;
  detalle: string;
  /** Rebaja (%) sobre la sanción si NO pagas la multa rebajada; null si el criterio no aplica */
  sinPago: number | null;
  /** Rebaja (%) sobre la sanción si pagas la multa rebajada; null si el criterio no aplica */
  conPago: number | null;
  /** Multa final en UIT (infracciones graduadas por frecuencia, Anexo A) */
  montoUIT?: { I: number; II: number };
}

export interface Tramo {
  id: string;
  etiqueta: string;
  /** Límite superior de ingresos netos del ejercicio anterior, en UIT (null = sin límite) */
  hastaUIT: number | null;
  /** Regímenes a los que aplica el tramo (si se omite, aplica a todos) */
  regimenes?: RegimenId[];
  escalones: Escalon[];
}

export type Sancion =
  /** Multa como fracción de la UIT (1 = 1 UIT) */
  | { tipo: 'uit'; porTabla: { I: number; II: number } }
  /** Multa como porcentaje de los ingresos netos anuales, con topes en UIT */
  | { tipo: 'ingresos'; porcentaje: number; minimoUIT: number; maximoUIT: number }
  /** Multa como porcentaje del tributo omitido / no pagado */
  | { tipo: 'tributo'; porcentaje: number; detalle: string; minimoUIT: number }
  /** La sanción de la tabla es cierre o multa según la frecuencia (Anexo A) */
  | { tipo: 'frecuencia' };

export interface Infraccion {
  id: string;
  grupo: GrupoId;
  referencia: string;
  titulo: string;
  detalle: string;
  sancion: Sancion;
  /** Escalones directos (infracciones sin tramos por ingresos) */
  escalones?: Escalon[];
  /** Escalones condicionados a los ingresos netos del ejercicio anterior */
  tramos?: Tramo[];
  notas: string[];
  fuente: string;
}

/** Escalón reutilizado por las infracciones del art. 178 (gradualidad art. 13-A) */
const escalonesArt178: Escalon[] = [
  {
    id: 'voluntaria',
    etapa: 'voluntaria',
    titulo: 'Subsanación voluntaria — 95 % de rebaja',
    detalle:
      'Regularizas y pagas antes de cualquier notificación o requerimiento de SUNAT sobre el tributo o período.',
    sinPago: 0,
    conPago: 95,
  },
  {
    id: 'inducida',
    etapa: 'inducida',
    titulo: 'Subsanación inducida — 70 % de rebaja',
    detalle:
      'Desde el día siguiente de notificado el primer requerimiento de fiscalización hasta que vence el plazo del artículo 75°, o antes de que surta efecto la orden de pago o la resolución de multa.',
    sinPago: 0,
    conPago: 70,
  },
  {
    id: 'inducida-cancela',
    etapa: 'inducida',
    titulo: 'Inducida y cancelas el tributo — 95 % de rebaja',
    detalle: 'En la misma etapa, si además pagas la deuda tributaria determinada, la rebaja sube al 95 %.',
    sinPago: 0,
    conPago: 95,
  },
  {
    id: 'inducida-fracciona',
    etapa: 'inducida',
    titulo: 'Inducida con fraccionamiento aprobado — 85 % de rebaja',
    detalle: 'Si la deuda queda acogida a un fraccionamiento aprobado por SUNAT.',
    sinPago: 0,
    conPago: 85,
  },
  {
    id: 'requerida',
    etapa: 'requerida',
    titulo: 'Etapa requerida — 60 % de rebaja',
    detalle:
      'Vencido el plazo del artículo 75° (o notificada la orden de pago, la resolución de determinación o la de multa), si cancelas la deuda antes del plazo del artículo 117°.',
    sinPago: 0,
    conPago: 60,
  },
  {
    id: 'reclamada',
    etapa: 'reclamada',
    titulo: 'Reclamaste y cancelas — 40 % de rebaja',
    detalle:
      'Si reclamaste la orden de pago, la resolución de determinación o la de multa y cancelas antes de que venza el plazo para apelar (artículo 146°).',
    sinPago: 0,
    conPago: 40,
  },
];

/** Escalón especial del art. 176 numeral 1: declaración considerada no presentada */
const escalonNoPresentada: Escalon = {
  id: 'no-presentada',
  etapa: 'especial',
  titulo: 'SUNAT consideró tu declaración como no presentada — 100 % de rebaja',
  detalle:
    'Omitiste o consignaste mal el RUC o el período tributario. Si presentas el formulario virtual «Solicitud de Modificación y/o Inclusión de Datos» la multa se rebaja al 100 %, en cualquier etapa y sin exigir pago.',
  sinPago: 100,
  conPago: 100,
};

export const INFRACCIONES: Infraccion[] = [
  /* ---------------------------------------------------------------- */
  /* Declaraciones y comunicaciones                                    */
  /* ---------------------------------------------------------------- */
  {
    id: 'decl-176-1',
    grupo: 'declaraciones',
    referencia: 'Art. 176°, numeral 1',
    titulo: 'No presentar la declaración en el plazo (PDT 621, PLAME, DJ Anual…)',
    detalle:
      'No presentaste una declaración que determina tu deuda tributaria dentro del cronograma SUNAT. Es la infracción más frecuente y la que mejor se resuelve con la gradualidad: subsanar a tiempo puede dejar la multa en cero.',
    sancion: { tipo: 'uit', porTabla: { I: 1, II: 0.5 } },
    tramos: [
      {
        id: 'hasta-19',
        etiqueta: 'Hasta 19 UIT de ingresos netos',
        hastaUIT: 19,
        regimenes: ['general', 'mype', 'rer'],
        escalones: [
          {
            id: 'voluntaria',
            etapa: 'voluntaria',
            titulo: 'Subsanación voluntaria — 100 % de rebaja',
            detalle:
              'Presentas la declaración antes de que surta efecto cualquier notificación de SUNAT. La multa desaparece por completo.',
            sinPago: 100,
            conPago: 100,
          },
          {
            id: 'inducida-7',
            etapa: 'inducida',
            titulo: 'Inducida, hasta el 7.º día hábil de la cobranza coactiva — 98 % / 99 %',
            detalle:
              'Ya te notificaron la infracción: si regularizas hasta el 7.º día hábil posterior a la notificación de la resolución de ejecución coactiva (REC), la rebaja es 99 % pagando y 98 % si no pagas.',
            sinPago: 98,
            conPago: 99,
          },
          {
            id: 'inducida-120',
            etapa: 'inducida',
            titulo: 'Inducida, del 8.º al 120.º día hábil de la REC — 96 % / 97 %',
            detalle:
              'Ese plazo adicional existe para regímenes General, MYPE y RER con ingresos de hasta 19 UIT (R.S. 007-2025/SUNAT).',
            sinPago: 96,
            conPago: 97,
          },
          escalonNoPresentada,
        ],
      },
      {
        id: 'hasta-150',
        etiqueta: 'Más de 19 y hasta 150 UIT de ingresos netos',
        hastaUIT: 150,
        regimenes: ['general', 'mype', 'rer'],
        escalones: [
          {
            id: 'voluntaria',
            etapa: 'voluntaria',
            titulo: 'Subsanación voluntaria — 100 % de rebaja',
            detalle: 'Presentas la declaración antes de que surta efecto cualquier notificación de SUNAT.',
            sinPago: 100,
            conPago: 100,
          },
          {
            id: 'inducida',
            etapa: 'inducida',
            titulo: 'Subsanación inducida — 90 % / 95 %',
            detalle:
              'Ya te notificaron la infracción. Pagando la multa rebajada la rebaja es 95 %; sin pagar, 90 %.',
            sinPago: 90,
            conPago: 95,
          },
          escalonNoPresentada,
        ],
      },
      {
        id: 'mas-150',
        etiqueta: 'Más de 150 UIT de ingresos netos (o fuera del RER, MYPE y Régimen General)',
        hastaUIT: null,
        escalones: [
          {
            id: 'voluntaria',
            etapa: 'voluntaria',
            titulo: 'Subsanación voluntaria — 80 % / 90 %',
            detalle:
              'Antes de que te notifiquen la infracción. La rebaja es 90 % si pagas y 80 % si no pagas la multa rebajada.',
            sinPago: 80,
            conPago: 90,
          },
          {
            id: 'inducida',
            etapa: 'inducida',
            titulo: 'Subsanación inducida — 50 % / 60 %',
            detalle: 'Dentro del plazo que SUNAT te otorgue para regularizar. Con pago 60 %, sin pago 50 %.',
            sinPago: 50,
            conPago: 60,
          },
        ],
      },
    ],
    notas: [
      'Las rebajas del 100 %, 99 %, 98 %, 97 % y 96 % solo aplican a los regímenes General, MYPE y RER con ingresos netos de hasta 150 UIT del ejercicio anterior (artículo 13-B del Reglamento de Gradualidad).',
      'Si no realizaste actividad generadora de renta de tercera categoría en el ejercicio anterior, se considera que no superaste las 19 UIT.',
      'Si ya pagaste la multa antes de acogerte a la gradualidad, el pago se imputa a la multa rebajada, pero el exceso no se devuelve.',
      'La multa incluye los intereses moratorios desde el vencimiento hasta el día del pago.',
    ],
    fuente:
      'Tablas I y II del Código Tributario; art. 13-B del Reglamento del Régimen de Gradualidad (R.S. 063-2007/SUNAT), modificado por la R.S. 078-2021/SUNAT y la R.S. 007-2025/SUNAT.',
  },
  {
    id: 'decl-176-2',
    grupo: 'declaraciones',
    referencia: 'Art. 176°, numeral 2',
    titulo: 'No presentar otras declaraciones o comunicaciones',
    detalle:
      'Declaraciones informativas, comunicaciones de cambio de domicilio o de suspensión de actividades y demás documentos que no determinan tributo.',
    sancion: { tipo: 'ingresos', porcentaje: 0.006, minimoUIT: 0.1, maximoUIT: 25 },
    escalones: [
      {
        id: 'voluntaria',
        etapa: 'voluntaria',
        titulo: 'Subsanación voluntaria — 100 % de rebaja',
        detalle: 'Presentas la declaración o comunicación omitida antes de que te notifiquen la infracción.',
        sinPago: 100,
        conPago: 100,
      },
      {
        id: 'inducida',
        etapa: 'inducida',
        titulo: 'Subsanación inducida — 80 % / 90 %',
        detalle: 'Dentro del plazo que SUNAT te otorgue. Con pago 90 %, sin pago 80 %.',
        sinPago: 80,
        conPago: 90,
      },
    ],
    notas: [
      'La Tabla también prevé 30 % de la UIT en el Régimen General y 15 % en el RER como sanción alternativa; aquí estimamos la modalidad de 0.6 % de tus ingresos netos con sus topes, que es la que se aplica cuando tienes ingresos declarados.',
      'Tope legal: nunca menos del 10 % de la UIT ni más de 25 UIT (Nota 10 de las Tablas I y II).',
      'Para las declaraciones informativas (Reporte Local, Reporte Maestro, Reporte País por País o beneficiario final) la multa es 0.6 % de los ingresos netos con el mismo tope.',
    ],
    fuente: 'Tablas I y II del Código Tributario, rubro 4; Anexo II de la R.S. 063-2007/SUNAT.',
  },
  {
    id: 'decl-176-4',
    grupo: 'declaraciones',
    referencia: 'Art. 176°, numeral 4',
    titulo: 'Presentar otras declaraciones o comunicaciones incompletas o no conformes',
    detalle:
      'La declaración se presentó, pero con datos incompletos, errados o que no reflejan la realidad (sin llegar a omitir tributo, caso del art. 178).',
    sancion: { tipo: 'ingresos', porcentaje: 0.006, minimoUIT: 0.1, maximoUIT: 25 },
    escalones: [
      {
        id: 'voluntaria',
        etapa: 'voluntaria',
        titulo: 'Subsanación voluntaria — 100 % de rebaja',
        detalle: 'Presentas una nueva declaración con la información completa antes de que te notifiquen.',
        sinPago: 100,
        conPago: 100,
      },
      {
        id: 'inducida',
        etapa: 'inducida',
        titulo: 'Subsanación inducida — 50 % / 80 %',
        detalle: 'Dentro del plazo otorgado por SUNAT. Con pago 80 %, sin pago 50 %.',
        sinPago: 50,
        conPago: 80,
      },
    ],
    notas: [
      'Si la información errada omitió tributo (o generó un saldo o pérdida indebidos), la infracción es la del art. 178° numeral 1 y la sanción se calcula sobre el tributo omitido.',
      'Tope legal: nunca menos del 10 % de la UIT ni más de 25 UIT.',
    ],
    fuente: 'Tablas I y II del Código Tributario, rubro 4; Anexo II de la R.S. 063-2007/SUNAT.',
  },
  {
    id: 'decl-176-8',
    grupo: 'declaraciones',
    referencia: 'Art. 176°, numeral 8',
    titulo: 'Presentar la declaración sin tener en cuenta la forma u otras condiciones de SUNAT',
    detalle:
      'Usaste un formulario que no corresponde, fuera del medio o las condiciones establecidas (por ejemplo, declarar por un canal no habilitado).',
    sancion: { tipo: 'uit', porTabla: { I: 0.3, II: 0.15 } },
    escalones: [
      {
        id: 'voluntaria',
        etapa: 'voluntaria',
        titulo: 'Subsanación voluntaria — 100 % de rebaja',
        detalle: 'Presentas la declaración en la forma y condiciones correctas antes de que te notifiquen.',
        sinPago: 100,
        conPago: 100,
      },
      {
        id: 'inducida',
        etapa: 'inducida',
        titulo: 'Subsanación inducida — 50 % / 80 %',
        detalle: 'Dentro del plazo otorgado por SUNAT. Con pago 80 %, sin pago 50 %.',
        sinPago: 50,
        conPago: 80,
      },
    ],
    notas: ['Desde el Decreto Legislativo 1263 ya no se sanciona presentar más de una rectificatoria del mismo tributo y período.'],
    fuente: 'Tablas I y II del Código Tributario, rubro 4; Anexo II de la R.S. 063-2007/SUNAT.',
  },

  /* ---------------------------------------------------------------- */
  /* Comprobantes de pago                                              */
  /* ---------------------------------------------------------------- */
  {
    id: 'comp-174-1',
    grupo: 'comprobantes',
    referencia: 'Art. 174°, numeral 1',
    titulo: 'No emitir ni otorgar comprobantes de pago (boletas o facturas)',
    detalle:
      'No entregaste el comprobante por una venta o un servicio prestado. Ojo: esta infracción no se rebaja por subsanar, se graduúa por frecuencia (cuántas veces te han sancionado antes por lo mismo).',
    sancion: { tipo: 'frecuencia' },
    escalones: [
      {
        id: 'multa-1ra',
        etapa: 'frecuencia',
        titulo: '1.ª oportunidad sin reconocer la falta',
        detalle:
          'Es tu primera vez y no reconoces la infracción mediante el Acta de Reconocimiento. Se aplica solo multa, sin cierre: el cierre empieza a correr desde la segunda oportunidad.',
        sinPago: null,
        conPago: null,
        montoUIT: { I: 0.5, II: 0.25 },
      },
      {
        id: 'multa-2da',
        etapa: 'frecuencia',
        titulo: '2.ª oportunidad — fuera de un establecimiento',
        detalle: 'Ya tenías una sanción firme por lo mismo. Si la intervención no fue en un local comercial ni oficina profesional, no hay cierre: solo multa.',
        sinPago: null,
        conPago: null,
        montoUIT: { I: 0.65, II: 0.3 },
      },
      {
        id: 'multa-3ra',
        etapa: 'frecuencia',
        titulo: '3.ª oportunidad — fuera de un establecimiento',
        sinPago: null,
        conPago: null,
        detalle: 'La multa sigue subiendo con cada reincidencia y a partir de la 4.ª llega al máximo de la tabla.',
        montoUIT: { I: 0.85, II: 0.4 },
      },
      {
        id: 'multa-4ta',
        etapa: 'frecuencia',
        titulo: '4.ª oportunidad o más — sin gradualidad',
        detalle: 'A partir de la cuarta oportunidad no hay derecho al beneficio: se aplica la sanción máxima de la tabla.',
        sinPago: null,
        conPago: null,
        montoUIT: { I: 1, II: 0.5 },
      },
    ],
    notas: [
      'La sanción de la tabla parte de «1 UIT o cierre». En la primera oportunidad la multa baja al 50 % de la UIT (25 % en el RER) y el cierre recién empieza en la segunda: 3 días, 5 días en la tercera y 10 días en la cuarta. SUNAT puede sustituir el cierre por una multa del 5 % de tus ingresos netos de la última declaración mensual, no menor a 1 UIT ni mayor a 8 UIT (en el RER el piso baja a 50 % de la UIT la primera vez y 75 % la segunda).',
      'Primera vez: si reconoces la infracción mediante el Acta de Reconocimiento (Formulario 0880, ante el fedatario o en mesa de partes dentro de los 5 días hábiles siguientes), la multa de la primera oportunidad no se aplica. Es el descuento más importante de esta infracción.',
      'En el Nuevo RUS la escala se calcula sobre «I» (4 veces el límite de tu categoría): 0.3 % la primera vez, 0.4 % la segunda, 0.5 % la tercera y 0.6 % la cuarta.',
      'Emitir el comprobante después no elimina la multa: la gradualidad depende de la frecuencia, no de la subsanación.',
    ],
    fuente: 'Tabla I y II del Código Tributario, rubro 2, notas (3) y (3-A); Anexo A de la R.S. 063-2007/SUNAT (R.S. 226-2019/SUNAT).',
  },
  {
    id: 'comp-174-2',
    grupo: 'comprobantes',
    referencia: 'Art. 174°, numeral 2',
    titulo: 'Emitir comprobantes que no reúnen los requisitos para serlo',
    detalle:
      'El comprobante existe, pero no tiene los requisitos y características que exige el Reglamento de Comprobantes de Pago (por ejemplo, sin RUC del cliente cuando es obligatorio o sin la descripción del servicio).',
    sancion: { tipo: 'frecuencia' },
    escalones: [
      {
        id: 'multa-1ra',
        etapa: 'frecuencia',
        titulo: '1.ª oportunidad sin reconocer la falta',
        detalle:
          'Primera vez y no reconoces la infracción mediante el Acta de Reconocimiento. Es la sanción más baja de la escala.',
        sinPago: null,
        conPago: null,
        montoUIT: { I: 0.25, II: 0.12 },
      },
      {
        id: 'multa-2da',
        etapa: 'frecuencia',
        titulo: '2.ª oportunidad — fuera de un establecimiento',
        detalle: 'Ya tenías una sanción firme por lo mismo.',
        sinPago: null,
        conPago: null,
        montoUIT: { I: 0.3, II: 0.16 },
      },
      {
        id: 'multa-3ra',
        etapa: 'frecuencia',
        titulo: '3.ª oportunidad — fuera de un establecimiento',
        detalle: 'La multa sube con cada reincidencia: a partir de la 4.ª oportunidad llega al máximo de la tabla.',
        sinPago: null,
        conPago: null,
        montoUIT: { I: 0.4, II: 0.2 },
      },
      {
        id: 'multa-4ta',
        etapa: 'frecuencia',
        titulo: '4.ª oportunidad o más — sin gradualidad',
        detalle: 'A partir de la cuarta oportunidad se aplica la sanción máxima de la tabla.',
        sinPago: null,
        conPago: null,
        montoUIT: { I: 0.5, II: 0.25 },
      },
    ],
    notas: [
      'Primera vez: reconocer la infracción mediante el Acta de Reconocimiento (Formulario 0880) dentro de los 5 días hábiles siguientes deja sin efecto la multa de la primera oportunidad.',
      'Detectada en tu local, la sanción es cierre: 2 días desde la 2.ª oportunidad, 4 días en la 3.ª y 10 días en la 4.ª.',
      'Si el documento incumple requisitos principales y hay bienes en un local no declarado, la sanción puede ser comiso en lugar de multa.',
    ],
    fuente: 'Tablas I y II del Código Tributario, rubro 2; Anexo A de la R.S. 063-2007/SUNAT.',
  },

  /* ---------------------------------------------------------------- */
  /* Libros y registros                                                */
  /* ---------------------------------------------------------------- */
  {
    id: 'libros-175-1',
    grupo: 'libros',
    referencia: 'Art. 175°, numeral 1',
    titulo: 'Omitir llevar los libros o registros contables',
    detalle:
      'No llevas los libros de contabilidad (o los libros electrónicos) que tu régimen te obliga a llevar. Es la única infracción de esta lista que no tiene rebaja por subsanación voluntaria: solo se graduúa si SUNAT te requiere.',
    sancion: { tipo: 'ingresos', porcentaje: 0.006, minimoUIT: 0.1, maximoUIT: 25 },
    escalones: [
      {
        id: 'inducida',
        etapa: 'inducida',
        titulo: 'Subsanación inducida — 50 % / 80 %',
        detalle:
          'Llevas los libros omitidos observando la forma y condiciones, dentro del plazo otorgado por SUNAT. Con pago 80 %, sin pago 50 %.',
        sinPago: 50,
        conPago: 80,
      },
    ],
    notas: [
      'El Anexo II no otorga rebaja por subsanación voluntaria para esta infracción: si regularizas por iniciativa propia y sin notificación, la multa se mantiene.',
      'Tope legal: nunca menos del 10 % de la UIT ni más de 25 UIT.',
    ],
    fuente: 'Tablas I y II del Código Tributario, rubro 3; Anexo II de la R.S. 063-2007/SUNAT.',
  },
  {
    id: 'libros-175-2',
    grupo: 'libros',
    referencia: 'Art. 175°, numeral 2',
    titulo: 'Llevar los libros sin observar la forma y condiciones establecidas',
    detalle:
      'Los libros existen, pero no siguen las formalidades (no están legalizados cuando corresponde, no se registran en el orden o con las características exigidas).',
    sancion: { tipo: 'ingresos', porcentaje: 0.003, minimoUIT: 0.1, maximoUIT: 12 },
    escalones: [
      {
        id: 'voluntaria',
        etapa: 'voluntaria',
        titulo: 'Subsanación voluntaria — 100 % de rebaja',
        detalle: 'Rehaces el libro o registro correctamente antes de que SUNAT te notifique la infracción.',
        sinPago: 100,
        conPago: 100,
      },
      {
        id: 'inducida',
        etapa: 'inducida',
        titulo: 'Subsanación inducida — 50 % / 80 %',
        detalle: 'Rehaces el libro dentro del plazo otorgado por SUNAT. Con pago 80 %, sin pago 50 %.',
        sinPago: 50,
        conPago: 80,
      },
    ],
    notas: [
      'Si la infracción consiste en no legalizar el Registro de Compras, la tasa aplicable es 0.6 % de los ingresos netos con los topes de la Nota 10 (10 % de la UIT como mínimo y 25 UIT como máximo).',
      'Tope legal de esta infracción: entre 10 % de la UIT y 12 UIT.',
    ],
    fuente: 'Tablas I y II del Código Tributario, rubro 3; Anexo II de la R.S. 063-2007/SUNAT.',
  },
  {
    id: 'libros-175-5',
    grupo: 'libros',
    referencia: 'Art. 175°, numeral 5',
    titulo: 'Llevar los libros con un atraso mayor al permitido',
    detalle:
      'Tus libros o registros electrónicos están atrasados más allá del plazo máximo que fija SUNAT (el atraso solo es infracción cuando supera ese límite).',
    sancion: { tipo: 'ingresos', porcentaje: 0.003, minimoUIT: 0.1, maximoUIT: 12 },
    escalones: [
      {
        id: 'voluntaria',
        etapa: 'voluntaria',
        titulo: 'Subsanación voluntaria — 80 % / 90 %',
        detalle: 'Pones al día los libros antes de que SUNAT te notifique. Con pago 90 %, sin pago 80 %.',
        sinPago: 80,
        conPago: 90,
      },
      {
        id: 'inducida',
        etapa: 'inducida',
        titulo: 'Subsanación inducida — 50 % / 70 %',
        detalle: 'Pones al día los libros dentro del plazo otorgado por SUNAT. Con pago 70 %, sin pago 50 %.',
        sinPago: 50,
        conPago: 70,
      },
    ],
    notas: ['Tope legal: entre 10 % de la UIT y 12 UIT.'],
    fuente: 'Tablas I y II del Código Tributario, rubro 3; Anexo II de la R.S. 063-2007/SUNAT.',
  },

  /* ---------------------------------------------------------------- */
  /* Control, información y comparecencia                              */
  /* ---------------------------------------------------------------- */
  {
    id: 'info-177-5',
    grupo: 'informacion',
    referencia: 'Art. 177°, numeral 5',
    titulo: 'No proporcionar la información o documentos que SUNAT te requiere',
    detalle:
      'Recibiste un requerimiento de información (o de documentación sobre tus actividades o las de terceros vinculados) y no lo atendiste, o lo hiciste fuera de la forma y plazo.',
    sancion: { tipo: 'ingresos', porcentaje: 0.003, minimoUIT: 0.1, maximoUIT: 12 },
    escalones: [
      {
        id: 'voluntaria',
        etapa: 'voluntaria',
        titulo: 'Subsanación voluntaria — 80 % / 90 %',
        detalle: 'Entregas la información antes de que te notifiquen la infracción. Con pago 90 %, sin pago 80 %.',
        sinPago: 80,
        conPago: 90,
      },
      {
        id: 'inducida',
        etapa: 'inducida',
        titulo: 'Subsanación inducida — 50 % / 70 %',
        detalle: 'Entregas la información dentro del plazo otorgado por SUNAT. Con pago 70 %, sin pago 50 %.',
        sinPago: 50,
        conPago: 70,
      },
    ],
    notas: [
      'Proporcionar información no conforme con la realidad es una infracción distinta (numeral 6) y tiene su propia gradualidad: 80 % / 90 % en voluntaria y 50 % / 60 % en inducida.',
      'No comparecer ante SUNAT cuando te cita (numeral 7) no se graduúa por subsanación: la rebaja depende del momento en que compareces, y la multa base es 50 % de la UIT en el Régimen General y 25 % en el RER.',
      'Tope legal de esta infracción: entre 10 % de la UIT y 12 UIT.',
    ],
    fuente: 'Tablas I y II del Código Tributario, rubro 5; Anexo II de la R.S. 063-2007/SUNAT.',
  },

  /* ---------------------------------------------------------------- */
  /* Pago de tributos                                                  */
  /* ---------------------------------------------------------------- */
  {
    id: 'pago-178-1',
    grupo: 'pago',
    referencia: 'Art. 178°, numeral 1',
    titulo: 'No incluir ingresos o declarar datos falsos que reducen el tributo',
    detalle:
      'La declaración no incluyó ingresos, remuneraciones o rentas, aplicó una tasa que no correspondía, o declaró cifras falsas que generaron menos tributo, un saldo a favor o una pérdida indebidos. La sanción se calcula sobre el tributo omitido, no sobre la UIT.',
    sancion: {
      tipo: 'tributo',
      porcentaje: 0.5,
      detalle: '50 % del tributo por pagar omitido',
      minimoUIT: 0.05,
    },
    escalones: escalonesArt178,
    notas: [
      'Todas las rebajas exigen pagar la multa rebajada más los intereses: sin pago no hay reducción.',
      'La multa nunca puede ser menor al 5 % de la UIT (S/ 275 con la UIT 2026).',
      'Si el monto se obtuvo indebidamente como devolución, la sanción es el 100 % de ese monto; si se trata de aportes a EsSalud o la ONP, o de renta de quinta categoría de trabajadores no declarados, es el 100 % del tributo omitido.',
      'Si además hay saldo a favor o pérdida declarados indebidamente, la multa se suma al 50 % de ese saldo (o al 15 % de la pérdida).',
      'Presentar la declaración rectificatoria por tu cuenta, antes de cualquier notificación, es el escenario más barato: 95 % de rebaja.',
    ],
    fuente: 'Tabla I del Código Tributario, rubro 6, y su Nota 21; art. 13-A del Reglamento del Régimen de Gradualidad (R.S. 180-2012/SUNAT).',
  },
  {
    id: 'pago-178-4',
    grupo: 'pago',
    referencia: 'Art. 178°, numeral 4',
    titulo: 'No pagar en el plazo los tributos retenidos o percibidos',
    detalle:
      'Retuviste o percibiste un tributo de un tercero (por ejemplo, el impuesto en una factura de un agente de retención) y no lo entregaste a SUNAT dentro del plazo. Se sanciona sobre el monto no pagado.',
    sancion: {
      tipo: 'tributo',
      porcentaje: 0.5,
      detalle: '50 % del tributo retenido o percibido no pagado',
      minimoUIT: 0.05,
    },
    escalones: escalonesArt178,
    notas: [
      'La rebaja exige pagar la multa rebajada más los intereses; el tributo no pagado se regulariza aparte.',
      'La multa nunca puede ser menor al 5 % de la UIT (S/ 275 con la UIT 2026).',
      'Si eres agente de retención y no retuviste, la infracción aplicable es la del art. 177° numeral 13 (50 % del tributo no retenido o no percibido), salvo que hayas pagado el tributo dentro del plazo.',
    ],
    fuente: 'Tabla I del Código Tributario, rubro 6; art. 13-A del Reglamento del Régimen de Gradualidad (R.S. 180-2012/SUNAT).',
  },
];

/* ------------------------------------------------------------------ */
/* Cálculo                                                            */
/* ------------------------------------------------------------------ */

export function infraccionPorId(id: string): Infraccion | undefined {
  return INFRACCIONES.find((i) => i.id === id);
}

/** Escalones aplicables a la infracción según el régimen y los ingresos del ejercicio anterior */
export function escalonesDe(inf: Infraccion, regimen: RegimenId, ingresosNetos: number): { tramo: Tramo | null; escalones: Escalon[] } {
  if (inf.tramos) {
    for (const tramo of inf.tramos) {
      const regimenOk = !tramo.regimenes || tramo.regimenes.includes(regimen);
      if (!regimenOk) continue;
      const ingresoOk = tramo.hastaUIT === null || ingresosNetos <= tramo.hastaUIT * UIT_2026;
      if (ingresoOk) return { tramo, escalones: tramo.escalones };
    }
  }
  return { tramo: null, escalones: inf.escalones ?? [] };
}

/** Sanción base de la tabla, sin gradualidad */
function sanciónBase(inf: Infraccion, tabla: Tabla, ingresosNetos: number, tributo: number) {
  const s = inf.sancion;

  if (s.tipo === 'uit') {
    const uit = s.porTabla[tabla];
    return {
      monto: uit * UIT_2026,
      detalle: `${pct(uit * 100)} de la UIT (${soles(UIT_2026)} en 2026)`,
      topeBase: null as 'minimo' | 'maximo' | null,
    };
  }

  if (s.tipo === 'ingresos') {
    const bruto = ingresosNetos * s.porcentaje;
    const min = s.minimoUIT * UIT_2026;
    const max = s.maximoUIT * UIT_2026;
    const tope = bruto < min ? 'minimo' : bruto > max ? 'maximo' : null;
    const monto = bruto < min ? min : bruto > max ? max : bruto;
    return {
      monto,
      detalle: `${pct(s.porcentaje * 100)} de tus ingresos netos anuales (${soles(ingresosNetos)}), con tope entre ${pct(s.minimoUIT * 100)} y ${s.maximoUIT} UIT`,
      topeBase: tope as 'minimo' | 'maximo' | null,
    };
  }

  if (s.tipo === 'tributo') {
    return {
      monto: tributo * s.porcentaje,
      detalle: `${s.detalle} (${soles(tributo)})`,
      topeBase: null as 'minimo' | 'maximo' | null,
    };
  }

  // frecuencia: el monto sale del escalón elegido
  return { monto: 0, detalle: 'Cierre temporal o multa según la frecuencia (Anexo A)', topeBase: null as 'minimo' | 'maximo' | null };
}

export interface DatosMulta {
  infraccionId: string;
  regimen: RegimenId;
  /** Ingresos netos anuales del ejercicio anterior (para % de ingresos y tramos) */
  ingresosNetos: number;
  /** Tributo omitido o no pagado (para el art. 178°) */
  tributo: number;
  /** Escalón de gradualidad; null = sin acogerse a ninguna rebaja */
  escalonId: string | null;
  /** ¿Pagas la multa rebajada? */
  conPago: boolean;
}

export interface ResultadoMulta {
  infraccion: Infraccion;
  tabla: Tabla;
  tramo: Tramo | null;
  escalon: Escalon | null;
  /** Sanción según la tabla, antes de la gradualidad */
  sancion: number;
  sancionDetalle: string;
  /** Tope legal aplicado al monto base */
  topeBase: 'minimo' | 'maximo' | null;
  /** Rebaja efectivamente aplicada (%) */
  rebaja: number;
  /** Multa a pagar */
  multa: number;
  /** Cuánto ahorras frente a no acogerte a la gradualidad */
  ahorro: number;
  /** Aviso: el monto quedó por debajo del 5 % de la UIT */
  bajoMinimo: boolean;
}

/**
 * Calcula la multa de una infracción.
 *
 * Reglas aplicadas:
 * - Infracciones en función de la UIT, de los ingresos netos o del tributo:
 *   multa = sanción de la tabla × (1 − rebaja).
 * - Infracciones del art. 178°: la multa nunca es menor al 5 % de la UIT.
 * - Infracciones graduadas por frecuencia: el escalón ya contiene la multa
 *   final, así que la rebaja es cero por definición.
 */
export function calcularMulta(datos: DatosMulta): ResultadoMulta | null {
  const inf = infraccionPorId(datos.infraccionId);
  if (!inf) return null;

  const tabla = tablaDe(datos.regimen);
  const { tramo, escalones } = escalonesDe(inf, datos.regimen, datos.ingresosNetos);
  const escalon = datos.escalonId ? escalones.find((e) => e.id === datos.escalonId) ?? null : null;

  // Gradualidad por frecuencia: el escalón trae la multa ya graduada
  if (inf.sancion.tipo === 'frecuencia') {
    if (!escalon?.montoUIT) return null;
    const multa = escalon.montoUIT[tabla] * UIT_2026;
    return {
      infraccion: inf,
      tabla,
      tramo,
      escalon,
      sancion: multa,
      sancionDetalle: `${pct(escalon.montoUIT[tabla] * 100)} de la UIT según la oportunidad (Anexo A)`,
      topeBase: null,
      rebaja: 0,
      multa,
      ahorro: 0,
      bajoMinimo: false,
    };
  }

  const base = sanciónBase(inf, tabla, datos.ingresosNetos, datos.tributo);

  // Sin escalón elegido: no hay gradualidad y se paga la sanción completa
  const rebaja = escalon ? rebajaDe(escalon, datos.conPago) : 0;
  let multa = base.monto * (1 - rebaja / 100);

  // El art. 178° exige un piso del 5 % de la UIT
  if (inf.sancion.tipo === 'tributo') {
    multa = Math.max(multa, inf.sancion.minimoUIT * UIT_2026);
  }

  return {
    infraccion: inf,
    tabla,
    tramo,
    escalon,
    sancion: base.monto,
    sancionDetalle: base.detalle,
    topeBase: base.topeBase,
    rebaja,
    multa,
    ahorro: base.monto - multa,
    bajoMinimo: inf.sancion.tipo !== 'tributo' && multa < 0.05 * UIT_2026,
  };
}

/** Rebaja del escalón para el escenario de pago elegido */
export function rebajaDe(escalon: Escalon, conPago: boolean): number {
  const principal = conPago ? escalon.conPago : escalon.sinPago;
  const alterno = conPago ? escalon.sinPago : escalon.conPago;
  return principal ?? alterno ?? 0;
}

/** ¿El escalón distingue entre pagar y no pagar la multa? */
export function distinguePago(escalon: Escalon): boolean {
  return escalon.sinPago !== null && escalon.conPago !== null && escalon.sinPago !== escalon.conPago;
}

/* ------------------------------------------------------------------ */
/* Formato                                                            */
/* ------------------------------------------------------------------ */

function pct(n: number): string {
  const redondeado = Math.round(n * 100) / 100;
  return `${redondeado.toLocaleString('es-PE', { maximumFractionDigits: 2 })} %`;
}

function soles(n: number): string {
  return `S/ ${Math.round(n).toLocaleString('es-PE')}`;
}
