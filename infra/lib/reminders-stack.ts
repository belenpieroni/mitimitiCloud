import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { config } from './config';

export interface RemindersStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  rdsSecurityGroup: ec2.ISecurityGroup;
  /** Secreto mitimiti/db: es el único secreto que lee la Lambda. */
  dbSecret: secretsmanager.ISecret;
}

/**
 * Recordatorios programados.
 *
 * Cada 48 hs, una regla de EventBridge invoca una Lambda dentro de la VPC que hace una
 * pasada de recordatorios (servicios variables, vencimientos y gastos pendientes) y
 * termina. La Lambda bundlea la lógica de backend/src/services/cronService.js, así que no
 * se duplica código, y no depende de EcsStack: corre una única vez por disparo, sin
 * importar cuántas réplicas tenga el servicio ni si el servicio está desplegado.
 */
export class RemindersStack extends cdk.Stack {
  public readonly rule: events.Rule;
  public readonly remindersFunction: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: RemindersStackProps) {
    super(scope, id, props);

    this.remindersFunction = new nodejs.NodejsFunction(this, 'RemindersFn', {
      functionName: `${config.project}-reminders`,
      description: 'Job de recordatorios (backend/src/services/cronService.js), lo invoca EventBridge',
      entry: path.join(__dirname, '..', 'lambda', 'reminders', 'index.ts'),
      handler: 'handler',
      // Bundlear con el esbuild de infra/ (devDependency, así que siempre es local y no Docker).
      // El handler importa ../../../backend/src/...: pg, expo-server-sdk y pino se resuelven
      // desde backend/node_modules, así que en CI hace falta `npm ci` en backend/ antes de
      // `cdk synth`.
      projectRoot: path.join(__dirname, '..'),
      depsLockFilePath: path.join(__dirname, '..', 'package-lock.json'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.minutes(5),
      vpc: props.vpc,
      // Sale por el NAT para llegar a Secrets Manager y a la API de push de Expo.
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      environment: {
        NODE_ENV: 'production',
        DB_SECRET_ARN: props.dbSecret.secretArn,
        // El job recorre la base en serie: con 2 conexiones alcanza (ECS usa 15 por réplica).
        DB_POOL_MAX: '2',
      },
      logGroup: new logs.LogGroup(this, 'RemindersLogs', {
        logGroupName: config.jobLogGroupName,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      bundling: {
        // El SDK v3 ya viene en el runtime de Lambda.
        externalModules: ['@aws-sdk/*'],
      },
    });

    props.dbSecret.grantRead(this.remindersFunction);
    // Regla de entrada en sg-rds: la Lambda puede hablar con PostgreSQL.
    this.remindersFunction.connections.allowTo(
      props.rdsSecurityGroup,
      ec2.Port.tcp(config.dbPort),
      'Job de recordatorios hacia RDS',
    );

    this.rule = new events.Rule(this, 'RemindersRule', {
      ruleName: `${config.project}-reminders`,
      description: 'Invoca la Lambda de recordatorios cada 48 hs',
      schedule: events.Schedule.rate(cdk.Duration.hours(config.remindersEveryHours)),
    });

    this.rule.addTarget(
      new targets.LambdaFunction(this.remindersFunction, {
        // Si EventBridge no logra invocar la Lambda, reintenta durante una hora.
        retryAttempts: 2,
        maxEventAge: cdk.Duration.hours(1),
      }),
    );

    new cdk.CfnOutput(this, 'RemindersRuleName', { value: this.rule.ruleName });
    new cdk.CfnOutput(this, 'RemindersFunctionName', {
      value: this.remindersFunction.functionName,
    });
  }
}
