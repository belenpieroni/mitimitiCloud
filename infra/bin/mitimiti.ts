#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { config } from '../lib/config';
import { VpcStack } from '../lib/vpc-stack';
import { SecretsStack } from '../lib/secrets-stack';
import { RdsStack } from '../lib/rds-stack';
import { DbMigrationStack } from '../lib/db-migration-stack';

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

app.synth();
