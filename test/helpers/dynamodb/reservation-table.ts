import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  GetItemCommand,
  ListTablesCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';

export const createReservationTable = async (
  docClient: DynamoDBClient,
  tableName: string,
  gsi1IndexName: string
): Promise<void> => {
  const createTableCmd = new CreateTableCommand({
    TableName: tableName,
    KeySchema: [
      {
        AttributeName: 'PK',
        KeyType: 'HASH',
      },
      {
        AttributeName: 'SK',
        KeyType: 'RANGE',
      },
    ],
    AttributeDefinitions: [
      {
        AttributeName: 'PK',
        AttributeType: 'S',
      },
      {
        AttributeName: 'SK',
        AttributeType: 'S',
      },
      {
        AttributeName: 'GSI1PK',
        AttributeType: 'S',
      },
      {
        AttributeName: 'GSI1SK',
        AttributeType: 'S',
      },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: gsi1IndexName,
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
        ],
        Projection: {
          ProjectionType: 'ALL',
        },
        ProvisionedThroughput: {
          ReadCapacityUnits: 10,
          WriteCapacityUnits: 10,
        },
      },
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 10,
      WriteCapacityUnits: 10,
    },
  });
  await docClient.send(createTableCmd);
};

export const deleteTable = async (
  docClient: DynamoDBClient,
  tableName: string
): Promise<void> => {
  const listTablesCmd = new ListTablesCommand({});
  const response = await docClient.send(listTablesCmd);
  if (response && response.TableNames) {
    const tableExist = response.TableNames.find((table) => table === tableName);
    if (tableExist) {
      const deleteTableCmd = new DeleteTableCommand({
        TableName: tableName,
      });

      await docClient.send(deleteTableCmd);
    }
  }
};

export type MessageItem = {
  id: string;
  status: string;
  publishDate: number;
};

export const getMessageById = async (
  docClient: DynamoDBClient,
  tableName: string,
  id: string
) => {
  const getItemCmd = new GetItemCommand({
    TableName: tableName,
    Key: {
      PK: { S: `MESSAGE#${id}` },
      SK: { S: `MESSAGE#${id}` },
    },
  });
  const result = await docClient.send(getItemCmd);
  return result.Item;
};

export const putMessages = async (
  docClient: DynamoDBClient,
  tableName: string,
  messages: MessageItem[]
) => {
  const promises = messages.map((msg) => {
    const putItemCmd = new PutItemCommand({
      TableName: tableName,
      Item: {
        PK: { S: `MESSAGE#${msg.id}` },
        SK: { S: `MESSAGE#${msg.id}` },
        Type: { S: 'Message' },
        ID: { S: msg.id },
        Status: { S: msg.status },
        PublishDate: { N: msg.publishDate.toString() },
        GSI1PK: { S: `MESSAGE#${msg.status}` },
        GSI1SK: { S: `MESSAGE#${msg.publishDate}` },
      },
    });
    return docClient.send(putItemCmd);
  });

  await Promise.all(promises);
};

export type InvokerItem = {
  id: string;
  arn: string;
};

export const putInvokers = async (
  docClient: DynamoDBClient,
  tableName: string,
  invokers: InvokerItem[]
) => {
  const promises = invokers.map((invoker) => {
    const putItemCmd = new PutItemCommand({
      TableName: tableName,
      Item: {
        PK: { S: `INVOKER#${invoker.id}` },
        SK: { S: `INVOKER#${invoker.id}` },
        Type: { S: 'Invoker' },
        ID: { S: invoker.id },
        Arn: { S: invoker.arn },
      },
    });
    return docClient.send(putItemCmd);
  });

  await Promise.all(promises);
};
