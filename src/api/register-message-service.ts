import { BadRequestError } from './errors/client-errors';
import { RegisterMessageFactory } from './register-message-factory';
import { RegisterMessageRepository } from './register-message-repository';
import { ValidateChannelRepository } from './validate-channel-repository';

export type RegisterMessageRequest = {
  publishTime: number;
  channel: string;
  parameters: any;
};

export type RegisterMessageResponse = {
  id: string;
};

export class RegisterMessageService {
  private readonly messageFactory: RegisterMessageFactory;
  private readonly messageRepository: RegisterMessageRepository;
  private readonly validator: ValidateChannelRepository;

  constructor(
    messageFactory: RegisterMessageFactory,
    messageRepository: RegisterMessageRepository,
    validator: ValidateChannelRepository
  ) {
    this.messageFactory = messageFactory;
    this.messageRepository = messageRepository;
    this.validator = validator;
  }

  async execute(req: RegisterMessageRequest): Promise<RegisterMessageResponse> {
    const isChannelExists = await this.validator.isChannelExists(req.channel);
    if (!isChannelExists) {
      throw new BadRequestError('Invalid channel was submitted');
    }

    const message = this.messageFactory.create(
      req.publishTime,
      req.channel,
      req.parameters
    );
    await this.messageRepository.save(message);
    return {
      id: message.id,
    };
  }
}
