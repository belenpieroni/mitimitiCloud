import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { config } from './config';

export interface DbMigrationStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  rdsSecurityGroup: ec2.ISecurityGroup;
  dbSecret: secretsmanager.ISecret;
}

/**
 * Lambda dentro de la VPC que aplica schema.sql en RDS.
 * Se invoca a mano (one-off), así las réplicas de ECS no compiten
 * por crear las tablas al arrancar.
 */
export class DbMigrationStack extends cdk.Stack {
  public readonly migrationFunction: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: DbMigrationStackProps) {
    super(scope, id, props);

    const schemaPath = path.join(__dirname, '..', '..', 'backend', 'src', 'migrations', 'schema.sql');

    this.migrationFunction = new nodejs.NodejsFunction(this, 'DbMigrationFn', {
      functionName: `${config.project}-db-migration`,
      description: 'Aplica backend/src/migrations/schema.sql en RDS (ejecucion one-off)',
      entry: path.join(__dirname, '..', 'lambda', 'db-migration', 'index.ts'),
      handler: 'handler',
      // Bundlear con las dependencias de infra/, no con las de la app Expo de la raíz.
      projectRoot: path.join(__dirname, '..'),
      depsLockFilePath: path.join(__dirname, '..', 'package-lock.json'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.minutes(2),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      environment: {
        DB_SECRET_ARN: props.dbSecret.secretArn,
      },
      logGroup: new logs.LogGroup(this, 'DbMigrationLogs', {
        logGroupName: `/mitimiti/db-migration`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      bundling: {
        // El SDK v3 ya viene en el runtime de Lambda.
        externalModules: ['@aws-sdk/*'],
        // Copiamos el schema.sql del backend: una sola fuente de verdad.
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (_inputDir: string, outputDir: string) => [
            `cp "${schemaPath}" "${outputDir}/schema.sql"`,
          ],
        },
      },
    });

    props.dbSecret.grantRead(this.migrationFunction);
    // Regla de entrada en sg-rds: la Lambda puede hablar con PostgreSQL.
    this.migrationFunction.connections.allowTo(
      props.rdsSecurityGroup,
      ec2.Port.tcp(config.dbPort),
      'Migracion one-off hacia RDS',
    );

    new cdk.CfnOutput(this, 'MigrationFunctionName', {
      value: this.migrationFunction.functionName,
    });
  }
}
