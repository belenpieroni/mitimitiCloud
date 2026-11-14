import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { config } from './config';

/**
 * Secretos de la aplicación (mitimiti/app).
 *
 * - JWT_SECRET se genera automáticamente al crear el secreto.
 * - Las claves de Firebase quedan vacías y se cargan a mano con la CLI
 *   (ver infra/README.md). CDK no las pisa en deploys posteriores.
 *
 * Las credenciales de la base (mitimiti/db) las genera el RdsStack junto con la instancia.
 */
export class SecretsStack extends cdk.Stack {
  public readonly appSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.appSecret = new secretsmanager.Secret(this, 'AppSecret', {
      secretName: `${config.project}/app`,
      description: 'Secretos de la API de Miti Miti (JWT y Firebase)',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          FIREBASE_PROJECT_ID: '',
          FIREBASE_CLIENT_EMAIL: '',
          FIREBASE_PRIVATE_KEY: '',
        }),
        generateStringKey: 'JWT_SECRET',
        passwordLength: 48,
        excludePunctuation: true,
      },
      // Si se borra el stack por error, el secreto queda y se puede recuperar.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new cdk.CfnOutput(this, 'AppSecretArn', { value: this.appSecret.secretArn });
    new cdk.CfnOutput(this, 'AppSecretName', { value: this.appSecret.secretName });
  }
}
