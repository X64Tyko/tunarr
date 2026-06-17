import { inject, injectable } from 'inversify';
import { KairosChannelSync } from '../KairosChannelSync.ts';
import { SimpleStartupTask } from './IStartupTask.ts';
import { ChannelLineupMigratorStartupTask } from './ChannelLineupMigratorStartupTask.ts';

@injectable()
export class SyncKairosChannelsStartupTask extends SimpleStartupTask {
  id = SyncKairosChannelsStartupTask.name;
  dependencies = [ChannelLineupMigratorStartupTask.name];

  constructor(@inject(KairosChannelSync) private sync: KairosChannelSync) {
    super();
  }

  getPromise(): Promise<void> {
    return this.sync.sync().then(() => undefined);
  }
}