const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');

// ─── 1. Cliente S3 ───────────────────────────────────────────────────────────
//
// En LOCAL: usa AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY del .env
// En ECS FARGATE: usa el rol IAM de la tarea automáticamente (no necesita credenciales en .env)
//
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

// ─── 2. Tipos de archivo permitidos ──────────────────────────────────────────
const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// ─── 3. Función principal: generar URL prefirmada ────────────────────────────
//
// Recibe:
//   - userId: el ID del usuario (para organizar los archivos en S3 por usuario)
//   - contentType: el tipo MIME del archivo que va a subir la app ('image/jpeg', etc.)
//   - fileSize: el tamaño en bytes (para validar antes de generar la URL)
//
// Devuelve:
//   - uploadUrl: la URL prefirmada para que la app haga PUT directo a S3
//   - key: la ruta del objeto dentro del bucket (la usamos para guardar en BD o para Textract)
//   - expiresIn: cuántos segundos dura la URL (300 = 5 minutos)
//
async function generarUrlPrefirmada({ userId, contentType, fileSize }) {
  // Validar tipo de archivo
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    const err = new Error(
      `Tipo de archivo no permitido: ${contentType}. Solo se aceptan: ${ALLOWED_CONTENT_TYPES.join(', ')}`
    );
    err.status = 400;
    throw err;
  }

  // Validar tamaño
  if (fileSize && fileSize > MAX_FILE_SIZE_BYTES) {
    const err = new Error(
      `El archivo supera el límite de ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`
    );
    err.status = 400;
    throw err;
  }

  // Generar una key única dentro del bucket.
  // Estructura: tickets/<userId>/<timestamp>-<uuid>.<extension>
  // Esto organiza los archivos por usuario y evita colisiones de nombres.
  const extension = contentType.split('/')[1]; // 'jpeg', 'png', etc.
  const key = `tickets/${userId}/${Date.now()}-${uuidv4()}.${extension}`;

  // Crear el comando PutObject — le dice a S3 qué objeto se va a subir y con qué metadatos
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    // ContentLength: fileSize,  // opcional, mejora la seguridad del upload
  });

  // Generar la URL prefirmada — dura 5 minutos (300 segundos)
  // Después de ese tiempo la URL expira y no se puede usar más
  const expiresIn = 300;
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

  return {
    uploadUrl, // La app usa esta URL para hacer PUT
    key,       // El backend guarda esta key en la BD para referenciar el archivo
    expiresIn,
  };
}

module.exports = { generarUrlPrefirmada };