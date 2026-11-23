# Infraestructura de Miti Miti (AWS CDK)

Toda la infraestructura de AWS está definida como código en TypeScript con AWS CDK v2.
Cada stack se despliega por separado y el estado queda en CloudFormation.

| Stack | Qué crea | Tarea |
|---|---|---|
| `VpcStack` | VPC en 2 AZs, subredes y security groups | TASK-12 |
| `SecretsStack` | Secreto `mitimiti/app` (JWT, Firebase) | TASK-13 |
| `RdsStack` | PostgreSQL 16 gestionado + secreto `mitimiti/db` | TASK-14 |
| `DbMigrationStack` | Lambda que aplica `schema.sql` en RDS | TASK-15 |
| `EcrStack` | Repositorio de imágenes `mitimiti-backend` | TASK-08 |
| `EcsStack` | Cluster ECS Fargate, Task Definition y servicio del backend | TASK-08 |
| `AlbStack` | ALB con health check en `/health` y CloudFront con HTTPS | TASK-09 |
| `S3Stack` | Bucket S3 privado para tickets y comprobantes | TASK-16 |
| `GithubOidcStack` | Proveedor OIDC de GitHub y rol de deploy para el CD | TASK-11 |

## Requisitos

- Node.js 20 o superior
- AWS CLI v2 configurada (`aws configure` o `aws configure sso`)
- Una cuenta de AWS con permisos para CloudFormation, IAM, EC2, RDS, Lambda y Secrets Manager

Verificá con qué cuenta estás trabajando antes de desplegar:

```bash
aws sts get-caller-identity
```

## Primer uso

```bash
cd infra
npm install

# Una sola vez por cuenta y región: crea el bucket y los roles que usa CDK
npx cdk bootstrap

# Compila y genera las plantillas de CloudFormation en cdk.out/
npx cdk synth
```

La región por defecto es `us-east-1` (Textract no está en `sa-east-1`).
Para usar otra: `export CDK_DEFAULT_REGION=<region>` antes de correr cdk.

## Comandos útiles

| Comando | Para qué |
|---|---|
| `npx cdk ls` | Lista los stacks |
| `npx cdk synth` | Genera las plantillas sin desplegar |
| `npx cdk diff <Stack>` | Muestra qué cambiaría en AWS |
| `npx cdk deploy <Stack>` | Despliega un stack |
| `npx cdk destroy <Stack>` | Elimina un stack |
| `npm run build` | Chequeo de tipos con `tsc` |

## Red (VpcStack)

```text
                Internet
                    │
        ┌───────────┴───────────┐
        │  public  (AZ a, AZ b) │  ALB + NAT Gateway        sg-alb: 80/443 desde 0.0.0.0/0
        └───────────┬───────────┘
        ┌───────────┴───────────┐
        │  app     (AZ a, AZ b) │  ECS Fargate              sg-ecs: 3000 solo desde sg-alb
        └───────────┬───────────┘
        ┌───────────┴───────────┐
        │  data    (AZ a, AZ b) │  RDS PostgreSQL           sg-rds: 5432 solo desde sg-ecs
        └───────────────────────┘
```

- CIDR `10.0.0.0/16`, una subred `/24` por tipo y por AZ (6 en total).
- `app` es privada pero sale a Internet por el NAT: el backend necesita llegar a Expo Push,
  Firebase y ECR. `data` es aislada: no tiene ninguna ruta a Internet.
- Un solo NAT Gateway compartido para bajar costos del MVP. En producción real se usaría uno por AZ.
- Gateway endpoint de S3 (gratis): el tráfico a S3 no pasa por el NAT.

```bash
npx cdk deploy VpcStack
```

Los recursos quedan expuestos como propiedades del stack (`vpc`, `albSecurityGroup`,
`ecsSecurityGroup`, `rdsSecurityGroup`) para que los usen ECS y ALB desde `bin/mitimiti.ts`.

## Secretos (Secrets Manager)

En producción la API no usa archivos `.env`: lee todo de AWS Secrets Manager.

| Secreto | Contenido | Quién lo crea |
|---|---|---|
| `mitimiti/app` | `JWT_SECRET`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | `SecretsStack` |
| `mitimiti/db` | `username`, `password`, `host`, `port`, `dbname` | `RdsStack` (al crear la base) |

### 1. Crear el secreto de la app

```bash
npx cdk deploy SecretsStack
```

