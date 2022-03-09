import { v4 as uuidv4 } from 'uuid';
import { MessageStatus, RegisterMessage } from './register-message';
import dayjs from 'dayjs';

export class RegisterMessageFactory {
  private readonly standbyCheckIntervalTimestamp: number;

  constructor(standbyCheckIntervalTimestamp: number) {
    this.standbyCheckIntervalTimestamp = standbyCheckIntervalTimestamp;
  }

  create(
    publishDateTimestamp: number,
    invokerId: string,
    parameters?: any
  ): RegisterMessage {
    const nowTimestamp = dayjs().unix();

    const secondsFromNowTimestamp = publishDateTimestamp - nowTimestamp;

    const status: MessageStatus =
      secondsFromNowTimestamp < this.standbyCheckIntervalTimestamp
        ? 'STANDBY'
        : 'RESERVED';

    return {
      id: uuidv4(),
      publishDateTimestamp,
      status,
      invokerId,
      parameters,
    };
  }
}
