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
 *
 * Security groups encadenados: sg-alb -> sg-ecs (3000) -> sg-rds (5432).
 */
export class VpcStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly ecsSecurityGroup: ec2.SecurityGroup;
  public readonly rdsSecurityGroup: ec2.SecurityGroup;

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

    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc: this.vpc,
      securityGroupName: 'mitimiti-alb-sg',
      description: 'ALB publico: HTTP/HTTPS desde Internet',
      allowAllOutbound: true,
    });
    this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP desde Internet');
    this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS desde Internet');

    this.ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSg', {
      vpc: this.vpc,
      securityGroupName: 'mitimiti-ecs-sg',
      description: 'Tareas ECS: solo reciben trafico del ALB',
      allowAllOutbound: true,
    });
    this.ecsSecurityGroup.addIngressRule(
      this.albSecurityGroup,
      ec2.Port.tcp(config.appPort),
      'Trafico del ALB al backend',
    );

    this.rdsSecurityGroup = new ec2.SecurityGroup(this, 'RdsSg', {
      vpc: this.vpc,
      securityGroupName: 'mitimiti-rds-sg',
      description: 'RDS: solo recibe conexiones de ECS',
      allowAllOutbound: false,
    });
    this.rdsSecurityGroup.addIngressRule(
      this.ecsSecurityGroup,
      ec2.Port.tcp(config.dbPort),
      'PostgreSQL desde ECS',
    );

    new cdk.CfnOutput(this, 'VpcId', { value: this.vpc.vpcId });
    new cdk.CfnOutput(this, 'AlbSecurityGroupId', { value: this.albSecurityGroup.securityGroupId });
    new cdk.CfnOutput(this, 'EcsSecurityGroupId', { value: this.ecsSecurityGroup.securityGroupId });
    new cdk.CfnOutput(this, 'RdsSecurityGroupId', { value: this.rdsSecurityGroup.securityGroupId });
  }
}
