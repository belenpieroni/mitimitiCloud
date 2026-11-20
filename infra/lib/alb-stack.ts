import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';
import { config } from './config';

export interface AlbStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  albSecurityGroup: ec2.ISecurityGroup;
}

/**
 * Entrada pública de la API:
 *
 *   App Expo --HTTPS--> CloudFront --HTTP--> ALB (subredes public) --> tareas ECS (subredes app)
 *
 * - CloudFront da HTTPS con su certificado *.cloudfront.net, así no hace falta comprar un
 *   dominio ni emitir un certificado en ACM. No cachea nada: todo va al backend.
 * - El ALB reparte entre las réplicas y solo manda tráfico a las que responden 200 en /health.
 *
 * El target group se crea acá y el servicio de ECS se registra en él desde EcsStack.
 */
export class AlbStack extends cdk.Stack {
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly listener: elbv2.ApplicationListener;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: AlbStackProps) {
    super(scope, id, props);

    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      loadBalancerName: `${config.project}-alb`,
      vpc: props.vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: props.albSecurityGroup,
      // Textract puede tardar varios segundos en procesar un ticket.
      idleTimeout: cdk.Duration.seconds(60),
    });

    this.targetGroup = new elbv2.ApplicationTargetGroup(this, 'BackendTg', {
      targetGroupName: `${config.project}-backend-tg`,
      vpc: props.vpc,
      port: config.appPort,
      protocol: elbv2.ApplicationProtocol.HTTP,
      // Fargate usa awsvpc: cada tarea tiene su propia IP.
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/health',
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(15),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 2,
      },
      // En un deploy, el ALB espera 30 s a que terminen los requests en curso antes de soltar la tarea.
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    this.listener = this.loadBalancer.addListener('Http', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [this.targetGroup],
    });

    this.distribution = new cloudfront.Distribution(this, 'ApiDistribution', {
      comment: 'Miti Miti API (HTTPS delante del ALB)',
      defaultBehavior: {
        origin: new origins.LoadBalancerV2Origin(this.loadBalancer, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          readTimeout: cdk.Duration.seconds(60),
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        // Es una API: nada de caché, y pasan todos los headers (Authorization incluido),
        // query strings y cookies al backend.
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
      // Solo edge locations de América y Europa: más barato y alcanza para Argentina.
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    });

    new cdk.CfnOutput(this, 'AlbDnsName', { value: this.loadBalancer.loadBalancerDnsName });
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'URL pública de la API. En la app: EXPO_PUBLIC_API_URL=<ApiUrl>/api',
    });
    new cdk.CfnOutput(this, 'DistributionId', { value: this.distribution.distributionId });
  }
}
