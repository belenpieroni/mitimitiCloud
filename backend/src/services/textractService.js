const { TextractClient, AnalyzeExpenseCommand } = require('@aws-sdk/client-textract');

// ─── 1. Cliente Textract ───────────────────────────────────────────────────────
// En local: toma AWS_REGION y credenciales de tus variables de entorno (.env).
// En ECS Fargate: asume automáticamente el rol IAM de la tarea (Task Role).
const textractClient = new TextractClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Normaliza cualquier formato de monto (AR con puntos de miles y comas de decimales,
 * o US con comas de miles y puntos de decimales) a un Number estándar de JS.
 */
function parseMonto(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/[^0-9.,]/g, '').trim();
  if (!s) return null;

  const tienePunto = s.includes('.');
  const tieneComa = s.includes(',');
  const cantPuntos = (s.match(/\./g) || []).length;
  const cantComas = (s.match(/,/g) || []).length;

  if (tienePunto && tieneComa) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // Formato argentino: 1.234,56 -> 1234.56
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato estadounidense: 1,234.56 -> 1234.56
      s = s.replace(/,/g, '');
    }
  } else if (tieneComa && !tienePunto) {
    const parteDecimal = s.split(',')[1];
    if (parteDecimal && parteDecimal.length === 3 && cantComas === 1) {
      s = s.replace(',', ''); // Miles: 1,000 -> 1000
    } else {
      s = s.replace(',', '.'); // Decimales: 45,50 -> 45.50
    }
  } else if (tienePunto && !tieneComa) {
    const parteDecimal = s.split('.')[cantPuntos];
    if (cantPuntos === 1 && parteDecimal && parteDecimal.length === 3) {
      s = s.replace('.', ''); // Miles: 1.000 -> 1000
    } else if (cantPuntos > 1) {
      s = s.replace(/\./g, '');
    }
  }

  const v = Number(s);
  return Number.isNaN(v) ? null : v;
}

/**
 * Normaliza la fecha devuelta por Textract a formato ISO YYYY-MM-DD.
 */
function normalizarFecha(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  const dmyMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return s;
}

/**
 * Función principal: envía el AnalyzeExpenseCommand a AWS Textract apuntando al S3Object.
 *
 * @param {string} key - Clave del archivo en el bucket S3 (ej: tickets/usr-1/foto.jpg)
 * @returns {Promise<{ total: number|null, fecha: string|null }>}
 */
async function analizarTicketS3(key) {
  const bucketName = process.env.AWS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('La variable de entorno AWS_BUCKET_NAME no está configurada.');
  }

  const command = new AnalyzeExpenseCommand({
    Document: {
      S3Object: {
        Bucket: bucketName,
        Name: key,
      },
    },
  });

  const response = await textractClient.send(command);

  let totalDetectado = null;
  let fechaDetectada = null;

  for (const doc of response.ExpenseDocuments || []) {
    for (const field of doc.SummaryFields || []) {
      const type = field.Type?.Text;
      const textVal = field.ValueDetection?.Text;

      // Detección del monto total
      if (!totalDetectado && (type === 'TOTAL' || type === 'AMOUNT_DUE')) {
        const parsed = parseMonto(textVal);
        if (parsed !== null && parsed > 0) {
          totalDetectado = parsed;
        }
      }

      // Detección de la fecha
      if (!fechaDetectada && (type === 'INVOICE_RECEIPT_DATE' || type === 'DATE')) {
        const parsedFecha = normalizarFecha(textVal);
        if (parsedFecha) {
          fechaDetectada = parsedFecha;
        }
      }
    }
  }

  return {
    total: totalDetectado,
    fecha: fechaDetectada,
  };
}

module.exports = {
  analizarTicketS3,
  parseMonto,
  normalizarFecha,
};