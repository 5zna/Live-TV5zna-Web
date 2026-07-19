const STREAM_URL = 'http://ugeen.live:8080/Ugeen_VIPtHEG0y/1hLFbj/4526';
const video = document.getElementById('video');
const statusEl = document.getElementById('status');
const playBtn = document.getElementById('playBtn');

function setStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (type ? ' ' + type : '');
}

const isHttps = location.protocol === 'https:';
const PROXY_URL = isHttps ? '/api/stream' : STREAM_URL;

let player = null;
let streamStarted = false;
let currentAttempt = 0;
let retryTimeout = null;

// Define the playback methods we will try in sequence
const PLAYBACK_METHODS = [
  { name: 'MPEGTS Proxy', useMpegts: true, url: PROXY_URL },
  { name: 'MPEGTS Direct', useMpegts: true, url: STREAM_URL },
  { name: 'Native Proxy', useMpegts: false, url: PROXY_URL },
  { name: 'Native Direct', useMpegts: false, url: STREAM_URL }
];

// Clean up helper
function destroyPlayer() {
  if (player) {
    try {
      player.pause();
      player.unload();
      player.detachMediaElement();
      player.destroy();
    } catch (e) {
      console.warn('Error destroying mpegts player:', e);
    }
    player = null;
  }
  
  // Reset native video element state
  video.removeAttribute('src');
  try {
    video.load();
  } catch (e) {}
  
  streamStarted = false;
}

function tryNextPlaybackMethod() {
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }

  destroyPlayer();

  // If we exhausted all methods, wrap around and try again from the beginning
  if (currentAttempt >= PLAYBACK_METHODS.length) {
    currentAttempt = 0;
  }

  const method = PLAYBACK_METHODS[currentAttempt];
  
  // Skip duplicate methods (e.g. if PROXY_URL is same as STREAM_URL, or if it is file:// and proxy won't work)
  const isFileProtocol = location.protocol === 'file:';
  if ((method.url === PROXY_URL && isHttps === false && currentAttempt % 2 === 0) || 
      (method.url === PROXY_URL && isFileProtocol)) {
    console.log(`Skipping redundant method: ${method.name}`);
    currentAttempt++;
    tryNextPlaybackMethod();
    return;
  }

  console.log(`Attempting playback method ${currentAttempt + 1}/${PLAYBACK_METHODS.length}: ${method.name}`);
  setStatus(`Connecting (${method.name})...`);

  // Ensure video is muted for autoplay support
  video.muted = true;

  if (method.useMpegts && typeof mpegts !== 'undefined' && mpegts.isSupported()) {
    try {
      player = mpegts.createPlayer({
        type: 'mpegts',
        url: method.url,
        isLive: true,
      }, {
        enableWorker: false,
        lazyLoad: false,
        autoCleanupSourceBuffer: true,
        // Disable aggressive latency chasing to prevent constant buffer underflows on TV/slow connections
        liveBufferLatencyChasing: false,
      });

      player.attachMediaElement(video);
      player.load();

      // Listen to events
      player.on(mpegts.Events.ERROR, function(errorType, errorDetail, errorInfo) {
        console.error(`MPEGTS Error in ${method.name}:`, errorType, errorDetail, errorInfo);
        scheduleNextAttempt();
      });

      player.on(mpegts.Events.STATISTICS_INFO, function() {
        if (!streamStarted) {
          streamStarted = true;
          setStatus('Live', 'connected');
          playBtn.classList.add('hidden');
        }
      });

      player.on(mpegts.Events.LOADING_COMPLETE, function() {
        console.log(`MPEGTS Loading complete (end of stream) in ${method.name}`);
        scheduleNextAttempt();
      });

      // Play command
      var playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.then(function() {
          // Success playing muted
          console.log(`Playing successfully using ${method.name}`);
        }).catch(function(err) {
          console.log(`Autoplay blocked or failed for ${method.name}:`, err.message);
          // Show play button so user can manually trigger
          playBtn.classList.remove('hidden');
          playBtn.textContent = '▶';
        });
      }

    } catch (e) {
      console.error(`Failed to initialize mpegts player for ${method.name}:`, e);
      scheduleNextAttempt();
    }
  } else {
    // Native HTML5 video player fallback
    try {
      video.src = method.url;
      video.load();

      video.onloadeddata = function() {
        var playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.then(function() {
            console.log(`Playing successfully using native ${method.name}`);
            streamStarted = true;
            setStatus('Live (Native)', 'connected');
            playBtn.classList.add('hidden');
          }).catch(function(err) {
            console.log(`Native autoplay blocked/failed for ${method.name}:`, err.message);
            playBtn.classList.remove('hidden');
          });
        } else {
          // Old browser support
          streamStarted = true;
          setStatus('Live (Native)', 'connected');
          playBtn.classList.add('hidden');
        }
      };

      video.onerror = function(err) {
        console.error(`Native video error in ${method.name}:`, video.error ? video.error.code : err);
        scheduleNextAttempt();
      };

    } catch (e) {
      console.error(`Failed to set native src for ${method.name}:`, e);
      scheduleNextAttempt();
    }
  }
}

function scheduleNextAttempt() {
  if (retryTimeout) return; // already scheduled
  
  setStatus('Buffering / Reconnecting...');
  
  retryTimeout = setTimeout(function() {
    retryTimeout = null;
    currentAttempt++;
    tryNextPlaybackMethod();
  }, 2000); // Wait 2s before trying next method
}

// ============================================================
// PLAY BUTTON HANDLER (with user gesture propagation)
// ============================================================
function handlePlayAction(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  console.log('Play/Pause triggered by user');

  // If video is loaded and paused, play it and unmute
  if (streamStarted) {
    if (video.paused) {
      video.muted = false; // Unmute on explicit user interaction
      video.play().then(function() {
        playBtn.classList.add('hidden');
      }).catch(function(err) {
        console.error('Play failed:', err);
      });
    } else {
      video.pause();
    }
  } else {
    // If stream is not running yet, restart the playback sequence from beginning
    currentAttempt = 0;
    tryNextPlaybackMethod();
    
    // Give it a moment to initialize, then attempt to unmute and play
    setTimeout(function() {
      video.muted = false;
      video.play().catch(function() {});
    }, 100);
  }
}

// Bind events to the play button
playBtn.addEventListener('click', handlePlayAction, true);
playBtn.addEventListener('touchend', handlePlayAction, true);
playBtn.addEventListener('pointerup', handlePlayAction, true);
playBtn.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 32) {
    handlePlayAction(e);
  }
}, true);

// Video element click fallback
video.addEventListener('click', function() {
  if (streamStarted) {
    if (video.paused) {
      video.muted = false;
      video.play().catch(function() {});
    } else {
      video.pause();
    }
  } else {
    handlePlayAction();
  }
});

// Sync play button UI with actual video state
video.addEventListener('play', function() {
  playBtn.textContent = '❚❚';
  playBtn.classList.add('hidden');
});

video.addEventListener('pause', function() {
  playBtn.textContent = '▶';
  playBtn.classList.remove('hidden');
});

video.addEventListener('waiting', function() {
  setStatus('Buffering...');
});

video.addEventListener('playing', function() {
  setStatus('Live', 'connected');
  playBtn.classList.add('hidden');
});

// Debouncing for click/touch events to prevent double fires
var lastPlayTime = 0;
const originalPlayAction = handlePlayAction;
handlePlayAction = function(e) {
  var now = Date.now();
  if (now - lastPlayTime < 500) return;
  lastPlayTime = now;
  originalPlayAction(e);
};

// Initial auto-start
tryNextPlaybackMethod();
