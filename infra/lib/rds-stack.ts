import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { config } from './config';

export interface RdsStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  rdsSecurityGroup: ec2.ISecurityGroup;
}

/**
 * PostgreSQL 16 gestionado en las subredes aisladas (data), sin acceso público.
 * Las credenciales se generan en Secrets Manager como mitimiti/db
 * (JSON con username, password, host, port, dbname).
 */
export class RdsStack extends cdk.Stack {
  public readonly instance: rds.DatabaseInstance;
  public readonly dbSecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: RdsStackProps) {
    super(scope, id, props);

    this.instance = new rds.DatabaseInstance(this, 'Postgres', {
      instanceIdentifier: `${config.project}-db`,
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_9,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.rdsSecurityGroup],
      publiclyAccessible: false,
      port: config.dbPort,

      databaseName: config.dbName,
      credentials: rds.Credentials.fromGeneratedSecret(config.dbUser, {
        secretName: `${config.project}/db`,
      }),

      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,

      backupRetention: cdk.Duration.days(7),
      preferredBackupWindow: '06:00-06:30', // 03:00 ART
      // Single-AZ para el MVP (costo). Para producción real: multiAz: true.
      multiAz: false,
      autoMinorVersionUpgrade: true,
      cloudwatchLogsExports: ['postgresql'],

      // Al destruir el stack se toma un snapshot final en lugar de perder los datos.
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      deletionProtection: false,
    });

    this.dbSecret = this.instance.secret!;

    new cdk.CfnOutput(this, 'DbEndpoint', { value: this.instance.dbInstanceEndpointAddress });
    new cdk.CfnOutput(this, 'DbPort', { value: this.instance.dbInstanceEndpointPort });
    new cdk.CfnOutput(this, 'DbSecretName', { value: `${config.project}/db` });
  }
}
