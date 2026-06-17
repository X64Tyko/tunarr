import { Trans } from '@lingui/react/macro';
import { Route } from '@/routes/channels_/$channelId/watch.tsx';
import { PlayArrow, Replay } from '@mui/icons-material';
import { Alert, Box } from '@mui/material';
import Button from '@mui/material/Button';
import { useBlocker, useLocation } from '@tanstack/react-router';
import Hls from 'hls.js';
import { isError, isNil } from 'lodash-es';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChannelTranscodeConfig } from '../hooks/settingsHooks.ts';
import { useHls } from '../hooks/useHls.ts';
import { useSettings } from '../store/settings/selectors.ts';

type VideoProps = {
  channelId: string;
};

// If the stream hasn't started playing within this window, give up rather
// than letting the player sit there silently retrying/spinning.
const STREAM_LOAD_TIMEOUT_MS = 15_000;
// Minimum time the user must wait between manual retries, so repeatedly
// mashing "Reload Stream" against a channel that's still broken doesn't
// hammer the server.
const RETRY_COOLDOWN_MS = 5_000;

export default function Video({ channelId }: VideoProps) {
  const { backendUri } = useSettings();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [inCooldown, setInCooldown] = useState(false);
  const onFatalError = useCallback(() => {
    setStreamError('Failed to load the stream.');
    setInCooldown(true);
  }, []);
  const { hls, resetHls } = useHls({ onFatalError });
  const hlsSupported = useMemo(() => Hls.isSupported(), []);
  const [loadedStream, setLoadedStream] = useState<boolean | Error>(false);
  const { data: transcodeConfig } = useChannelTranscodeConfig(channelId);
  const { noAutoPlay } = Route.useSearch();
  const [manuallyStarted, setManuallyStarted] = useState(false);
  const location = useLocation();

  // Re-enable the retry button once the cooldown window has elapsed.
  useEffect(() => {
    if (!inCooldown) {
      return;
    }
    const timeout = setTimeout(() => setInCooldown(false), RETRY_COOLDOWN_MS);
    return () => clearTimeout(timeout);
  }, [inCooldown]);

  useEffect(() => {
    if (!loadedStream || streamError) {
      return;
    }
    const timeout = setTimeout(() => {
      setStreamError('Timed out waiting for the stream to start.');
      setInCooldown(true);
    }, STREAM_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [loadedStream, streamError]);

  const autoPlayEnabled = !noAutoPlay;

  const canLoadStream = useMemo(() => {
    const initialized = !isNil(hls);
    const alreadedLoadedOrError = isError(loadedStream) || loadedStream;
    const validSettings =
      !isNil(transcodeConfig) && !['ac3'].includes(transcodeConfig.audioFormat);
    return initialized && !alreadedLoadedOrError && validSettings;
  }, [hls, loadedStream, transcodeConfig]);

  const [isBlocked, setIsBlocked] = useState(false);

  const blocker = useBlocker({
    condition: isBlocked,
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsBlocked(true);
  }, [location]);

  // Unload HLS when navigating away
  useEffect(() => {
    if (blocker.status === 'blocked') {
      if (videoRef.current) {
        videoRef.current.pause();
      }
      if (hls) {
        hls.detachMedia();
        hls.destroy();
      }
      blocker.proceed();
    }
  }, [blocker, hls, videoRef]);

  const reloadStream = useCallback(() => {
    if (inCooldown) {
      return;
    }
    setStreamError(null);
    resetHls();
    setLoadedStream(false);
  }, [resetHls, setLoadedStream, inCooldown]);

  useEffect(() => {
    const video = videoRef.current;
    if ((autoPlayEnabled || manuallyStarted) && video && hls && canLoadStream) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadedStream(true);
      hls.loadSource(`${backendUri}/stream/channels/${channelId}.m3u8`);
      hls.attachMedia(video);
    }
  }, [
    autoPlayEnabled,
    videoRef,
    hls,
    canLoadStream,
    channelId,
    manuallyStarted,
    backendUri,
  ]);

  useEffect(() => {
    resetHls();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadedStream(false);
    setStreamError(null);
    setInCooldown(false);
    setManuallyStarted(true);
  }, [channelId, resetHls]);

  const renderVideo = () => {
    if (!hlsSupported) {
      return (
        <Alert severity="error" sx={{ my: 2 }}>
          <Trans>HLS not supported in this browser!</Trans>
        </Alert>
      );
    }

    if (!isNil(transcodeConfig) && transcodeConfig.audioFormat === 'ac3') {
      return (
        <Alert severity="warning" sx={{ my: 2 }}>
          <Trans>
            Tunarr is currently configured to use the AC3 audio encoder. This
            audio format is not supported by browsers. The resultant stream will
            likely not have audio or will not play at all.
          </Trans>
        </Alert>
      );
    }

    return (
      <Box sx={{ mb: 2 }}>
        {streamError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {streamError}
          </Alert>
        )}
        <Box sx={{ width: '100%' }}>
          <video style={{ width: '100%' }} controls autoPlay ref={videoRef} />
        </Box>
        <Button
          variant="contained"
          onClick={() => reloadStream()}
          disabled={inCooldown}
          startIcon={loadedStream ? <Replay /> : <PlayArrow />}
        >
          {loadedStream ? <Trans>Reload Stream</Trans> : <Trans>Load Stream</Trans>}
        </Button>
      </Box>
    );
  };

  return <Box>{renderVideo()}</Box>;
}
