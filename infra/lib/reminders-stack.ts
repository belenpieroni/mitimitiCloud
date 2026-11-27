import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { config } from './config';

export interface RemindersStackProps extends cdk.StackProps {
  cluster: ecs.ICluster;
  /** Task Definition del backend (EcsStack): el job usa la misma imagen y los mismos secretos. */
  taskDefinition: ecs.FargateTaskDefinition;
  ecsSecurityGroup: ec2.ISecurityGroup;
}

/**
 * Recordatorios programados.
 *
 * Cada 48 hs, una regla de EventBridge lanza una tarea efímera de Fargate con la Task
 * Definition del backend, pero ejecutando `node src/jobs/reminders.js` en lugar del
 * servidor. El job hace una pasada de recordatorios y termina, así que la tarea se apaga
 * sola. Corre una única vez por disparo, sin importar cuántas réplicas tenga el servicio.
 */
export class RemindersStack extends cdk.Stack {
  public readonly rule: events.Rule;

  constructor(scope: Construct, id: string, props: RemindersStackProps) {
    super(scope, id, props);

    this.rule = new events.Rule(this, 'RemindersRule', {
      ruleName: `${config.project}-reminders`,
      description: 'Lanza el job de recordatorios (src/jobs/reminders.js) en Fargate cada 48 hs',
      schedule: events.Schedule.rate(cdk.Duration.hours(config.remindersEveryHours)),
    });

    this.rule.addTarget(
      new targets.EcsTask({
        cluster: props.cluster,
        taskDefinition: props.taskDefinition,
        launchType: ecs.LaunchType.FARGATE,
        taskCount: 1,
        // Mismas subredes y security group que el servicio: llega a RDS y sale a Internet
        // por el NAT para enviar las notificaciones push.
        subnetSelection: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [props.ecsSecurityGroup],
        assignPublicIp: false,
        containerOverrides: [
          {
            containerName: config.containerName,
            command: ['node', 'src/jobs/reminders.js'],
          },
        ],
        // Si EventBridge no logra lanzar la tarea, reintenta durante una hora.
        retryAttempts: 2,
        maxEventAge: cdk.Duration.hours(1),
      }),
    );

    new cdk.CfnOutput(this, 'RemindersRuleName', { value: this.rule.ruleName });
  }
}
