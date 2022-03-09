import { TriggerStandbyRepository } from './trigger-standby-repository';
import dayjs from 'dayjs';

export class TriggerStandbyService {
  private readonly repository: TriggerStandbyRepository;
  private readonly searchRangeInSeconds: number;

  constructor(
    repository: TriggerStandbyRepository,
    searchRangeInSeconds: number
  ) {
    this.repository = repository;
    this.searchRangeInSeconds = searchRangeInSeconds;
  }

  async execute() {
    const searchTimestamp = dayjs()
      .add(this.searchRangeInSeconds, 'second')
      .unix();
    await this.repository.setStandby(searchTimestamp);
  }
}
