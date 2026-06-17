import { eq, isNotNull, or, sql } from 'drizzle-orm';
import { inject, injectable } from 'inversify';
import { v4 } from 'uuid';
import { DefaultChannelIcon } from '../db/schema/base.ts';
import { Channel } from '../db/schema/Channel.ts';
import type { DrizzleDBAccess } from '../db/schema/index.ts';
import { TranscodeConfigDB } from '../db/TranscodeConfigDB.ts';
import { KEYS } from '../types/inject.ts';
import { InjectLogger } from '../util/inject.ts';
import type { Logger } from '../util/logging/LoggerFactory.ts';
import { KairosClient } from './KairosClient.ts';

@injectable()
export class KairosChannelSync {
  @InjectLogger() declare private readonly logger: Logger;

  constructor(
    @inject(KairosClient) private kairosClient: KairosClient,
    @inject(KEYS.DrizzleDB) private drizzle: DrizzleDBAccess,
    @inject(TranscodeConfigDB) private transcodeConfigDB: TranscodeConfigDB,
  ) {}

  async sync(): Promise<number> {
    if (!this.kairosClient.isEnabled()) {
      return 0;
    }

    const channels = await this.kairosClient.getChannels();
    if (channels.length === 0) return 0;

    const defaultConfig = await this.transcodeConfigDB.getDefaultConfig();
    const transcodeConfigId =
      defaultConfig?.uuid ??
      (await this.transcodeConfigDB.getAll())[0]?.uuid ??
      '';

    const now = Date.now();
    let synced = 0;

    for (const ch of channels) {
      try {
        const existing = await this.drizzle
          .select({ uuid: Channel.uuid })
          .from(Channel)
          .where(eq(Channel.kairosChannelId, ch.channel_id))
          .limit(1);

        await this.drizzle
          .insert(Channel)
          .values({
            // Kairos channel IDs are not Tunarr UUIDs (and aren't guaranteed
            // to be UUID-shaped at all), so Tunarr generates and owns its own
            // UUID here, keyed off of the Kairos channel ID for lookups.
            uuid: existing[0]?.uuid ?? v4(),
            kairosChannelId: ch.channel_id,
            name: ch.name,
            number: ch.number,
            duration: 0,
            guideMinimumDuration: 300_000,
            startTime: 0,
            icon: DefaultChannelIcon,
            offline: { mode: 'pic' },
            streamMode: 'hls',
            transcodeConfigId,
            createdAt: now,
            updatedAt: now,
            disableFillerOverlay: false,
            stealth: false,
            subtitlesEnabled: false,
            groupTitle: 'Kairos',
          })
          .onConflictDoUpdate({
            target: Channel.kairosChannelId,
            set: {
              name: sql`excluded.name`,
              number: sql`excluded.number`,
              updatedAt: now,
            },
          });
        synced++;
      } catch (err) {
        this.logger.warn(
          err,
          'Failed to sync Kairos channel %s (number conflict?)',
          ch.channel_id,
        );
      }
    }

    this.logger.info('Synced %d Kairos channels into Tunarr DB', synced);
    return synced;
  }

  /**
   * Deletes all previously-synced Kairos channels (including legacy rows
   * predating the kairosChannelId column) and performs a fresh sync from
   * Kairos. Useful for recovering from a bad/stale sync state.
   */
  async forceSync(): Promise<number> {
    await this.drizzle
      .delete(Channel)
      .where(
        or(isNotNull(Channel.kairosChannelId), eq(Channel.groupTitle, 'Kairos')),
      );
    return this.sync();
  }
}
