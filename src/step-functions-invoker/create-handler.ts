import { AsyncHandler } from '#/shared/lambda';
import { DynamoDBStreamEvent } from 'aws-lambda';
import Log from '@dazn/lambda-powertools-logger';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

type Dependencies = {
  sfnClient: SFNClient;
  schedulerStateMachineArn: string;
  docClient: DynamoDBClient;
  reservationTableName: string;
};

export const createHandler = (
  deps: Dependencies
): AsyncHandler<DynamoDBStreamEvent, any> => {
  const {
    sfnClient,
    schedulerStateMachineArn,
    docClient,
    reservationTableName,
  } = deps;

  return async (event, _context): Promise<any> => {
    const promises = event.Records.map(async (record) => {
      Log.info('Step Functions Invoker Invoked', { record });

      const item = record.dynamodb?.NewImage;
      if (!item) return Promise.resolve();

      Log.info('item', { item });
      const publishDateTimestamp = parseInt(item.PublishDate.N!, 10);
      Log.info('publishDateTimestamp', { publishDateTimestamp });
      const dueDateTime = dayjs.unix(publishDateTimestamp);
      Log.info('Due DateTime', { dueDateTime });

      const invokerId = item.InvokerID.S!;
      const getItemCmd = new GetItemCommand({
        TableName: reservationTableName,
        Key: {
          PK: {
            S: `INVOKER#${invokerId}`,
          },
          SK: {
            S: `INVOKER#${invokerId}`,
          },
        },
      });

      const invoker = await docClient.send(getItemCmd);

      if (!invoker.Item) {
        Log.error('no invoker was found', { invokerId });
        throw new Error(`no invoker was found for: ${invokerId}`);
      }

      Log.info('fetched invoker item', { item: invoker.Item });
      const invokeLambdaArn = invoker.Item.Arn.S!;

      const input = {
        ...{
          invokeLambdaArn: invokeLambdaArn,
          dueDateTime: dueDateTime.utc().format('YYYY-MM-DDTHH:mm:ss[Z]'),
          messageId: item.ID.S,
        },
        ...(item.Parameters && { parameters: item.Parameters.S }),
      };

      const startExecutionCommand = new StartExecutionCommand({
        stateMachineArn: schedulerStateMachineArn,
        input: JSON.stringify(input),
      });
      return sfnClient.send(startExecutionCommand);
    });

    const results = await Promise.all(promises); // TODO: error handling
    Log.info('state machine invoke results', { results });
  };
};
