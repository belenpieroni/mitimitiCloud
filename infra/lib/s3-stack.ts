import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { config } from './config';

/**
 * Almacenamiento privado de comprobantes y tickets en Amazon S3.
 *
 *  - Nombre: mitimiti-tickets-<account> (garantiza unicidad global en S3)
 *  - Block Public Access (BLOCK_ALL): bloquea todo acceso público a nivel bucket y objetos
 *  - Cifrado en reposo activo: S3_MANAGED (SSE-S3 / AES-256)
 *  - enforceSSL: rechaza cualquier petición no cifrada (HTTP) mediante bucket policy
 *  - Reglas CORS: permite PUT (subida directa vía URL prefirmada) y GET desde la app cliente
 *  - Exportación de CloudFormation: expone el ARN y Nombre para permisos mínimos en IAM (ECS)
 */
export class S3Stack extends cdk.Stack {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.bucket = new s3.Bucket(this, 'TicketsBucket', {
      bucketName: `${config.ticketsBucketPrefix}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      // En entorno de MVP / proyecto académico: permite limpiar el bucket al destruir el stack
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ─── Exportación de Outputs para CloudFormation / IAM ──────────────────────
    new cdk.CfnOutput(this, 'TicketsBucketName', {
      value: this.bucket.bucketName,
      description: 'Nombre del bucket S3 para tickets',
      exportName: `${config.project}-tickets-bucket-name`,
    });

    new cdk.CfnOutput(this, 'TicketsBucketArn', {
      value: this.bucket.bucketArn,
      description: 'ARN del bucket S3 para tickets',
      exportName: `${config.project}-tickets-bucket-arn`,
    });
  }
}
