export type MessageStatus = 'RESERVED' | 'STANDBY';

export interface RegisterMessage {
  id: string;
  status: MessageStatus;
  publishDateTimestamp: number;
  invokerId: string;
  parameters?: any;
}
