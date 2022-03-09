import * as xRay from 'aws-xray-sdk-core';
import { RegisterMessageService } from './register-message-service';
import { RegisterMessageFactory } from './register-message-factory';
import { RegisterMessageRepository } from './register-message-repository';
import { createHandler } from './create-handler';
import { ValidateChannelRepository } from './validate-channel-repository';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const { AWS_REGION, DYNAMODB_ENDPOINT, RESERVATION_TABLE_NAME } = process.env;

const docClient = xRay.captureAWSv3Client(new DynamoDBClient({
  region: AWS_REGION,
  endpoint: DYNAMODB_ENDPOINT,
}));

const validateChannelRepository = new ValidateChannelRepository(
  docClient,
  RESERVATION_TABLE_NAME!
);

const registerMessageRepository = new RegisterMessageRepository(
  docClient,
  RESERVATION_TABLE_NAME!
);
const registerMessageFactory = new RegisterMessageFactory(3600);
const registerMessageService = new RegisterMessageService(
  registerMessageFactory,
  registerMessageRepository,
  validateChannelRepository
);

export const handler = createHandler({
  registerMessageService,
});
