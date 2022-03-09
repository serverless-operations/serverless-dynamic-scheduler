import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export interface SchedulerConfig {
  enabled: boolean;
  hour: string;
  minute: string;
}

interface EventsProps extends StackProps {
  stage: string;
  reservationTable: dynamodb.Table;
  logRetentionInDays: number;
  schedulerConfig: SchedulerConfig;
  searchOffsetSeconds: number;
}

export class TriggerStandbyEventsStack extends Stack {
  constructor(scope: Construct, id: string, props: EventsProps) {
    super(scope, id, props);

    const executionLambdaRole = new iam.Role(
      this,
      'TriggerStandbyFunctionRole',
      {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AWSLambdaBasicExecutionRole'
          ),
        ],
      }
    );

    const triggerStandbyFunction = new NodejsFunction(
      this,
      'TriggerStandbyFunction',
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_14_X,
        memorySize: 128,
        entry: 'src/trigger-standby/handler.ts',
        handler: 'handler',
        timeout: Duration.minutes(5),
        tracing: lambda.Tracing.ACTIVE,
        environment: {
          RESERVATION_TABLE_NAME: props.reservationTable.tableName,
          SEARCH_OFFSET_SECONDS: props.searchOffsetSeconds.toString(),
        },
        logRetention: props.logRetentionInDays,
        bundling: {
          sourceMap: true,
        },
        role: executionLambdaRole,
      }
    );
    props.reservationTable.grantReadWriteData(triggerStandbyFunction);

    new events.Rule(this, 'TriggerStandbyEvent', {
      schedule: events.Schedule.cron({
        minute: props.schedulerConfig.minute,
        hour: props.schedulerConfig.hour,
        day: '*',
        month: '*',
        year: '*',
      }),
      enabled: props.schedulerConfig.enabled,
      targets: [new eventsTargets.LambdaFunction(triggerStandbyFunction)],
    });
  }
}