`JWT_SECRET` se genera solo (48 caracteres aleatorios). Las claves de Firebase quedan vacías.

### 2. Cargar las claves de Firebase

Armá un archivo **fuera del repo** (por ejemplo `/tmp/mitimiti-app.json`) con el JWT que ya
generó AWS y las claves de Firebase:

```bash
# Traer el valor actual para no perder el JWT_SECRET generado
aws secretsmanager get-secret-value --secret-id mitimiti/app \
  --query SecretString --output text > /tmp/mitimiti-app.json

# Editar /tmp/mitimiti-app.json y completar los FIREBASE_* ; después:
aws secretsmanager put-secret-value --secret-id mitimiti/app \
  --secret-string file:///tmp/mitimiti-app.json

rm /tmp/mitimiti-app.json
```

CDK no pisa estos valores en deploys posteriores.

### 3. Verificar

```bash
aws secretsmanager get-secret-value --secret-id mitimiti/app --query SecretString --output text
```

Devuelve el JSON con las 4 claves.

### Cómo los consume ECS

En la Task Definition (TASK-08) se inyectan como variables de entorno con
`ecs.Secret.fromSecretsManager(secret, 'CLAVE')`, así el código del backend sigue leyendo
`process.env.JWT_SECRET`, `process.env.DB_HOST`, etc. sin cambios.

> Nunca commitear valores reales en `.env.example`. Ese archivo solo lleva nombres de variables
> y valores de ejemplo.

## Base de datos (RdsStack)

| Parámetro | Valor |
|---|---|
| Motor | PostgreSQL 16 |
| Instancia | `db.t4g.micro` |
| Almacenamiento | 20 GB `gp3`, cifrado |
| Subredes | `data` (aisladas), sin acceso público |
| Security group | `sg-rds` (5432 solo desde `sg-ecs`) |
| Backups | Automáticos, retención de 1 día (máximo del plan gratuito de AWS) |
| Logs | `postgresql` exportado a CloudWatch |
| Al borrar el stack | Snapshot final (`RemovalPolicy.SNAPSHOT`) |
| Multi-AZ | No (costo del MVP). Se activa con `multiAz: true` |

```bash
npx cdk deploy RdsStack   # tarda ~10 minutos
```

Verificar que quedó `Available` y sin acceso público:

```bash
aws rds describe-db-instances --db-instance-identifier mitimiti-db \
  --query "DBInstances[0].[DBInstanceStatus,PubliclyAccessible,Endpoint.Address]"
```

Las credenciales quedan en el secreto `mitimiti/db`:

```bash
aws secretsmanager get-secret-value --secret-id mitimiti/db --query SecretString --output text
```

> RDS para PostgreSQL 16 exige conexiones SSL (`rds.force_ssl = 1`). El pool del backend
> tiene que conectarse con `ssl` habilitado (TASK-06).

## Migración del esquema (DbMigrationStack)

El esquema vive en `backend/src/migrations/schema.sql` (una sola fuente de verdad).
En local, el backend lo aplica al arrancar. En AWS **no**: con 2 o más réplicas en ECS
arrancando a la vez, todas intentarían crear las tablas al mismo tiempo.

En su lugar, una Lambda dentro de la VPC aplica el esquema una sola vez, dentro de una
transacción, y devuelve la lista de tablas.

```bash
npx cdk deploy DbMigrationStack

# Ejecución one-off (repetir solo cuando cambie schema.sql y se vuelva a desplegar el stack)
aws lambda invoke --function-name mitimiti-db-migration \
  --cli-binary-format raw-in-base64-out out.json && cat out.json
```

Respuesta esperada (equivalente a `psql -c "\dt"`, 17 tablas):

```json
{
  "ok": true,
  "tables": [
    "acuerdo_participantes",
    "invitation_tokens",
    "juntada_gastos",
    "juntada_pagos_deudas",
    "juntada_participantes",
    "juntada_subgrupos",
    "juntadas",
    "notificacion_recordatorios_enviados",
    "notificaciones_usuario",
    "perfiles",
    "usuario_device_tokens",
    "usuarios",
    "vivienda_acuerdos",
    "vivienda_gastos",
    "vivienda_miembros",
    "vivienda_servicios",
    "viviendas"
  ],
  "durationMs": 812
}
```

Los logs quedan en CloudWatch, en el log group `/mitimiti/db-migration`.

En ECS, la Task Definition tiene que definir `DB_RUN_MIGRATIONS=false` para que el backend
no ejecute `schema.sql` al arrancar.

