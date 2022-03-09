import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface DynamoDbConfig {
  pointInTimeRecovery: boolean;
  globalTable: {
    regions: string[];
  };
}

interface DynamoProps extends StackProps {
  stage: string;
  dynamoDbConfig: DynamoDbConfig;
}

export class SchedulerDynamoStack extends Stack {
  public readonly reservationTable: dynamodb.Table;
  public readonly gsi1IndexName = 'GSI1';

  constructor(scope: Construct, id: string, props: DynamoProps) {
    super(scope, id, props);

    this.reservationTable = this.createReservationTable(props);
  }

  private createReservationTable(props: DynamoProps): dynamodb.Table {
    const table = new dynamodb.Table(this, 'Reservation', {
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      pointInTimeRecovery: props.dynamoDbConfig.pointInTimeRecovery,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      replicationRegions: props.dynamoDbConfig.globalTable.regions,
    });
    table.addGlobalSecondaryIndex({
      indexName: this.gsi1IndexName,
      partitionKey: {
        name: 'GSI1PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK',
        type: dynamodb.AttributeType.STRING,
      },
    });
    return table;
  }
}
