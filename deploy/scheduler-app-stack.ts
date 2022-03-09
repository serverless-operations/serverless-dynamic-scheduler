import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import { ApiConstruct } from './lib/api';
import * as cr from 'aws-cdk-lib/custom-resources';

type InvokerAlphaProps = {
  webhookUrl: string;
};

interface SchedulerAppProps extends StackProps {
  stage: string;
  reservationTable: dynamodb.Table;
  gsi1IndexName: string;
  logRetentionInDays: number;
  openApi: any;
  invokerAlphaProps: InvokerAlphaProps;
}

type InvokerItem = {
  id: string;
  arn: string;
};

export class SchedulerAppStack extends Stack {
  constructor(scope: Construct, id: string, props: SchedulerAppProps) {
    super(scope, id, props);

    const wait = new sfn.Wait(this, 'WaitState', {
      time: sfn.WaitTime.timestampPath('$.dueDateTime'),
    });

    const lambdaInvokeState = new sfn.CustomState(this, 'LambdaInvokeState', {
      stateJson: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          'FunctionName.$': sfn.JsonPath.stringAt('$.invokeLambdaArn'),
          'Payload.$': sfn.JsonPath.stringAt('$'),
        },
        Retry: [
          {
            ErrorEquals: [
              'Lambda.ServiceException',
              'Lambda.AWSLambdaException',
              'Lambda.SdkClientException',
            ],
            IntervalSeconds: 2,
            MaxAttempts: 6,
            BackoffRate: 2,
          },
        ],
        ResultPath: null,
      },
    });

    const messagePkSk = tasks.DynamoAttributeValue.fromString(
      sfn.JsonPath.format('MESSAGE#{}', sfn.JsonPath.stringAt('$.messageId'))
    );
    const messageStatusToDoneState = new tasks.DynamoUpdateItem(
      this,
      'MessageStatusToDoneState',
      {
        table: props.reservationTable,
        key: {
          PK: messagePkSk,
          SK: messagePkSk,
        },
        updateExpression: 'SET #gsi1pk = :gsi1pk, #status = :status',
        expressionAttributeNames: {
          '#gsi1pk': 'GSI1PK',
          '#status': 'Status',
        },
        expressionAttributeValues: {
          ':gsi1pk': tasks.DynamoAttributeValue.fromString('MESSAGE#DONE'),
          ':status': tasks.DynamoAttributeValue.fromString('DONE'),
        },
      }
    );

    const definition = wait
      .next(lambdaInvokeState)
      .next(messageStatusToDoneState); // TODO: no error handling

    const schedulerStateMachine = new sfn.StateMachine(
      this,
      'SchedulerStateMachine',
      {
        definition,
        stateMachineType: sfn.StateMachineType.STANDARD,
      }
    );

    const stepFunctionsInvokerRole = new iam.Role(this, 'ExecutionLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    const stepFunctionsInvoker = new NodejsFunction(
      this,
      'StepFunctionsInvoker',
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_14_X,
        memorySize: 128,
        entry: 'src/step-functions-invoker/handler.ts',
        handler: 'handler',
        timeout: Duration.minutes(5),
        tracing: lambda.Tracing.ACTIVE,
        environment: {
          SCHEDULER_STATE_MACHINE_ARN: schedulerStateMachine.stateMachineArn,
          RESERVATION_TABLE_NAME: props.reservationTable.tableName,
        },
        logRetention: props.logRetentionInDays,
        bundling: {
          sourceMap: true,
        },
        role: stepFunctionsInvokerRole,
      }
    );
    props.reservationTable.grantStreamRead(stepFunctionsInvoker);
    props.reservationTable.grantReadData(stepFunctionsInvoker);
    schedulerStateMachine.grantStartExecution(stepFunctionsInvoker);

    const sourceMapping = new lambda.EventSourceMapping(
      this,
      'DynamoTableEventSourceMapping',
      {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 5,
        target: stepFunctionsInvoker,
        eventSourceArn: props.reservationTable.tableStreamArn,
        bisectBatchOnError: true,
        retryAttempts: 10,
      }
    );
    const cfnSourceMapping = sourceMapping.node
      .defaultChild as lambda.CfnEventSourceMapping;
    cfnSourceMapping.addPropertyOverride('FilterCriteria', {
      Filters: [
        {
          Pattern: JSON.stringify({
            // Only capture INSERT and MODIFY events whose status is STANDBY"
            dynamodb: {
              NewImage: {
                Type: { S: ['Message'] },
                Status: { S: ['STANDBY'] },
              },
            },
            eventName: ['INSERT', 'MODIFY'],
          }),
        },
      ],
    });

    new ApiConstruct(this, 'Api', {
      logRetentionInDays: props.logRetentionInDays,
      stage: props.stage,
      reservationTable: props.reservationTable,
      openApi: props.openApi,
    });

    const invokerRole = new iam.Role(this, 'InvokerLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });
    const invokerAlpha = new NodejsFunction(this, 'InvokerAlpha', {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_14_X,
      memorySize: 128,
      entry: 'src/invoker-alpha/handler.ts',
      handler: 'handler',
      timeout: Duration.minutes(1),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        SLACK_WEBHOOK_URL: props.invokerAlphaProps.webhookUrl,
      },
      logRetention: props.logRetentionInDays,
      bundling: {
        sourceMap: true,
      },
      role: invokerRole,
    });
    invokerAlpha.grantInvoke(schedulerStateMachine);

    const invokerBeta = new NodejsFunction(this, 'InvokerBeta', {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_14_X,
      memorySize: 128,
      entry: 'src/invoker-beta/handler.ts',
      handler: 'handler',
      timeout: Duration.minutes(1),
      tracing: lambda.Tracing.ACTIVE,
      environment: {},
      logRetention: props.logRetentionInDays,
      bundling: {
        sourceMap: true,
      },
      role: invokerRole,
    });
    invokerBeta.grantInvoke(schedulerStateMachine);

    const invokers: InvokerItem[] = [
      {
        id: 'invoker-alpha',
        arn: invokerAlpha.functionArn,
      },
      {
        id: 'invoker-beta',
        arn: invokerBeta.functionArn,
      },
    ];
    new cr.AwsCustomResource(this, 'LoadDynamoDbData', {
      onUpdate: {
        service: 'DynamoDB',
        action: 'batchWriteItem',
        parameters: {
          RequestItems: {
            [props.reservationTable.tableName]:
              this.generateBatchWriteInvokerItem(invokers),
          },
        },
        physicalResourceId: cr.PhysicalResourceId.of(
          `LoadDynamoDbData-${Date.now().toString()}`
        ), // Update physical id to always fetch the latest data
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });
  }

  private generateBatchWriteInvokerItem(invokers: InvokerItem[]) {
    return invokers.map((invoker) => {
      return {
        PutRequest: {
          Item: {
            PK: { S: `INVOKER#${invoker.id}` },
            SK: { S: `INVOKER#${invoker.id}` },
            Type: { S: 'Invoker' },
            ID: { S: invoker.id },
            Arn: { S: invoker.arn },
          },
        },
      };
    });
  }
}
