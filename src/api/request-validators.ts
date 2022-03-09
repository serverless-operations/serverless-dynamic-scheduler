import { BadRequestError } from './errors/client-errors';

export const validateRegisterMessageRequest = (body: any): void => {
  if (!body) {
    throw new BadRequestError('request body required');
  }

  if (!(body.publishTime && typeof body.publishTime === 'number')) {
    throw new BadRequestError('publishTime must be a number in epoch time');
  }

  if (!(body.channel && typeof body.channel === 'string')) {
    throw new BadRequestError('channel must be a string');
  }
};
