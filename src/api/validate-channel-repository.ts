import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';

export class ValidateChannelRepository {
  private readonly docClient: DynamoDBClient;
  private readonly reservationTableName: string;

  constructor(
    docClient: DynamoDBClient,
    reservationTableName: string
  ) {
    this.docClient = docClient;
    this.reservationTableName = reservationTableName;
  }

  async isChannelExists(channelId: string): Promise<boolean> {
    const getItemCmd = new GetItemCommand({
      TableName: this.reservationTableName,
      Key: {
        PK: { S: `INVOKER#${channelId}` },
        SK: { S: `INVOKER#${channelId}` },
      },
    })
    const result = await this.docClient.send(getItemCmd);

    return result && result.Item ? true : false;
  }
}
