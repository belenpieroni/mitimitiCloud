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

  /** Repositorio de ECR con la imagen del backend. */
  ecrRepositoryName: 'mitimiti-backend',
  /** Nombres de ECS: los usa también el pipeline de CD (.github/workflows/deploy.yml). */
  ecsClusterName: 'mitimiti-cluster',
  ecsServiceName: 'mitimiti-backend',
  /** Nombre del contenedor dentro de la Task Definition. */
  containerName: 'backend',
  /** Réplicas del backend (una por AZ). */
  desiredCount: 2,
  /** Log group de los contenedores del backend. */
  backendLogGroupName: '/mitimiti/ecs/backend',
  /** Cada cuántas horas EventBridge invoca la Lambda de recordatorios (RemindersStack). */
  remindersEveryHours: 48,
  /** Log group de la Lambda de recordatorios (RemindersStack). */
  jobLogGroupName: '/mitimiti/job',
    /** Nombre del bucket de tickets: se combina con la cuenta para garantizar unicidad global. */
  ticketsBucketPrefix: 'mitimiti-tickets',
  /** Repo de GitHub que puede desplegar con OIDC (owner/repo). */
  githubRepo: 'belenpieroni/mitimitiCloud',
  /**
   * IDs numéricos del dueño y del repo en GitHub. El repo usa el formato inmutable del claim
   * "sub" del token OIDC (repo:<owner>@<ownerId>/<repo>@<repoId>:...), que incluye estos IDs.
   * Se consultan con: gh api repos/belenpieroni/mitimitiCloud/actions/oidc/customization/sub
   */
  githubOwnerId: '178622652',
  githubRepoId: '1348973155',
  /** Única rama que puede desplegar. */
  githubDeployBranch: 'main',
};
