var STREAM_URL = 'http://ugeen.live:8080/Ugeen_VIPtHEG0y/1hLFbj/4530';
var video = document.getElementById('video');
var statusEl = document.getElementById('status');
var playBtn = document.getElementById('playBtn');

function setStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (type ? ' ' + type : '');
}

var isHttps = location.protocol === 'https:';
var PROXY_URL = isHttps ? '/api/stream' : STREAM_URL;

var player = null;
var streamStarted = false;
var currentAttempt = 0;
var retryTimeout = null;
var lastPlayTime = 0; // Global debounce tracker

// Define the playback methods to try in sequence (Fully ES5 compatible)
var PLAYBACK_METHODS = [
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

function tryNextPlaybackMethod(isUserGesture) {
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }

  destroyPlayer();

  // Wrap around if we exhausted all methods
  if (currentAttempt >= PLAYBACK_METHODS.length) {
    currentAttempt = 0;
  }

  var method = PLAYBACK_METHODS[currentAttempt];
  
  // Skip redundant/unsupported combinations
  var isFileProtocol = location.protocol === 'file:';
  if ((method.url === PROXY_URL && isHttps === false && currentAttempt % 2 === 0) || 
      (method.url === PROXY_URL && isFileProtocol)) {
    console.log('Skipping redundant method: ' + method.name);
    currentAttempt++;
    tryNextPlaybackMethod(isUserGesture);
    return;
  }

  console.log('Attempting playback method ' + (currentAttempt + 1) + '/' + PLAYBACK_METHODS.length + ': ' + method.name);
  setStatus('Connecting (' + method.name + ')...');

  // If triggered by a user gesture, unmute the video to play with audio.
  // Otherwise, mute it to ensure autoplay works.
  video.muted = !isUserGesture;

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
        liveBufferLatencyChasing: false,
      });

      player.attachMediaElement(video);
      player.load();

      // Listen to mpegts events
      player.on(mpegts.Events.ERROR, function(errorType, errorDetail, errorInfo) {
        console.error('MPEGTS Error in ' + method.name + ':', errorType, errorDetail, errorInfo);
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
        console.log('MPEGTS Loading complete in ' + method.name);
        scheduleNextAttempt();
      });

      // Try playing - isolate play() call to prevent blocking on autoplay rejection
      try {
        var playPromise = video.play();
        if (playPromise !== undefined && typeof playPromise.then === 'function') {
          playPromise.then(function() {
            console.log('Playing successfully using ' + method.name);
          }).catch(function(err) {
            console.log('Autoplay blocked for ' + method.name + ':', err.message);
            playBtn.classList.remove('hidden');
            playBtn.textContent = '▶';
          });
        }
      } catch (playError) {
        console.log('Autoplay blocked synchronously for ' + method.name + ':', playError);
        playBtn.classList.remove('hidden');
        playBtn.textContent = '▶';
      }

    } catch (e) {
      console.error('Failed to initialize mpegts player for ' + method.name + ':', e);
      scheduleNextAttempt();
    }
  } else {
    // Native HTML5 video player fallback
    try {
      video.src = method.url;
      video.load();

      video.onloadeddata = function() {
        try {
          var playPromise = video.play();
          if (playPromise !== undefined && typeof playPromise.then === 'function') {
            playPromise.then(function() {
              console.log('Playing successfully using native ' + method.name);
              streamStarted = true;
              setStatus('Live (Native)', 'connected');
              playBtn.classList.add('hidden');
            }).catch(function(err) {
              console.log('Native autoplay blocked for ' + method.name + ':', err.message);
              playBtn.classList.remove('hidden');
            });
          } else {
            streamStarted = true;
            setStatus('Live (Native)', 'connected');
            playBtn.classList.add('hidden');
          }
        } catch (playError) {
          console.log('Native autoplay blocked synchronously for ' + method.name + ':', playError);
          playBtn.classList.remove('hidden');
        }
      };

      video.onerror = function(err) {
        console.error('Native video error in ' + method.name + ':', video.error ? video.error.code : err);
        scheduleNextAttempt();
      };

    } catch (e) {
      console.error('Failed to set native src for ' + method.name + ':', e);
      scheduleNextAttempt();
    }
  }
}

function scheduleNextAttempt() {
  if (retryTimeout) return;
  
  setStatus('Buffering / Reconnecting...');
  
  // Wait 8 seconds to allow buffering
  retryTimeout = setTimeout(function() {
    retryTimeout = null;
    currentAttempt++;
    tryNextPlaybackMethod(false);
  }, 8000);
}

// ============================================================
// PLAY BUTTON HANDLER (ES5 compliant with internal debounce)
// ============================================================
function handlePlayAction(e) {
  // Prevent duplicate events (e.g. touchstart + click) firing within 800ms
  var now = Date.now();
  if (now - lastPlayTime < 800) {
    console.log('Duplicate play trigger ignored.');
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    return;
  }
  lastPlayTime = now;

  if (e) {
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
  }

  console.log('Play/Pause action initiated by user');

  if (streamStarted) {
    if (video.paused) {
      video.muted = false; // Unmute on click
      try {
        var p = video.play();
        if (p !== undefined && typeof p.then === 'function') {
          p.then(function() {
            playBtn.classList.add('hidden');
          }).catch(function(err) {
            console.error('Play failed:', err);
          });
        } else {
          playBtn.classList.add('hidden');
        }
      } catch (err) {
        console.error('Play failed synchronously:', err);
      }
    } else {
      video.pause();
    }
  } else {
    // If not started yet, restart the playback sequence with user gesture mode (unmuted)
    currentAttempt = 0;
    tryNextPlaybackMethod(true);
  }
}

// Bind events to the play button
playBtn.addEventListener('click', handlePlayAction, true);
playBtn.addEventListener('touchend', handlePlayAction, true);
if (playBtn.addEventListener) {
  playBtn.addEventListener('pointerup', handlePlayAction, true);
}
playBtn.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 32) {
    handlePlayAction(e);
  }
}, true);

// Video element click fallback
video.addEventListener('click', function() {
  handlePlayAction();
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

// Initial auto-start on load (muted)
tryNextPlaybackMethod(false);
