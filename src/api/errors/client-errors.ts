import { ClientError } from './base-errors';

export class BadRequestError extends ClientError {
  constructor(message: string) {
    super(message);
  }

  get statusCode() {
    return 400;
  }
}
