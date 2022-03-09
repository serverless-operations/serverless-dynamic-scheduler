/* eslint-disable @typescript-eslint/no-empty-function */
import { APIGatewayEvent, APIGatewayProxyResult, Handler } from 'aws-lambda';
import { generateAPIGatewayEvent } from '../../helpers/api-gateway';
import { generateRandomString } from '../../helpers/utils';
import {
  createReservationTable,
  deleteTable,
  getMessageById,
  InvokerItem,
  putInvokers,
} from '../../helpers/dynamodb/reservation-table';
import { RegisterMessageRepository } from '#/api/register-message-repository';
import { RegisterMessageFactory } from '#/api/register-message-factory';
import { RegisterMessageService } from '#/api/register-message-service';
import { createHandler } from '#/api/create-handler';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import MockDate from 'mockdate';
import { AsyncHandler } from '#/shared/lambda';
import { ValidateChannelRepository } from '#/api/validate-channel-repository';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
dayjs.extend(utc);
dayjs.extend(timezone);

const docClient = new DynamoDBClient({
  region: process.env.AWS_REGION,
  endpoint: process.env.DYNAMODB_ENDPOINT,
});
const tableName = `ReservationMessage--${generateRandomString()}`;
const gsi1IndexName = 'GSI1';

describe('POST /messages', (): void => {
  const event: APIGatewayEvent = generateAPIGatewayEvent('POST', '/messages');
  const standbyCheckIntervalTimestamp = 3600;
  let handler: AsyncHandler<APIGatewayEvent, any>;

  beforeEach(async () => {
    const validateChannelRepository = new ValidateChannelRepository(
      docClient,
      tableName
    );
    const registerMessageRepository = new RegisterMessageRepository(
      docClient,
      tableName
    );
    const registerMessageFactory = new RegisterMessageFactory(
      standbyCheckIntervalTimestamp
    );
    const registerMessageService = new RegisterMessageService(
      registerMessageFactory,
      registerMessageRepository,
      validateChannelRepository
    );
    handler = createHandler({ registerMessageService });

    await createReservationTable(docClient, tableName, gsi1IndexName);
  });

  afterEach(async () => {
    await deleteTable(docClient, tableName);
  });

  describe('Success', () => {
    const validInvokerItem: InvokerItem = {
      id: 'some-id',
      arn: 'some:arn:to:the:invoker',
    };

    beforeEach(async () => {
      await putInvokers(docClient, tableName, [validInvokerItem]);
    });

    describe('Publish date shorter than the standbyCheckInterval', () => {
      test('should register a message as STANDBY', async () => {
        // Arrange
        const now = dayjs('2022-02-08');

        // make the publishTime shorter than the standbyCheckIntervalTimestamp
        const expectedPublishTime = now.add(
          standbyCheckIntervalTimestamp - 1,
          'second'
        );

        const expectedParameters = {
          message: 'some-message',
        };

        MockDate.set(now.toDate());
        event.body = JSON.stringify({
          publishTime: expectedPublishTime.unix(),
          channel: validInvokerItem.id,
          parameters: expectedParameters,
        });

        // Act
        const result: APIGatewayProxyResult = await handler(event, {} as any);

        // Assert
        const resultBody = JSON.parse(result.body);

        const actual = await getMessageById(
          docClient,
          tableName,
          resultBody.id
        );

        expect(result.statusCode).toEqual(201);
        expect(actual?.Status.S).toEqual('STANDBY');
        expect(actual?.PublishDate.N).toEqual(
          expectedPublishTime.unix().toString()
        );
        expect(actual?.InvokerID.S).toEqual(validInvokerItem.id);
        expect(actual?.Parameters.S).toEqual(
          JSON.stringify(expectedParameters)
        );
      });
    });

    describe('Publish date is equal to or longer than the standbyCheckInterval', () => {
      test('should register a message as RESERVED if the publish date is equal to or longer than the standbyCheckInterval', async () => {
        // Arrange
        const now = dayjs('2022-02-08');

        // make the publishTime equal to the standbyCheckIntervalTimestamp
        const expectedPublishTime = now.add(
          standbyCheckIntervalTimestamp,
          'second'
        );

        MockDate.set(now.toDate());
        event.body = JSON.stringify({
          publishTime: expectedPublishTime.unix(),
          channel: validInvokerItem.id,
        });

        // Act
        const result: APIGatewayProxyResult = await handler(event, {} as any);

        // Assert
        const resultBody = JSON.parse(result.body);

        const actual = await getMessageById(
          docClient,
          tableName,
          resultBody.id
        );

        expect(result.statusCode).toEqual(201);
        expect(actual?.Status.S).toEqual('RESERVED');
        expect(actual?.PublishDate.N).toEqual(
          expectedPublishTime.unix().toString()
        );
        expect(actual?.InvokerID.S).toEqual(validInvokerItem.id);
        expect(actual?.Parameters).toBeUndefined();
      });
    });
  });

  describe('Failure', () => {
    describe('Invalid channel in request', () => {
      test('should return a 400 response', async () => {
        // Arrange
        event.body = JSON.stringify({
          publishTime: dayjs().unix(),
          channel: 'invalid-channel',
        });

        // Act
        const result: APIGatewayProxyResult = await handler(event, {} as any);

        // Assert
        const resultBody = JSON.parse(result.body);

        expect(result.statusCode).toEqual(400);
      });
    });
  });
});
