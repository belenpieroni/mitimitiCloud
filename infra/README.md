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
