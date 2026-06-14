// These types are like the DAO Lineup types in Lineup.ts
// but contain a bit more context and are used during an
// active streaming session

import type { OfflineFillerConfig } from '@tunarr/types/schemas';
import type { MarkRequired, StrictOmit } from 'ts-essentials';
import type { MarkNotNilable } from '../../types/util.ts';
import type { MediaSourceType } from '../schema/base.js';
import type {
  ProgramWithRelationsOrm,
  SpecificProgramSourceOrmType,
} from '../schema/derivedTypes.ts';
import type { ProgramType } from '../schema/Program.ts';

type BaseStreamLineupItem = {
  streamDuration: number;
  startOffset?: number;
  programBeginMs: number;
  duration: number;
};

export type StreamLineupProgram = MarkNotNilable<
  MarkRequired<ProgramWithRelationsOrm, 'externalIds'>,
  'mediaSourceId'
>;

export function isOfflineLineupItem(
  item: StreamLineupItem,
): item is OfflineStreamLineupItem | RedirectStreamLineupItem {
  return item.type === 'offline' || item.type === 'redirect';
}

export function isCommercialLineupItem(
  item: StreamLineupItem,
): item is CommercialStreamLineupItem {
  return item.type === 'commercial';
}

export function isProgramLineupItem(
  item: StreamLineupItem,
): item is ProgramStreamLineupItem {
  return item.type === 'program';
}

export function isContentBackedLineupItem(
  item: StreamLineupItem,
): item is ContentBackedStreamLineupItem {
  return (
    isCommercialLineupItem(item) ||
    isProgramLineupItem(item) ||
    item.type === 'fallback'
  );
}

export type ContentBackedStreamLineupItem =
  | CommercialStreamLineupItem
  | ProgramStreamLineupItem
  | FallbackStreamLineupItem;

export type MinimalContentStreamLineupItem = {
  programId: string;
  programType: ProgramType;
  externalKey: string;
  externalSourceId: string;
  externalSource: MediaSourceType;
  duration: number;
  externalFilePath: string | undefined;
};

export type SpecificSourceContentBackedStreamLineupItem<
  Typ extends MediaSourceType,
> = StrictOmit<ContentBackedStreamLineupItem, 'program'> & {
  program: SpecificProgramSourceOrmType<Typ, StreamLineupProgram>;
};

export type PlexBackedStreamLineupItem =
  SpecificSourceContentBackedStreamLineupItem<typeof MediaSourceType.Plex>;

export type SpecificMinimalContentStreamLineupItem<
  Typ extends MediaSourceType,
> = StrictOmit<MinimalContentStreamLineupItem, 'externalSource'> & {
  externalSource: Typ;
};

export type MinimalPlexBackedStreamLineupItem = SpecificProgramSourceOrmType<
  typeof MediaSourceType.Plex,
  StreamLineupProgram
>;

export type OfflineStreamLineupItem = BaseStreamLineupItem & {
  type: 'offline';
  duration: number;
  fillerConfig?: OfflineFillerConfig;
};

type BaseContentBackedStreamLineupItem = BaseStreamLineupItem & {
  program: StreamLineupProgram;
  infiniteLoop: boolean;
};

export type CommercialStreamLineupItem = BaseContentBackedStreamLineupItem & {
  type: 'commercial';
  fillerListId: string;
};

export type FallbackStreamLineupItem = BaseContentBackedStreamLineupItem & {
  type: 'fallback';
};

export type ProgramStreamLineupItem = BaseContentBackedStreamLineupItem & {
  type: 'program';
  customShowId?: string;
};

export type RedirectStreamLineupItem = BaseStreamLineupItem & {
  type: 'redirect';
  channel: string;
  duration: number;
};

export type ErrorStreamLineupItem = BaseStreamLineupItem & {
  type: 'error';
  error: Error | string | boolean;
};

export type KairosStreamLineupItem = BaseStreamLineupItem & {
  type: 'kairos';
  filePath: string;
  itemId: string;
  itemType: string;
  blockId: string;
  channelId: string;
  title: string;
  showTitle?: string;
  showId?: string;
  season?: number;
  episodeNum?: number;
};

export function isKairosLineupItem(
  item: StreamLineupItem,
): item is KairosStreamLineupItem {
  return item.type === 'kairos';
}

export type StreamLineupItem =
  | ProgramStreamLineupItem
  | CommercialStreamLineupItem
  | OfflineStreamLineupItem
  | RedirectStreamLineupItem
  | ErrorStreamLineupItem
  | FallbackStreamLineupItem
  | KairosStreamLineupItem;

export function createOfflineStreamLineupItem(
  duration: number,
  programBeginMs: number,
): OfflineStreamLineupItem {
  return {
    duration,
    startOffset: 0,
    type: 'offline',
    programBeginMs,
    streamDuration: duration,
  };
}
