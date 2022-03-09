import { createHandler } from '#/step-functions-invoker/create-handler';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { StartExecutionCommand } from '@aws-sdk/client-sfn';
import { DynamoDBStreamEvent } from 'aws-lambda';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import {
  createReservationTable,
  InvokerItem,
  putInvokers,
} from '../../helpers/dynamodb/reservation-table';
import { generateRandomString } from '../../helpers/utils';
dayjs.extend(utc);

const docClient = new DynamoDBClient({
  region: process.env.AWS_REGION,
  endpoint: process.env.DYNAMODB_ENDPOINT,
});
const tableName = `ReservationMessage--${generateRandomString()}`;
const gsi1IndexName = 'GSI1';

describe('CreateHandler', () => {
  const expectedStateMachineArn = 'some:arn:to:state:machine';

  beforeAll(async () => {
    await createReservationTable(docClient, tableName, gsi1IndexName);
  });

  describe('Handler', () => {
    describe('Success', () => {
      test('Calls step functions with expected lambda arn and due datetime with parameters', async () => {
        // Arrange
        const expectedMessageId = 'some-message-id';
        const expectedPublishDate = '2022-02-16T17:26:04Z';
        const expectedParameters = JSON.stringify({
          message: 'Some Message',
        });

        const expectedInvoker: InvokerItem = {
          id: 'some-invoker-id',
          arn: 'some:arn:to:invoker',
        };
        await putInvokers(docClient, tableName, [expectedInvoker]);

        const mockSfnClient = {
          send: jest.fn(),
        };

        const handler = createHandler({
          schedulerStateMachineArn: expectedStateMachineArn,
          sfnClient: mockSfnClient as any,
          docClient,
          reservationTableName: tableName,
        });

        const ddbStreamEvent: DynamoDBStreamEvent = {
          Records: [
            {
              dynamodb: {
                NewImage: {
                  PublishDate: {
                    N: dayjs(expectedPublishDate).unix().toString(),
                  },
                  InvokerID: {
                    S: expectedInvoker.id,
                  },
                  ID: {
                    S: expectedMessageId,
                  },
                  Parameters: {
                    S: expectedParameters,
                  },
                },
              },
            },
          ],
        };

        // Act
        await handler(ddbStreamEvent, {} as any);

        // Assert
        const actualStartExecutionCommand = mockSfnClient.send.mock
          .calls[0][0] as StartExecutionCommand;
        expect(actualStartExecutionCommand.input.stateMachineArn).toEqual(
          expectedStateMachineArn
        );

        expect(actualStartExecutionCommand.input.input).toEqual(
          JSON.stringify({
            invokeLambdaArn: expectedInvoker.arn,
            dueDateTime: expectedPublishDate,
            messageId: expectedMessageId,
            parameters: expectedParameters,
          })
        );
      });

      test('Calls step functions with expected lambda arn and due datetime without parameters', async () => {
        // Arrange
        const expectedMessageId = 'some-message-id';
        const expectedPublishDate = '2022-02-16T17:26:04Z';

        const expectedInvoker: InvokerItem = {
          id: 'some-invoker-id',
          arn: 'some:arn:to:invoker',
        };
        await putInvokers(docClient, tableName, [expectedInvoker]);

        const mockSfnClient = {
          send: jest.fn(),
        };

        const handler = createHandler({
          schedulerStateMachineArn: expectedStateMachineArn,
          sfnClient: mockSfnClient as any,
          docClient,
          reservationTableName: tableName,
        });

        const ddbStreamEvent: DynamoDBStreamEvent = {
          Records: [
            {
              dynamodb: {
                NewImage: {
                  PublishDate: {
                    N: dayjs(expectedPublishDate).unix().toString(),
                  },
                  InvokerID: {
                    S: expectedInvoker.id,
                  },
                  ID: {
                    S: expectedMessageId,
                  },
                },
              },
            },
          ],
        };

        // Act
        await handler(ddbStreamEvent, {} as any);

        // Assert
        const actualStartExecutionCommand = mockSfnClient.send.mock
          .calls[0][0] as StartExecutionCommand;
        expect(actualStartExecutionCommand.input.stateMachineArn).toEqual(
          expectedStateMachineArn
        );

        expect(actualStartExecutionCommand.input.input).toEqual(
          JSON.stringify({
            invokeLambdaArn: expectedInvoker.arn,
            dueDateTime: expectedPublishDate,
            messageId: expectedMessageId,
          })
        );
      });
    });

    describe('Failure', () => {
      describe('Invalid Invoker ID', () => {
        test('', async () => {
          // Arrange
          const mockSfnClient = {
            send: jest.fn(),
          };

          const handler = createHandler({
            schedulerStateMachineArn: expectedStateMachineArn,
            sfnClient: mockSfnClient as any,
            docClient,
            reservationTableName: tableName,
          });

          const ddbStreamEvent: DynamoDBStreamEvent = {
            Records: [
              {
                dynamodb: {
                  NewImage: {
                    PublishDate: {
                      N: dayjs().unix().toString(),
                    },
                    InvokerID: {
                      S: 'invalid-invoker-id',
                    },
                    ID: {
                      S: 'some-message-id',
                    },
                  },
                },
              },
            ],
          };

          // Act
          const act = handler(ddbStreamEvent, {} as any);

          // Assert
          await expect(act).rejects.toThrow();
          expect(mockSfnClient.send).not.toHaveBeenCalled();
        });
      });
    });
  });
});
