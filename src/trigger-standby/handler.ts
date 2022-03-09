import Log from '@dazn/lambda-powertools-logger';
import * as xRay from 'aws-xray-sdk-core';
import { Handler } from 'aws-lambda';
import { TriggerStandbyService } from './trigger-standby-service';
import { TriggerStandbyRepository } from './trigger-standby-repository';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const {
  AWS_REGION,
  DYNAMODB_ENDPOINT,
  RESERVATION_TABLE_NAME,
  SEARCH_OFFSET_SECONDS,
} = process.env;

const docClient = xRay.captureAWSv3Client(
  new DynamoDBClient({
    region: AWS_REGION,
    endpoint: DYNAMODB_ENDPOINT,
  })
);

const triggerStandbyRepository = new TriggerStandbyRepository(
  docClient,
  RESERVATION_TABLE_NAME!
);
const triggerStandbyService = new TriggerStandbyService(
  triggerStandbyRepository,
  parseInt(SEARCH_OFFSET_SECONDS!, 10)
);

export const handler: Handler = async (event): Promise<void> => {
  Log.info('Received Event', { event });
  await triggerStandbyService.execute();
};
