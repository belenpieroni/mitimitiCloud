import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';
import { config } from './config';

/**
 * Repositorio de imágenes Docker del backend.
 *
 * Va en un stack aparte porque la imagen tiene que existir en ECR ANTES de crear
 * el servicio de ECS: si no, las tareas no arrancan y el deploy de EcsStack falla.
 * Orden: deploy EcrStack -> subir la primera imagen -> deploy EcsStack.
 */
export class EcrStack extends cdk.Stack {
  public readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.repository = new ecr.Repository(this, 'BackendRepo', {
      repositoryName: config.ecrRepositoryName,
      imageScanOnPush: true,
      // Cada deploy sube una imagen nueva: guardamos solo las últimas 10 para no pagar storage de más.
      lifecycleRules: [{ description: 'Conservar las ultimas 10 imagenes', maxImageCount: 10 }],
      // Proyecto académico: al destruir el stack se borran también las imágenes.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    new cdk.CfnOutput(this, 'RepositoryUri', { value: this.repository.repositoryUri });
    new cdk.CfnOutput(this, 'RepositoryName', { value: this.repository.repositoryName });
  }
}
