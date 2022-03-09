#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SchedulerAppStack } from './scheduler-app-stack';
import { SchedulerDynamoStack } from './scheduler-dynamo-stack';
import { TriggerStandbyEventsStack } from './scheduler-events-stack';
import SwaggerParser from '@apidevtools/swagger-parser';
import { context } from '../cdk.json';
import 'dotenv/config';

const org = 'org';
const app = 'scheduler';
const {
  STAGE = 'dev',
  AWS_REGION = 'ap-northeast-1',
  INVOKER_ALPHA_WEBHOOK_URL,
} = process.env;

if (!INVOKER_ALPHA_WEBHOOK_URL) {
  throw new Error('Environment variable INVOKER_ALPHA_WEBHOOK_URL is not set.');
}

const prefix = `${org}-${app}-${STAGE}`;

async function createApp(): Promise<cdk.App> {
  const app = new cdk.App();

  const {
    logRetentionInDays,
    dynamoDbConfig,
    schedulerConfig,
    triggerStandbyConfig,
  }: typeof context.dev =
    app.node.tryGetContext(STAGE) || app.node.tryGetContext('dev');

  const dynamoDbStack = new SchedulerDynamoStack(
    app,
    `${prefix}-SchedulerDynamoStack`,
    {
      stage: STAGE,
      env: {
        region: AWS_REGION,
      },
      dynamoDbConfig,
    }
  );

  new TriggerStandbyEventsStack(app, `${prefix}-TriggerStandbyEventsStack`, {
    stage: STAGE,
    env: {
      region: AWS_REGION,
    },
    logRetentionInDays,
    reservationTable: dynamoDbStack.reservationTable,
    schedulerConfig,
    searchOffsetSeconds: triggerStandbyConfig.searchOffsetSeconds,
  });

  const openApi = await SwaggerParser.dereference(
    `${__dirname}/api-definition.yaml`
  );
  new SchedulerAppStack(app, `${prefix}-SchedulerAppStack`, {
    stage: STAGE,
    env: {
      region: AWS_REGION,
    },
    openApi,
    logRetentionInDays,
    reservationTable: dynamoDbStack.reservationTable,
    gsi1IndexName: dynamoDbStack.gsi1IndexName,
    invokerAlphaProps: {
      webhookUrl: INVOKER_ALPHA_WEBHOOK_URL!,
    },
  });

  return app;
}

createApp();
