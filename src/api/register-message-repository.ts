import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { RegisterMessage } from './register-message';

export class RegisterMessageRepository {
  private readonly docClient: DynamoDBClient;
  private readonly reservationTableName: string;

  constructor(docClient: DynamoDBClient, reservationTableName: string) {
    this.docClient = docClient;
    this.reservationTableName = reservationTableName;
  }

  async save(message: RegisterMessage) {
    const item = {
      ...{
        PK: { S: `MESSAGE#${message.id}` },
        SK: { S: `MESSAGE#${message.id}` },
        Type: { S: 'Message' },
        ID: { S: message.id },
        Status: { S: message.status },
        PublishDate: { N: message.publishDateTimestamp.toString() },
        InvokerID: { S: message.invokerId },
        GSI1PK: { S: `MESSAGE#${message.status}` },
        GSI1SK: { S: `MESSAGE#${message.publishDateTimestamp}` },
      },
      ...(message.parameters !== undefined && {
        Parameters: { S: JSON.stringify(message.parameters) }, // include Parameters if it exists
      }),
    };

    const putItemCmd = new PutItemCommand({
      TableName: this.reservationTableName,
      Item: item,
    });
    await this.docClient.send(putItemCmd);
  }
}
