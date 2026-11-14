import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { config } from './config';

/**
 * Red de Miti Miti en 2 zonas de disponibilidad:
 *
 *  - public   : ALB (y el NAT Gateway).
 *  - app      : tareas ECS Fargate. Privadas, sin IP pública, salen a Internet por el NAT
 *               (necesario para Expo Push, Firebase y para bajar imágenes de ECR).
 *  - data     : RDS. Aisladas, sin ninguna ruta a Internet.

 */
export class VpcStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `${config.project}-vpc`,
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      // Un solo NAT para las 2 AZs: alcanza para el MVP y cuesta la mitad.
      natGateways: 1,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'app', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'data', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
      // Gateway endpoint de S3: gratis y evita que el tráfico a S3 pase por el NAT.
      gatewayEndpoints: {
        S3: { service: ec2.GatewayVpcEndpointAwsService.S3 },
      },
    });

    new cdk.CfnOutput(this, 'VpcId', { value: this.vpc.vpcId });
  }
}