## Backend en ECS Fargate (EcrStack + EcsStack)

| Parámetro | Valor |
|---|---|
| Cluster | `mitimiti-cluster` (Container Insights activado) |
| Servicio | `mitimiti-backend`, 2 réplicas en las subredes `app` (una por AZ) |
| Task Definition | `mitimiti-backend`, 256 CPU / 512 MB, x86_64 |
| Imagen | `mitimiti-backend:latest` en ECR (tag configurable con `-c imageTag=<tag>`) |
| Logs | CloudWatch, log group `/mitimiti/ecs/backend`, retención de 30 días |
| Deploys | Rolling update (50 % / 200 %) con circuit breaker y rollback automático |

Variables que recibe el contenedor:

| Variable | Origen |
|---|---|
| `NODE_ENV=production`, `PORT=3000`, `DB_RUN_MIGRATIONS=false`, `DB_SSL=true`, `UPLOADS_DIR=/tmp/uploads` | Texto plano en la Task Definition |
| `JWT_SECRET`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Secreto `mitimiti/app` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Secreto `mitimiti/db` (claves `host`, `port`, `dbname`, `username`, `password`) |

Los secretos se resuelven cuando arranca cada tarea: no quedan en texto plano en la Task
Definition ni en la consola. Si se cambia un secreto, hay que forzar un deploy nuevo para
que las tareas lo tomen.

### Primer despliegue

La imagen tiene que estar en ECR antes de crear el servicio:

```bash
npx cdk deploy EcrStack

# Subir la primera imagen (después lo hace solo el pipeline de CD)
REPO=$(aws ecr describe-repositories --repository-names mitimiti-backend \
  --query "repositories[0].repositoryUri" --output text)
aws ecr get-login-password | docker login --username AWS --password-stdin ${REPO%%/*}
docker build --platform linux/amd64 -t $REPO:latest ../backend
docker push $REPO:latest

npx cdk deploy EcsStack
```

Verificar que las 2 tareas quedaron corriendo:

```bash
aws ecs describe-services --cluster mitimiti-cluster --services mitimiti-backend \
  --query "services[0].[status,runningCount,desiredCount]"
```

Ver logs en vivo: `aws logs tail /mitimiti/ecs/backend --follow`

## Entrada HTTPS (AlbStack)

```text
App Expo ──HTTPS──▶ CloudFront ──HTTP──▶ ALB (public) ──▶ tareas ECS (app) ──▶ RDS (data)
```

- **CloudFront** pone HTTPS con su certificado `*.cloudfront.net` (no hace falta dominio
  ni ACM). Caché desactivada: es una API, todo llega al backend con sus headers
  (`Authorization` incluido). HTTP redirige a HTTPS.
- **ALB** en las subredes públicas, listener en el puerto 80, target group de tipo IP.
- **Health check:** `GET /health` cada 15 s; 2 respuestas 200 seguidas para marcar la tarea
  sana y 2 fallas (503 o timeout de 5 s) para sacarla de rotación.
- Timeout de 60 s en ALB y CloudFront para que el OCR de tickets no corte.

`AlbStack` se despliega antes que `EcsStack`, porque el servicio se registra en su target group:

```bash
npx cdk deploy AlbStack EcsStack
```

La distribución de CloudFront tarda unos 5 minutos en propagarse. Después:

```bash
API=$(aws cloudformation describe-stacks --stack-name AlbStack \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
curl -i $API/health
# HTTP/2 200
# {"status":"ok","db":"connected"}
```

Para la app: `EXPO_PUBLIC_API_URL=<ApiUrl>/api`.

Ver qué réplicas están sanas:

```bash
TG=$(aws elbv2 describe-target-groups --names mitimiti-backend-tg \
  --query "TargetGroups[0].TargetGroupArn" --output text)
aws elbv2 describe-target-health --target-group-arn $TG \
  --query "TargetHealthDescriptions[].[Target.Id,TargetHealth.State]"
```

> Mejora posible: hoy el ALB también se puede llamar directo por HTTP con su DNS. Para
> forzar que todo pase por CloudFront se puede limitar `sg-alb` al prefix list
> `com.amazonaws.global.cloudfront.origin-facing`.

## Almacenamiento de tickets (S3Stack)

Bucket privado para guardar las fotos de tickets y comprobantes sin pasar por el backend:

