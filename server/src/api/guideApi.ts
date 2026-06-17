import { container } from '@/container.js';
import { KairosClient } from '@/services/KairosClient.js';
import type { KairosEpgItem } from '@/services/KairosClient.js';
import { DateTimeRange } from '@/types/DateTimeRange.js';
import type { RouterPluginCallback } from '@/types/serverType.js';
import { groupByUniq } from '@/util/index.js';
import { LoggerFactory } from '@/util/logging/LoggerFactory.js';
import type { ChannelLineup } from '@tunarr/types';
import { ChannelLineupSchema } from '@tunarr/types/schemas';
import { isNull } from 'lodash-es';
import { z } from 'zod/v4';

function kairosItemToGuideProgram(
  item: KairosEpgItem,
): ChannelLineup['programs'][number] {
  const title =
    item.show_title !== undefined
      ? `${item.show_title} - ${item.title}`
      : item.title;
  return {
    type: 'flex' as const,
    title,
    duration: item.duration_ms,
    start: item.wall_clock_start_ms,
    stop: item.wall_clock_end_ms,
    isPaused: false,
  };
}

export const guideRouter: RouterPluginCallback = (fastify, _opts, done) => {
  const logger = LoggerFactory.child({
    caller: import.meta,
    className: 'GuideApi',
  });

  fastify.get(
    '/guide/status',
    {
      schema: {
        tags: ['Guide'],
      },
    },
    async (req, res) => {
      try {
        const s = await req.serverCtx.guideService.getStatus();
        return res.send(s);
      } catch (err) {
        logger.error(err, '%s', req.routeOptions.url);
        return res.status(500).send('error');
      }
    },
  );

  fastify.get(
    '/guide/debug',
    {
      schema: {
        tags: ['Debug'],
      },
    },
    async (req, res) => {
      try {
        const s = await req.serverCtx.guideService.get();
        return res.send(s);
      } catch (err) {
        logger.error(err, '%s', req.routeOptions.url);
        return res.status(500).send('error');
      }
    },
  );

  fastify.get(
    '/guide/channels',
    {
      schema: {
        tags: ['Guide'],
        querystring: z.object({
          dateFrom: z.coerce.date(),
          dateTo: z.coerce.date(),
        }),
        response: {
          200: z.record(z.string(), ChannelLineupSchema),
          400: z.string(),
          500: z.string(),
        },
      },
    },
    async (req, res) => {
      const range = DateTimeRange.create(req.query.dateFrom, req.query.dateTo);
      if (isNull(range)) {
        return res.status(400).send('Invalid date range');
      }

      const kairosClient = container.get(KairosClient);
      if (kairosClient.isEnabled()) {
        try {
          const rangeMs = range.to.valueOf() - range.from.valueOf();
          const hours = Math.max(1, Math.ceil(rangeMs / 3600_000));
          const kairosChannels = await kairosClient.getChannels();

          // Map Kairos channel_id → Tunarr UUID so guide results are keyed
          // the same way the web UI queries them.
          const allTunarrChannels = await req.serverCtx.channelDB.getAllChannels();
          const kairosIdToUuid = new Map(
            allTunarrChannels
              .filter((c): c is typeof c & { kairosChannelId: string } =>
                c.kairosChannelId !== null,
              )
              .map((c) => [c.kairosChannelId, c.uuid] as const),
          );

          const result: Record<string, ChannelLineup> = {};
          for (const ch of kairosChannels) {
            const items = await kairosClient.getChannelEpg(ch.channel_id, hours);
            const programs = items
              .filter(
                (item) =>
                  item.wall_clock_start_ms < range.to.valueOf() &&
                  item.wall_clock_end_ms > range.from.valueOf(),
              )
              .map(kairosItemToGuideProgram);
            const resultKey = kairosIdToUuid.get(ch.channel_id) ?? ch.channel_id;
            result[resultKey] = {
              id: resultKey,
              name: ch.name,
              number: ch.number,
              programs,
            };
          }
          return res.send(result);
        } catch (err) {
          logger.error(err, 'Kairos guide fetch failed');
          return res.status(500).send('Kairos guide unavailable');
        }
      }

      const guideByChannel = groupByUniq(
        await req.serverCtx.guideService.getAllChannelGuides(range),
        (guide) => guide.id,
      );

      return res.send(guideByChannel);
    },
  );

  fastify.get(
    '/guide/channels/:id',
    {
      schema: {
        tags: ['Guide'],
        params: z.object({
          id: z.string(),
        }),
        querystring: z.object({
          dateFrom: z.string().pipe(z.coerce.date()),
          dateTo: z.string().pipe(z.coerce.date()),
        }),
      },
    },
    async (req, res) => {
      try {
        const kairosClient = container.get(KairosClient);
        if (kairosClient.isEnabled()) {
          const { dateFrom, dateTo } = req.query;
          const rangeMs = dateTo.valueOf() - dateFrom.valueOf();
          const hours = Math.max(1, Math.ceil(rangeMs / 3600_000));

          // Resolve the Kairos channel ID from the Tunarr channel UUID.
          const tunarrChannel = await req.serverCtx.channelDB.getChannelOrm(
            req.params.id,
          );
          const kairosId = tunarrChannel?.kairosChannelId ?? null;
          if (kairosId === null) {
            return res.status(404).send('Channel not found in Kairos');
          }

          const kairosChannels = await kairosClient.getChannels();
          const ch = kairosChannels.find((c) => c.channel_id === kairosId);
          if (ch === undefined) {
            return res.status(404).send('Channel not found in Kairos');
          }

          const items = await kairosClient.getChannelEpg(kairosId, hours);
          const programs = items
            .filter(
              (item) =>
                item.wall_clock_start_ms < dateTo.valueOf() &&
                item.wall_clock_end_ms > dateFrom.valueOf(),
            )
            .map(kairosItemToGuideProgram);
          return res.send({
            id: req.params.id,
            name: ch.name,
            number: ch.number,
            programs,
          } satisfies ChannelLineup);
        }

        // TODO determine if these params are numbers or strings
        const dateFrom = req.query.dateFrom;
        const dateTo = req.query.dateTo;
        const lineup = await req.serverCtx.guideService.getChannelLineup(
          req.params.id,
          dateFrom,
          dateTo,
        );
        if (lineup == null) {
          return res.status(404).send('Channel not found in TV guide');
        } else {
          return res.send(lineup);
        }
      } catch (err) {
        logger.error(err, '%s', req.routeOptions.url);
        return res.status(500).send('error');
      }
    },
  );

  done();
};