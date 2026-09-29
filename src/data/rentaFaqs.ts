/**
 * Preguntas frecuentes de la Declaración Anual de Renta 2025.
 *
 * Fuente única: el componente de página y el FAQPage JSON-LD leen de
 * aquí, así el contenido indexado por Google es el mismo que ve el
 * usuario (requisito de Google para rich results).
 */

export interface FaqItem {
  q: string;
  a: string;
}

export const RENTA_FAQS: FaqItem[] = [
  {
    q: '¿Cuándo vence la Declaración Anual de Renta 2025?',
    a: 'Depende del último dígito de tu RUC. Las empresas fuera del alcance de la Ley N° 31940 declaran entre el 26 de marzo y el 13 de abril de 2026 (cronograma general). Las personas naturales y las MYPE comprendidas en la Ley N° 31940 —con ingresos 2024 de hasta 1,700 UIT— declaran entre el 27 de mayo y el 10 de junio de 2026 (cronograma ampliado).',
  },
  {
    q: '¿Quiénes están obligados a presentar la Declaración Anual de Renta?',
    a: 'Las empresas del Régimen General y del Régimen MYPE Tributario (RMT) que hayan generado rentas o pérdidas de tercera categoría en 2025. También las personas naturales con rentas de trabajo que superen los S/ 37,450 anuales, quienes paguen renta de primera categoría, perciban rentas de cuarta categoría por más de S/ 48,125, tengan rentas de fuente extranjera, o arrastren saldos a favor de ejercicios anteriores.',
  },
  {
    q: '¿Qué formulario uso para declarar la renta 2025?',
    a: 'Las empresas usan el Formulario Virtual N° 710 —Simplificado o Completo— disponible desde el 2 de enero de 2026 en el portal de SUNAT. Las personas naturales sin negocio usan el Formulario Virtual N° 709, disponible desde el 31 de marzo de 2026 en el portal de SUNAT y en la app Personas SUNAT.',
  },
  {
    q: '¿Qué pasa si presento la declaración fuera de plazo?',
    a: 'SUNAT aplica una multa por presentacion extemporánea (tabla de infracciones del Código Tributario, típicamente 1 UIT, S/ 5,500 en 2026) más intereses por cada día de atraso en el pago. Si regularizas antes de que SUNAT te notifique, aplica la rebaja por subsanación voluntaria de hasta el 90 % de la multa. Si ya recibiste la notificación, la rebaja es de hasta el 60 %.',
  },
  {
    q: '¿Puedo fraccionar el pago del impuesto?',
    a: 'Sí. En el mismo formulario puedes solicitar el fraccionamiento o aplazamiento de la deuda según el artículo 36° del Código Tributario, y SUNAT lo aprueba de forma automática en la mayoría de casos. Evaluar si te conviene fraccionar o pagar de una vez (por los intereses) es parte del análisis que hacemos con cada cliente.',
  },
  {
    q: '¿Cuánto se paga de impuesto a la renta una MYPE en 2026?',
    a: 'Con la UIT 2026 en S/ 5,500: en el Régimen MYPE Tributario la renta neta hasta 15 UIT (S/ 82,500) paga 10 % y el exceso 29.5 %. En el Régimen General toda la renta neta paga 29.5 %. La renta neta es tu utilidad: ingresos menos gastos deducibles.',
  },
];
