import type { ErrorData, HlsConfig } from 'hls.js';
import Hls from 'hls.js';
import { useCallback, useState } from 'react';

const hlsSupported = Hls.isSupported();

// Bound how long hls.js will keep retrying a failing manifest/level load
// before giving up: a couple of quick retries, then stop. Without this, a
// load that fails immediately (e.g. a 400/404) can otherwise sit retrying
// indefinitely in the background.
const retryPolicy = {
  maxTimeToFirstByteMs: 10_000,
  maxLoadTimeMs: 10_000,
  timeoutRetry: {
    maxNumRetry: 2,
    retryDelayMs: 1000,
    maxRetryDelayMs: 4000,
  },
  errorRetry: {
    maxNumRetry: 2,
    retryDelayMs: 1000,
    maxRetryDelayMs: 4000,
  },
};

type UseHlsOptions = Partial<HlsConfig> & {
  onFatalError?: (data: ErrorData) => void;
};

export const useHls = ({ onFatalError, ...userConfig }: UseHlsOptions = {}) => {
  const [hls, setHls] = useState<Hls | null>(null);

  const refreshHls = useCallback(() => {
    if (!hlsSupported) {
      return;
    }

    const newHls = new Hls({
      progressive: true,
      fragLoadingTimeOut: 30000,
      initialLiveManifestSize: 3, // About 10 seconds of playback needed before playing
      enableWorker: true,
      lowLatencyMode: true,
      manifestLoadPolicy: { default: retryPolicy },
      playlistLoadPolicy: { default: retryPolicy },
      fragLoadPolicy: { default: retryPolicy },
      xhrSetup: (xhr) => {
        xhr.setRequestHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Accept, X-Requested-With',
        );
        xhr.setRequestHeader(
          'Access-Control-Allow-Origin',
          'http://localhost:5173',
        );
      },
      debug: import.meta.env.DEV,
      ...(userConfig ?? {}),
    });

    newHls.on(Hls.Events.MANIFEST_PARSED, function (_, data) {
      console.debug(
        'manifest loaded, found ' + data.levels.length + ' quality level',
      );
    });

    newHls.on(Hls.Events.ERROR, (_, data) => {
      console.error('HLS error', data);
      // Stop hls.js from continuing to hammer the server once it's given
      // up on a fatal error -- surface it instead of retrying forever.
      if (data.fatal) {
        newHls.destroy();
        onFatalError?.(data);
      }
    });

    newHls.on(Hls.Events.MEDIA_ATTACHED, function () {
      console.debug('video and hls.js are now bound together !');
    });

    setHls(newHls);
    return newHls;
  }, [userConfig, onFatalError]);

  const resetHls = useCallback(() => {
    hls?.destroy();
    setHls(null);
    return refreshHls();
  }, [hls, refreshHls]);

  return {
    hls,
    resetHls,
  };
};
