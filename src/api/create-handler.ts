import Log from '@dazn/lambda-powertools-logger';
import API, { Request, Response } from 'lambda-api';
import { APIGatewayEvent, Context } from 'aws-lambda';
import { RegisterMessageService } from './register-message-service';
import { AsyncHandler } from '#/shared/lambda';
import { ClientError, ServerError } from './errors/base-errors';
import { validateRegisterMessageRequest } from './request-validators';

type Dependencies = {
  registerMessageService: RegisterMessageService;
};

export const createHandler = (
  deps: Dependencies
): AsyncHandler<APIGatewayEvent, Context> => {
  const { registerMessageService } = deps;

  const api = API();
  api.use(
    (
      error: Error,
      req: Request,
      res: Response,
      next: (err?: Error) => void
    ): void => {
      if (error instanceof ClientError) {
        res.error(error.statusCode, error.message);
      } else if (error instanceof ServerError) {
        Log.error('A server error occurred', error);
        res.sendStatus(error.statusCode);
      } else {
        Log.error('An unexpected error occurred', error);
        res.sendStatus(500);
      }
      next();
    }
  );

  api.post('/messages', async (req, res) => {
    validateRegisterMessageRequest(req.body);

    const { publishTime, channel, parameters } = req.body;

    const result = await registerMessageService.execute({
      publishTime,
      channel,
      parameters,
    });
    res.status(201).json({ id: result.id });
  });

  return async (event, context): Promise<any> => {
    Log.info('Received Event', { event });
    return await api
      .run(event, context)
      .catch((error: Error) =>
        Log.error('Thrown error during invocation: ', { error })
      );
  };
};
