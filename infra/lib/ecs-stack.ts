import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { config } from './config';

export interface EcsStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  ecsSecurityGroup: ec2.ISecurityGroup;
  repository: ecr.IRepository;
  /** mitimiti/app: JWT_SECRET y FIREBASE_*. */
  appSecret: secretsmanager.ISecret;
  /** mitimiti/db: username, password, host, port, dbname (lo genera RDS). */
  dbSecret: secretsmanager.ISecret;
  /** mitimiti/debug: DEBUG_ERROR_TOKEN del endpoint de error 500 de la demo. */
  debugSecret: secretsmanager.ISecret;
  /** Target group del ALB (AlbStack). Si se pasa, el servicio se registra en él. */
  targetGroup?: elbv2.IApplicationTargetGroup;
}

/**
 * Backend de Miti Miti en ECS Fargate.
 *
 *  - Cluster mitimiti-cluster
 *  - Task Definition de 256 CPU / 512 MB con la imagen de ECR
 *  - Servicio con 2 réplicas en las subredes privadas "app" (una por AZ), sin IP pública
 *  - Secretos de Secrets Manager inyectados como variables de entorno al arrancar la tarea
 *    (nunca quedan en texto plano en la Task Definition)
 *
 * La imagen se toma con el tag de contexto `imageTag` (por defecto "latest").
 * El pipeline de CD sube una imagen nueva con tag latest y fuerza un nuevo deploy del servicio.
 */
export class EcsStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly taskDefinition: ecs.FargateTaskDefinition;
  public readonly container: ecs.ContainerDefinition;
  public readonly service: ecs.FargateService;
  /** Rol que asume el código del backend. Persona 3 le da permisos de S3 y Textract. */
  public readonly taskRole: iam.IRole;
  public readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    const imageTag = this.node.tryGetContext('imageTag') ?? 'latest';

    this.cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: config.ecsClusterName,
      vpc: props.vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    this.logGroup = new logs.LogGroup(this, 'BackendLogs', {
      logGroupName: config.backendLogGroupName,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      family: `${config.project}-backend`,
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });
    this.taskRole = this.taskDefinition.taskRole;

    this.container = this.taskDefinition.addContainer('Backend', {
      containerName: config.containerName,
      image: ecs.ContainerImage.fromEcrRepository(props.repository, imageTag),
      portMappings: [{ containerPort: config.appPort, protocol: ecs.Protocol.TCP }],
      logging: ecs.LogDrivers.awsLogs({ logGroup: this.logGroup, streamPrefix: 'backend' }),
      environment: {
        NODE_ENV: 'production',
        PORT: String(config.appPort),
        // El esquema lo aplica la Lambda one-off (DbMigrationStack), no cada réplica al arrancar.
        DB_RUN_MIGRATIONS: 'false',
        // RDS PostgreSQL 16 exige SSL. El pool lo lee en TASK-06 (MT-10).
        DB_SSL: 'true',
        UPLOADS_DIR: '/tmp/uploads',
        // Los recordatorios los lanza EventBridge como tarea aparte (RemindersStack):
        // si el cron siguiera dentro de la API, cada réplica enviaría los mismos avisos.
        REMINDERS_CRON_ENABLED: 'false',
      },
      secrets: {
        JWT_SECRET: ecs.Secret.fromSecretsManager(props.appSecret, 'JWT_SECRET'),
        FIREBASE_PROJECT_ID: ecs.Secret.fromSecretsManager(props.appSecret, 'FIREBASE_PROJECT_ID'),
        FIREBASE_CLIENT_EMAIL: ecs.Secret.fromSecretsManager(props.appSecret, 'FIREBASE_CLIENT_EMAIL'),
        FIREBASE_PRIVATE_KEY: ecs.Secret.fromSecretsManager(props.appSecret, 'FIREBASE_PRIVATE_KEY'),
        DB_HOST: ecs.Secret.fromSecretsManager(props.dbSecret, 'host'),
        DB_PORT: ecs.Secret.fromSecretsManager(props.dbSecret, 'port'),
        DB_NAME: ecs.Secret.fromSecretsManager(props.dbSecret, 'dbname'),
        DB_USER: ecs.Secret.fromSecretsManager(props.dbSecret, 'username'),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(props.dbSecret, 'password'),
        DEBUG_ERROR_TOKEN: ecs.Secret.fromSecretsManager(props.debugSecret, 'DEBUG_ERROR_TOKEN'),
      },
      // Tiempo para que el backend cierre conexiones al recibir SIGTERM en un deploy.
      stopTimeout: cdk.Duration.seconds(30),
    });

    this.service = new ecs.FargateService(this, 'Service', {
      serviceName: config.ecsServiceName,
      cluster: this.cluster,
      taskDefinition: this.taskDefinition,
      desiredCount: config.desiredCount,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [props.ecsSecurityGroup],
      assignPublicIp: false,
      // Rolling update: nunca baja de 1 réplica sana y puede levantar 2 nuevas a la vez.
      minHealthyPercent: 50,
      maxHealthyPercent: 200,
      // Si la versión nueva no arranca, ECS vuelve solo a la anterior.
      circuitBreaker: { enable: true, rollback: true },
      // Permite `aws ecs execute-command` para debug en la defensa.
      enableExecuteCommand: true,
      // Tiempo para que Node arranque y conecte a RDS antes de que cuente el health check del ALB.
      healthCheckGracePeriod: props.targetGroup ? cdk.Duration.seconds(60) : undefined,
    });

    if (props.targetGroup) {
      this.service.attachToApplicationTargetGroup(props.targetGroup);
    }

    new cdk.CfnOutput(this, 'ClusterName', { value: this.cluster.clusterName });
    new cdk.CfnOutput(this, 'ServiceName', { value: this.service.serviceName });
    new cdk.CfnOutput(this, 'TaskDefinitionFamily', { value: this.taskDefinition.family });
    new cdk.CfnOutput(this, 'TaskRoleArn', { value: this.taskRole.roleArn });
    new cdk.CfnOutput(this, 'LogGroupName', { value: this.logGroup.logGroupName });
  }
}
