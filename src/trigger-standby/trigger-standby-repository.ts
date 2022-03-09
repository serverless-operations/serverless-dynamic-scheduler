import {
  DynamoDBClient,
  QueryCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';

export class TriggerStandbyRepository {
  private readonly docClient: DynamoDBClient;
  private readonly reservationTableName: string;

  constructor(docClient: DynamoDBClient, reservationTableName: string) {
    this.docClient = docClient;
    this.reservationTableName = reservationTableName;
  }

  async setStandby(searchTimestamp: number) {
    const queryCmd = new QueryCommand({
      TableName: this.reservationTableName,
      IndexName: 'GSI1',
      KeyConditionExpression: '#gsi1pk = :gsi1pk AND #gsi1sk < :gsi1sk',
      ExpressionAttributeNames: {
        '#gsi1pk': 'GSI1PK',
        '#gsi1sk': 'GSI1SK',
      },
      ExpressionAttributeValues: {
        ':gsi1pk': { S: 'MESSAGE#RESERVED' },
        ':gsi1sk': { S: `MESSAGE#${searchTimestamp}` },
      },
      Limit: 100, // TODO: hard-coded limit
    });
    const result = await this.docClient.send(queryCmd);

    if (!result.Count) {
      return;
    }

    const promises = result.Items!.map((item) => {
      const updateCmd = new UpdateItemCommand({
        TableName: this.reservationTableName,
        Key: {
          PK: item.PK,
          SK: item.SK,
        },
        UpdateExpression: 'SET #gsi1pk = :gsi1pk, #status = :status',
        ExpressionAttributeNames: {
          '#gsi1pk': 'GSI1PK',
          '#status': 'Status',
        },
        ExpressionAttributeValues: {
          ':gsi1pk': { S: 'MESSAGE#STANDBY' },
          ':status': { S: 'STANDBY' },
        },
      });
      return this.docClient.send(updateCmd);
    });

    await Promise.all(promises);
  }
}
