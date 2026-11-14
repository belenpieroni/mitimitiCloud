# Infraestructura de Miti Miti (AWS CDK)

Toda la infraestructura de AWS está definida como código en TypeScript con AWS CDK v2.
Cada stack se despliega por separado y el estado queda en CloudFormation.

| Stack | Qué crea | Tarea |
|---|---|---|
| `VpcStack` | VPC en 2 AZs, subredes y security groups | TASK-12 |
| `SecretsStack` | Secreto `mitimiti/app` (JWT, Firebase) | TASK-13 |
| `RdsStack` | PostgreSQL 16 gestionado + secreto `mitimiti/db` | TASK-14 |
| `DbMigrationStack` | Lambda que aplica `schema.sql` en RDS | TASK-15 |

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
