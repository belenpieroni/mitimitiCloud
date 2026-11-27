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
 * Token del endpoint de error 500 para la demo de observabilidad (mitimiti/debug).
 * Va en un secreto aparte: cambiar la plantilla de mitimiti/app lo regeneraría entero
 * (nuevo JWT_SECRET y claves de Firebase vacías).
 *
 * Las credenciales de la base (mitimiti/db) las genera el RdsStack junto con la instancia.
 */
export class SecretsStack extends cdk.Stack {
  public readonly appSecret: secretsmanager.Secret;
  public readonly debugSecret: secretsmanager.Secret;

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

    this.debugSecret = new secretsmanager.Secret(this, 'DebugSecret', {
      secretName: `${config.project}/debug`,
      description: 'Token del endpoint GET /api/debug/error-500 (demo de observabilidad)',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'DEBUG_ERROR_TOKEN',
        passwordLength: 32,
        excludePunctuation: true,
      },
      // Es un token descartable: no hace falta conservarlo si se borra el stack.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new cdk.CfnOutput(this, 'AppSecretArn', { value: this.appSecret.secretArn });
    new cdk.CfnOutput(this, 'AppSecretName', { value: this.appSecret.secretName });
    new cdk.CfnOutput(this, 'DebugSecretName', { value: this.debugSecret.secretName });
  }
}
