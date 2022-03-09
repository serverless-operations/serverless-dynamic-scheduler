/* eslint-disable @typescript-eslint/no-empty-function */
import { generateRandomString } from '../../helpers/utils';
import {
  createReservationTable,
  deleteTable,
  getMessageById,
  MessageItem,
  putMessages,
} from '../../helpers/dynamodb/reservation-table';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import MockDate from 'mockdate';
import { TriggerStandbyRepository } from '#/trigger-standby/trigger-standby-repository';
import { TriggerStandbyService } from '#/trigger-standby/trigger-standby-service';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
dayjs.extend(utc);
dayjs.extend(timezone);

const docClient = new DynamoDBClient({
  region: process.env.AWS_REGION,
  endpoint: process.env.DYNAMODB_ENDPOINT,
});
const tableName = `ReservationMessage--${generateRandomString()}`;
const gsi1IndexName = 'GSI1';

const searchRangeInSeconds = 75;

describe('Trigger Standby', (): void => {
  let triggerStandbyService: TriggerStandbyService;

  beforeEach(async () => {
    const triggerStandbyRepository = new TriggerStandbyRepository(
      docClient,
      tableName
    );
    triggerStandbyService = new TriggerStandbyService(
      triggerStandbyRepository,
      searchRangeInSeconds
    );

    await createReservationTable(docClient, tableName, gsi1IndexName);
  });

  afterEach(async () => {
    await deleteTable(docClient, tableName);
  });

  describe('Success', () => {
    describe('publishDate is within the searchRange', () => {
      test('should update all RESERVED messages to STANDBY', async () => {
        // Arrange
        const now = dayjs('2022-02-08');
        MockDate.set(now.toDate());

        const doneMessage: MessageItem = {
          id: uuidv4(),
          status: 'DONE',
          publishDate: now.subtract(1, 'day').unix(),
        };
        const reservedMessageWithinSearchRange1: MessageItem = {
          id: uuidv4(),
          status: 'RESERVED',
          publishDate: now.add(searchRangeInSeconds - 1, 'seconds').unix(),
        };
        const reservedMessageWithinSearchRange2: MessageItem = {
          id: uuidv4(),
          status: 'RESERVED',
          publishDate: now.add(searchRangeInSeconds - 2, 'seconds').unix(),
        };
        const reservedMessageOutsideSearchRange: MessageItem = {
          id: uuidv4(),
          status: 'RESERVED',
          publishDate: now.add(searchRangeInSeconds + 1, 'seconds').unix(),
        };
        const standbyMessage: MessageItem = {
          id: uuidv4(),
          status: 'STANDBY',
          publishDate: now.subtract(searchRangeInSeconds, 'seconds').unix(),
        };

        await putMessages(docClient, tableName, [
          doneMessage,
          reservedMessageWithinSearchRange1,
          reservedMessageWithinSearchRange2,
          reservedMessageOutsideSearchRange,
          standbyMessage,
        ]);

        // Act
        await triggerStandbyService.execute();

        // Assert
        const actualReservedMessageWithinSearchRangeMessage1 =
          await getMessageById(
            docClient,
            tableName,
            reservedMessageWithinSearchRange1.id
          );
        expect(
          actualReservedMessageWithinSearchRangeMessage1?.Status.S
        ).toEqual(
          'STANDBY' // check that it changed to STANDBY
        );
        expect(
          actualReservedMessageWithinSearchRangeMessage1?.PublishDate.N
        ).toEqual(reservedMessageWithinSearchRange1.publishDate.toString());
        const actualReservedMessageWithinSearchRangeMessage2 =
          await getMessageById(
            docClient,
            tableName,
            reservedMessageWithinSearchRange2.id
          );
        expect(
          actualReservedMessageWithinSearchRangeMessage2?.Status.S
        ).toEqual(
          'STANDBY' // check that it changed to STANDBY
        );
        expect(
          actualReservedMessageWithinSearchRangeMessage2?.PublishDate.N
        ).toEqual(reservedMessageWithinSearchRange2.publishDate.toString());

        // assert that other messages haven't changed
        const actualDoneMessage = await getMessageById(
          docClient,
          tableName,
          doneMessage.id
        );
        expect(actualDoneMessage?.Status.S).toEqual(doneMessage.status);
        expect(actualDoneMessage?.PublishDate.N).toEqual(
          doneMessage.publishDate.toString()
        );

        const actualMessageOutsideRange = await getMessageById(
          docClient,
          tableName,
          reservedMessageOutsideSearchRange.id
        );
        expect(actualMessageOutsideRange?.Status.S).toEqual(
          reservedMessageOutsideSearchRange.status
        );
        expect(actualMessageOutsideRange?.PublishDate.N).toEqual(
          reservedMessageOutsideSearchRange.publishDate.toString()
        );

        const actualStandbyMessage = await getMessageById(
          docClient,
          tableName,
          standbyMessage.id
        );
        expect(actualStandbyMessage?.Status.S).toEqual(standbyMessage.status);
        expect(actualStandbyMessage?.PublishDate.N).toEqual(
          standbyMessage.publishDate.toString()
        );
      });
    });
  });
});
