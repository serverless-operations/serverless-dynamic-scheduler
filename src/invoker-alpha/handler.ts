import Log from '@dazn/lambda-powertools-logger';
import { Handler } from 'aws-lambda';
import * as https from 'https';

const { SLACK_WEBHOOK_URL } = process.env;

type Input = {
  parameters: string;
};

type Parameters = {
  message: string;
};

export const handler: Handler<Input> = async (event): Promise<void> => {
  Log.info('Received Event', { event });
  if (!event.parameters) {
    Log.error('no parameters specified', {
      parameters: event.parameters,
    });

    throw new Error('no parameters specified');
  }

  const parameters = JSON.parse(event.parameters) as Parameters;
  if (!parameters.message) {
    Log.error('no message specified', {
      parameters,
    });

    throw new Error('no message specified');
  }

  try {
    await sendSlackMessage(SLACK_WEBHOOK_URL!, parameters.message);
  } catch (e) {
    Log.error('something went wrong', { error: e });
    throw e;
  }
};

function sendSlackMessage(webhookUrl: string, message: string) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(webhookUrl, requestOptions, (res) => {
      let response = '';

      res.on('data', (d) => {
        response += d;
      });

      res.on('end', () => {
        resolve(response);
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    // send simple message to slack
    req.write(JSON.stringify({ text: message }));
    req.end();
  });
}
