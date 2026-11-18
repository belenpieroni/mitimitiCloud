import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { config } from './config';

export interface GithubOidcStackProps extends cdk.StackProps {
  repository: ecr.IRepository;
}

const GITHUB_OIDC_URL = 'https://token.actions.githubusercontent.com';

/**
 * Permite que GitHub Actions despliegue en AWS sin guardar access keys en GitHub.
 *
 * GitHub emite un token OIDC firmado para cada corrida del workflow. AWS lo valida contra
 * el proveedor OIDC y, solo si viene del repo y la rama configurados, entrega credenciales
 * temporales (1 h) del rol mitimiti-github-deploy.
 *
 * El rol solo puede: subir imágenes al repo de ECR del backend y forzar un deploy del
 * servicio de ECS. Nada más.
 *
 * Si la cuenta ya tiene el proveedor OIDC de GitHub (solo puede haber uno por cuenta),
 * pasar su ARN: npx cdk deploy GithubOidcStack -c githubOidcProviderArn=arn:aws:iam::...
 */
export class GithubOidcStack extends cdk.Stack {
  public readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);

    const existingProviderArn: string | undefined = this.node.tryGetContext('githubOidcProviderArn');
    const provider = existingProviderArn
      ? iam.OidcProviderNative.fromOidcProviderArn(this, 'GithubOidc', existingProviderArn)
      : new iam.OidcProviderNative(this, 'GithubOidc', {
          url: GITHUB_OIDC_URL,
          clientIds: ['sts.amazonaws.com'],
        });

    this.deployRole = new iam.Role(this, 'DeployRole', {
      roleName: `${config.project}-github-deploy`,
      description: `Deploy del backend desde GitHub Actions (${config.githubRepo}, rama ${config.githubDeployBranch})`,
      maxSessionDuration: cdk.Duration.hours(1),
      assumedBy: new iam.OpenIdConnectPrincipal(provider, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          // Solo corridas del repo del equipo sobre main: un fork o una rama cualquiera no puede asumirlo.
          'token.actions.githubusercontent.com:sub': `repo:${config.githubRepo}:ref:refs/heads/${config.githubDeployBranch}`,
        },
      }),
    });

    // Login en ECR + push/pull de imágenes solo en mitimiti-backend.
    props.repository.grantPullPush(this.deployRole);

    // Forzar un deploy nuevo y esperar a que quede estable, solo sobre nuestro servicio.
    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'DeployBackendService',
        actions: ['ecs:UpdateService', 'ecs:DescribeServices'],
        // ARN armado con los nombres de config.ts (no con el objeto del servicio) para que este
        // stack no dependa de EcsStack: así se puede desplegar antes y subir la primera imagen.
        resources: [
          this.formatArn({
            service: 'ecs',
            resource: 'service',
            resourceName: `${config.ecsClusterName}/${config.ecsServiceName}`,
          }),
        ],
      }),
    );

    new cdk.CfnOutput(this, 'DeployRoleArn', {
      value: this.deployRole.roleArn,
      description: 'Cargarlo en GitHub: Settings > Secrets and variables > Actions > Variables > AWS_DEPLOY_ROLE_ARN',
    });
  }
}