- **Nombre:** `mitimiti-tickets-<account>` (aislado y único globalmente).
- **Block Public Access:** bloquea todo acceso público a nivel bucket y objetos.
- **Cifrado en reposo:** `S3_MANAGED` (AES-256).
- **Cifrado en tránsito:** `enforceSSL: true` rechaza conexiones HTTP sin TLS.
- **CORS:** permite peticiones directas `PUT` (subida vía URL prefirmada) y `GET` desde la app móvil.
- **Permisos mínimos:** exporta su ARN (`mitimiti-tickets-bucket-arn`) y en `bin/mitimiti.ts` otorga `grantReadWrite` únicamente al `taskRole` de ECS Fargate, inyectando `AWS_BUCKET_NAME` en el contenedor.

## Deploy continuo (GithubOidcStack + `.github/workflows/deploy.yml`)

```text
merge a main ──▶ CI (tests, synth, docker build) ──✅──▶ CD:
   token OIDC de GitHub ──▶ STS: credenciales temporales del rol mitimiti-github-deploy
   docker build ──▶ push a ECR (:<sha> y :latest) ──▶ ecs update-service --force-new-deployment
   ──▶ espera a que las réplicas nuevas pasen el health check
```

- En GitHub **no hay access keys de AWS**. El rol solo lo puede asumir un workflow del repo
  `belenpieroni/mitimitiCloud` corriendo sobre `main` (ni forks ni otras ramas).
- El rol solo puede subir imágenes a `mitimiti-backend` y redeployar el servicio `mitimiti-backend`.
- El CD solo corre si el CI de ese commit pasó. Si la versión nueva no levanta, el circuit
  breaker de ECS vuelve a la anterior y el job queda en rojo.

### Configuración (una sola vez)

```bash
npx cdk deploy GithubOidcStack
# Si la cuenta ya tenía el proveedor OIDC de GitHub, el deploy falla con "already exists":
# npx cdk deploy GithubOidcStack -c githubOidcProviderArn=arn:aws:iam::<cuenta>:oidc-provider/token.actions.githubusercontent.com
```

Copiar el output `DeployRoleArn` en GitHub: **Settings → Secrets and variables → Actions →
Variables → New repository variable**, nombre `AWS_DEPLOY_ROLE_ARN`. (Es un ARN, no un
secreto; va como variable.)

### Primera imagen

Antes de que exista `EcsStack`, se puede correr el workflow a mano (**Actions → CD - Deploy a
ECS → Run workflow**): construye y sube la imagen a ECR y avisa que el servicio todavía no
existe. Después, `npx cdk deploy AlbStack EcsStack`.

### Saber qué versión está desplegada

```bash
aws ecr describe-images --repository-name mitimiti-backend \
  --query "sort_by(imageDetails,&imagePushedAt)[-1].imageTags"
# ["latest", "<sha del commit>"]
```

### Para el resto del equipo

`EcsStack` expone `cluster`, `taskDefinition`, `service`, `taskRole` y `logGroup`:

- **S3 y Textract (Persona 3):** dar permisos al rol de la tarea desde `bin/mitimiti.ts`,
  por ejemplo `bucket.grantReadWrite(compute.taskRole)`.
- **Recordatorios cada 48 hs (Persona 4):** la regla de EventBridge puede lanzar una tarea
  con la misma `taskDefinition` sobreescribiendo el comando (`node src/scripts/...`).
  Mientras el cron siga dentro de `app.js`, corre una vez por réplica (2 veces).
- **Dashboard y alarmas (Persona 5):** usar `compute.service` (métricas de CPU y memoria),
  `edge.loadBalancer` y `edge.targetGroup` (5XX, latencia, `HealthyHostCount`) y el log
  group `/mitimiti/ecs/backend`, que ya tiene 30 días de retención.
- **Pool con SSL (Persona 3, TASK-06):** la tarea ya recibe `DB_SSL=true`. Sin SSL, RDS
  rechaza la conexión y `/health` responde 503.

### Orden completo de despliegue

```bash
npx cdk deploy VpcStack SecretsStack RdsStack DbMigrationStack S3Stack
aws lambda invoke --function-name mitimiti-db-migration out.json && cat out.json

npx cdk deploy EcrStack GithubOidcStack
# Cargar AWS_DEPLOY_ROLE_ARN en GitHub y correr a mano el workflow de CD (sube la primera imagen)

npx cdk deploy AlbStack EcsStack
curl -i https://<ApiUrl>/health
```
