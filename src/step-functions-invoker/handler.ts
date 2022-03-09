import * as xRay from 'aws-xray-sdk';
import { AsyncHandler } from '#/shared/lambda';
import { DynamoDBStreamEvent } from 'aws-lambda';
import { SFNClient } from '@aws-sdk/client-sfn';
import { createHandler } from './create-handler';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const { SCHEDULER_STATE_MACHINE_ARN, RESERVATION_TABLE_NAME } = process.env;

const sfnClient = xRay.captureAWSv3Client(new SFNClient({}));
const docClient = xRay.captureAWSv3Client(new DynamoDBClient({}));

export const handler: AsyncHandler<DynamoDBStreamEvent, any> = createHandler({
  schedulerStateMachineArn: SCHEDULER_STATE_MACHINE_ARN!,
  sfnClient,
  docClient,
  reservationTableName: RESERVATION_TABLE_NAME!,
});
