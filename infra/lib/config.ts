/**
 * Configuración compartida por todos los stacks de Miti Miti.
 * Cambiar acá (y no en cada stack) el prefijo, la región o el puerto de la app.
 */
export const config = {
  /** Prefijo para nombres de recursos (secretos, funciones, etc.). */
  project: 'mitimiti',
  /** Región por defecto. us-east-1 porque Textract no está disponible en sa-east-1. */
  defaultRegion: 'us-east-1',
  /** Puerto en el que escucha el backend Express dentro del contenedor. */
  appPort: 3000,
  /** Puerto de PostgreSQL. */
  dbPort: 5432,
  /** Nombre de la base de datos que crea RDS. */
  dbName: 'mitimiti',
  /** Usuario administrador de la base. */
  dbUser: 'mitimiti',
};
