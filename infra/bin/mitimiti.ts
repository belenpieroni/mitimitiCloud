#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { config } from '../lib/config';
import { VpcStack } from '../lib/vpc-stack';
import { SecretsStack } from '../lib/secrets-stack';
import { RdsStack } from '../lib/rds-stack';
import { DbMigrationStack } from '../lib/db-migration-stack';
import { EcrStack } from '../lib/ecr-stack';
import { EcsStack } from '../lib/ecs-stack';
import { AlbStack } from '../lib/alb-stack';
import { GithubOidcStack } from '../lib/github-oidc-stack';
import { S3Stack } from '../lib/s3-stack';

const app = new cdk.App();

// Cuenta y región salen del perfil de AWS CLI con el que se ejecuta cdk.
export const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? config.defaultRegion,
};

cdk.Tags.of(app).add('Project', 'MitiMiti');
cdk.Tags.of(app).add('ManagedBy', 'CDK');

export const network = new VpcStack(app, 'VpcStack', { env });

export const secrets = new SecretsStack(app, 'SecretsStack', { env });

export const database = new RdsStack(app, 'RdsStack', {
  env,
  vpc: network.vpc,
  rdsSecurityGroup: network.rdsSecurityGroup,
});

new DbMigrationStack(app, 'DbMigrationStack', {
  env,
  vpc: network.vpc,
  rdsSecurityGroup: network.rdsSecurityGroup,
  dbSecret: database.dbSecret,
});

export const registry = new EcrStack(app, 'EcrStack', { env });

export const edge = new AlbStack(app, 'AlbStack', {
  env,
  vpc: network.vpc,
  albSecurityGroup: network.albSecurityGroup,
});

export const storage = new S3Stack(app, 'S3Stack', { env });

export const compute = new EcsStack(app, 'EcsStack', {
  env,
  vpc: network.vpc,
  ecsSecurityGroup: network.ecsSecurityGroup,
  repository: registry.repository,
  appSecret: secrets.appSecret,
  dbSecret: database.dbSecret,
  targetGroup: edge.targetGroup,
});

// Permisos mínimos de S3 para el backend (generación de URLs prefirmadas y lectura para Textract)
storage.bucket.grantReadWrite(compute.taskRole);

// Pasamos el nombre del bucket como variable de entorno al contenedor de ECS
compute.container.addEnvironment('AWS_BUCKET_NAME', storage.bucket.bucketName);

new GithubOidcStack(app, 'GithubOidcStack', {
  env,
  repository: registry.repository,
});

app.synth();