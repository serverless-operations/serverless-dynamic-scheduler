import { BadRequestError } from '#/api/errors/client-errors';
import { validateRegisterMessageRequest } from '#/api/request-validators';

describe('Request validators', () => {
  describe('validateRegisterMessageRequest', () => {
    describe('Success', () => {
      test('should execute without error', () => {
        // Arrange
        const body = {
          publishTime: 1645147388,
          channel: 'some-channel',
        };

        const act = () => validateRegisterMessageRequest(body);

        // Act & Assert
        expect(act).not.toThrow();
      });
    });

    describe('Failure', () => {
      describe('body empty', () => {
        test('should throw an error', () => {
          // Arrange & act
          const act = () => validateRegisterMessageRequest(undefined);

          // Act & Assert
          expect(act).toThrow(BadRequestError);
        });
      });
      describe('publishTime', () => {
        test('should throw an error if it does not exist', () => {
          // Arrange
          const body = {
            channel: 'some-channel',
          };
          const act = () => validateRegisterMessageRequest(body);

          // Act & Assert
          expect(act).toThrow(BadRequestError);
        });

        test('should throw an error if it is not a number', () => {
          // Arrange
          const body = {
            publishTime: '1645147388',
            channel: 'some-channel',
          };
          const act = () => validateRegisterMessageRequest(body);

          // Act & Assert
          expect(act).toThrow(BadRequestError);
        });
      });
      describe('channel', () => {
        test('should throw an error if it does not exist', () => {
          // Arrange
          const body = {
            publishTime: 1645147388,
          };
          const act = () => validateRegisterMessageRequest(body);

          // Act & Assert
          expect(act).toThrow(BadRequestError);
        });

        test('should throw an error if it is not a string', () => {
          // Arrange
          const body = {
            publishTime: 1645147388,
            channel: 123456,
          };
          const act = () => validateRegisterMessageRequest(body);

          // Act & Assert
          expect(act).toThrow(BadRequestError);
        });
      });
    });
  });
});
