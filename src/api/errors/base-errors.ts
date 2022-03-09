class ApplicationError extends Error {
  get name() {
    return this.constructor.name;
  }

  get statusCode() {
    return 500;
  }
}

export class ClientError extends ApplicationError {}

export class ServerError extends ApplicationError {}
