#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { config } from '../lib/config';
import { VpcStack } from '../lib/vpc-stack';

const app = new cdk.App();

// Cuenta y región salen del perfil de AWS CLI con el que se ejecuta cdk.
export const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? config.defaultRegion,
};

cdk.Tags.of(app).add('Project', 'MitiMiti');
cdk.Tags.of(app).add('ManagedBy', 'CDK');

export const network = new VpcStack(app, 'VpcStack', { env });

app.synth();
