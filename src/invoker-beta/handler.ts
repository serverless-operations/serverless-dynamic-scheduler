import Log from '@dazn/lambda-powertools-logger';
import { Handler } from 'aws-lambda';

export const handler: Handler = async (event): Promise<void> => {
  Log.info('Received Event', { event });
};
