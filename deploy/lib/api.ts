import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apig from 'aws-cdk-lib/aws-apigatewayv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

/** https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-swagger-extensions-cors-configuration.html */
interface ApiGatewayCorsSetting {
  allowOrigins: string[];
  allowCredentials: boolean;
  allowMethods: string[];
  allowHeaders: string[];
  exposeHeaders: string[];
  maxAge: number;
}

/** https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-swagger-extensions-integration.html */
interface ApiGatewayIntegrationSetting {
  type: string;
  httpMethod: string;
  uri: string;
  payloadFormatVersion: string;
}

interface ApiProps {
  stage: string;
  openApi: any;
  logRetentionInDays: number;
  reservationTable: dynamodb.Table;
}

export class ApiConstruct extends Construct {
  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    const apiFunction = this.createApiFunction(this, props);

    this.finalizeOpenApiForApiGateway(props, apiFunction.functionArn);

    const api = new apig.CfnApi(this, 'HttpApi', {
      body: props.openApi,
    });

    apiFunction.addPermission('ApiGatewayInvokeFunctionPermission', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: `arn:aws:execute-api:${cdk.Stack.of(this).region}:${
        cdk.Stack.of(this).account
      }:${api.ref}/*/*/*`,
    });

    const role = new iam.Role(this, 'RestApiAuthHandlerRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
    });
    const assumePolicy = new iam.Policy(this, 'StsAssumeForApigateway', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: ['*'],
        }),
      ],
    });
    role.attachInlinePolicy(assumePolicy);
    apiFunction.grantInvoke(role);

    const apiLogGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      retention: props.logRetentionInDays,
    });
    new apig.CfnStage(this, 'Scheduler-Service', {
      apiId: api.ref,
      stageName: '$default',
      autoDeploy: true,
      accessLogSettings: {
        destinationArn: apiLogGroup.logGroupArn,
        format: JSON.stringify({
          requestId: '$context.requestId',
          ip: '$context.identity.sourceIp',
          requestTime: '$context.requestTime',
          httpMethod: '$context.httpMethod',
          path: '$context.path',
          routeKey: '$context.routeKey',
          status: '$context.status',
          protocol: '$context.protocol',
          error: {
            message: '$context.error.message',
            responseType: '$context.error.responseType',
          },
        }),
      },
    });
  }

  private createApiFunction(
    scope: Construct,
    props: ApiProps
  ): lambda.Function {
    const apiExecutionLambdaRole = new iam.Role(
      scope,
      `apiExecutionLambdaRole-${props.stage}`,
      {
        roleName: `apiExecutionLambdaRole-${props.stage}`,
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AWSLambdaBasicExecutionRole'
          ),
        ],
      }
    );

    const apiFunction = new NodejsFunction(scope, 'ApiFunction', {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_14_X,
      memorySize: 128,
      entry: 'src/api/handler.ts',
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        RESERVATION_TABLE_NAME: props.reservationTable.tableName,
        STAGE: props.stage,
      },
      logRetention: props.logRetentionInDays,
      bundling: {
        sourceMap: true,
      },
      role: apiExecutionLambdaRole,
    });
    props.reservationTable.grantReadWriteData(apiFunction);

    return apiFunction;
  }

  private finalizeOpenApiForApiGateway(
    props: ApiProps,
    apiFunctionArn: string
  ): void {
    props.openApi['info'][
      'description'
    ] = `Scheduler Service API Stage: ${props.stage}`;

    const corsSetting: ApiGatewayCorsSetting = {
      allowOrigins: ['*'],
      allowCredentials: false,
      allowMethods: ['POST', 'OPTIONS', 'GET', 'PUT', 'DELETE', 'PATCH'],
      allowHeaders: [
        'Content-Type',
        'X-Amz-Date',
        'Authorization',
        'X-Api-Key',
        'X-Amz-Security-Token',
        'X-Amz-User-Agent',
        'X-Requested-With',
      ],
      exposeHeaders: [
        'Content-Type',
        'X-Amz-Date',
        'Authorization',
        'X-Api-Key',
        'X-Amz-Security-Token',
        'X-Amz-User-Agent',
        'X-Requested-With',
      ],
      maxAge: 3600,
    };
    props.openApi['x-amazon-apigateway-cors'] = corsSetting;

    const integrationSetting: ApiGatewayIntegrationSetting = {
      type: 'AWS_PROXY',
      httpMethod: 'POST',
      uri: apiFunctionArn,
      payloadFormatVersion: '1.0',
    };

    Object.entries(props.openApi.paths).forEach(([path]) => {
      Object.entries(props.openApi.paths[path]).forEach(([method]) => {
        props.openApi.paths[path][method]['x-amazon-apigateway-integration'] =
          integrationSetting;
      });
    });
  }
}
