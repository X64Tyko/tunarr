import { injectable } from 'inversify';

export type KairosChannel = {
  channel_id: string;
  name: string;
  number: number;
};

export type KairosEpgItem = {
  item_type: string;
  item_id: string;
  block_id: string;
  wall_clock_start_ms: number;
  wall_clock_end_ms: number;
  status: string;
  title: string;
  file_path: string;
  duration_ms: number;
  show_title?: string;
  show_id?: string;
  season?: number;
  episode_num?: number;
};

export type KairosNowResponse = {
  item_type: string;
  item_id: string;
  file_path: string;
  duration_ms: number;
  title: string;
  block_id: string;
  wall_clock_start_ms: number;
  show_title?: string;
  show_id?: string;
  season?: number;
  episode_num?: number;
};

type KairosLastItem = {
  itemId: string;
  itemType: string;
  blockId: string;
  durationMs: number;
  wallClockEndMs: number;
};

@injectable()
export class KairosClient {
  private readonly baseUrl: string | undefined;
  private readonly lastItems = new Map<string, KairosLastItem>();

  constructor() {
    this.baseUrl = process.env['KAIROS_URL'];
  }

  isEnabled(): boolean {
    return !!this.baseUrl;
  }

  async getNow(channelId: string): Promise<KairosNowResponse> {
    const res = await fetch(
      `${this.baseUrl}/api/channels/${channelId}/now`,
    );
    if (!res.ok) {
      throw new Error(
        `Kairos /now returned HTTP ${res.status} for channel ${channelId}`,
      );
    }
    return (await res.json()) as KairosNowResponse;
  }

  async played(
    channelId: string,
    itemType: string,
    itemId: string,
    blockId: string,
    durationActualMs: number,
  ): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/api/channels/${channelId}/played`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: itemType,
          item_id: itemId,
          block_id: blockId,
          duration_actual_ms: durationActualMs,
        }),
      },
    );
    if (!res.ok) {
      // Log but don't throw — playback continuity is more important than history accuracy
      console.error(
        `[KairosClient] POST /played returned HTTP ${res.status} for channel ${channelId}`,
      );
    }
  }

  getLastItem(channelId: string): KairosLastItem | undefined {
    return this.lastItems.get(channelId);
  }

  setLastItem(channelId: string, item: KairosLastItem): void {
    this.lastItems.set(channelId, item);
  }

  clearLastItem(channelId: string): void {
    this.lastItems.delete(channelId);
  }

  async getChannels(): Promise<KairosChannel[]> {
    const res = await fetch(`${this.baseUrl}/api/channels`);
    if (!res.ok) {
      throw new Error(`Kairos /api/channels returned HTTP ${res.status}`);
    }
    return (await res.json()) as KairosChannel[];
  }

  async getChannelEpg(channelId: string, hours: number = 24): Promise<KairosEpgItem[]> {
    const res = await fetch(
      `${this.baseUrl}/api/channels/${channelId}/epg?hours=${hours}`,
    );
    if (!res.ok) {
      throw new Error(
        `Kairos /api/channels/${channelId}/epg returned HTTP ${res.status}`,
      );
    }
    return (await res.json()) as KairosEpgItem[];
  }
}
