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

function destroyPlayer() {
  if (player) {
    try {
      player.pause();
      player.unload();
      player.detachMediaElement();
      player.destroy();
    } catch (e) {
      console.warn('Error destroying player:', e);
    }
    player = null;
  }
  streamStarted = false;
}

function startStream(url, isUserGesture) {
  // Always destroy existing player first
  destroyPlayer();

  video.muted = true;

  if (typeof mpegts !== 'undefined' && mpegts.isSupported()) {
    player = mpegts.createPlayer({
      type: 'mpegts',
      url: url,
      isLive: true,
    }, {
      enableWorker: false,
      liveBufferLatencyChasing: true,
      liveBufferLatencyMaxLatency: 1.5,
      liveBufferLatencyMinRemain: 0.3,
    });

    player.attachMediaElement(video);
    player.load();

    // Attempt to play - works for muted or after user gesture
    var playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.then(function() {
        streamStarted = true;
        playBtn.classList.add('hidden');
        setStatus('Live', 'connected');
      }).catch(function(e) {
        console.log('Play attempt failed:', e.message);
        // Show play button so user can tap to start
        playBtn.classList.remove('hidden');
        playBtn.textContent = '▶';
        streamStarted = false;
      });
    } else {
      // Old browser without promise support - assume it works
      streamStarted = true;
      playBtn.classList.add('hidden');
    }

    player.on(mpegts.Events.ERROR, function(errorType, errorDetail, errorInfo) {
      console.error('Stream error:', errorType, errorDetail, errorInfo);
      setStatus('Stream error - retrying...', 'error');
      setTimeout(function() {
        startStream(url, false);
      }, 3000);
    });

    player.on(mpegts.Events.STATISTICS_INFO, function() {
      if (!streamStarted) {
        streamStarted = true;
      }
      setStatus('Live', 'connected');
    });

    player.on(mpegts.Events.LOADING_COMPLETE, function() {
      setStatus('Stream ended - reconnecting...');
      setTimeout(function() {
        startStream(url, false);
      }, 3000);
    });

  } else {
    // Fallback: direct src assignment (Safari, some TV browsers)
    video.src = url;
    video.load();

    video.onloadeddata = function() {
      var p = video.play();
      if (p && p.then) {
        p.then(function() {
          streamStarted = true;
          playBtn.classList.add('hidden');
          setStatus('Live', 'connected');
        }).catch(function() {
          playBtn.classList.remove('hidden');
        });
      }
    };

    video.onerror = function() {
      setStatus('Stream unavailable', 'error');
    };
  }
}

// ============================================================
// PLAY BUTTON - works on TV remotes, touch, mouse, keyboard
// ============================================================
function handlePlayAction(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  console.log('Play button activated');

  // If video is playing, pause it
  if (!video.paused && streamStarted) {
    video.pause();
    return;
  }

  // Always restart the full pipeline on user gesture
  // This is critical for TV browsers - they need the entire
  // play() call chain to happen within a user gesture context
  setStatus('Connecting...');
  destroyPlayer();

  video.muted = true;

  if (typeof mpegts !== 'undefined' && mpegts.isSupported()) {
    player = mpegts.createPlayer({
      type: 'mpegts',
      url: PROXY_URL,
      isLive: true,
    }, {
      enableWorker: false,
      liveBufferLatencyChasing: true,
      liveBufferLatencyMaxLatency: 1.5,
      liveBufferLatencyMinRemain: 0.3,
    });

    player.attachMediaElement(video);
    player.load();

    // CRITICAL: call play() immediately in the same user gesture stack
    var playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.then(function() {
        streamStarted = true;
        playBtn.classList.add('hidden');
        setStatus('Live', 'connected');
      }).catch(function(err) {
        console.error('Play failed after gesture:', err.message);
        // Try again with a tiny delay (some TV browsers need this)
        setTimeout(function() {
          video.play().then(function() {
            streamStarted = true;
            playBtn.classList.add('hidden');
            setStatus('Live', 'connected');
          }).catch(function(err2) {
            console.error('Retry play also failed:', err2.message);
            setStatus('Tap video to play', 'error');
          });
        }, 500);
      });
    } else {
      streamStarted = true;
      playBtn.classList.add('hidden');
    }

    player.on(mpegts.Events.ERROR, function(errorType, errorDetail, errorInfo) {
      console.error('Stream error:', errorType, errorDetail, errorInfo);
      setStatus('Stream error - retrying...', 'error');
      setTimeout(function() {
        startStream(PROXY_URL, false);
      }, 3000);
    });

    player.on(mpegts.Events.STATISTICS_INFO, function() {
      streamStarted = true;
      setStatus('Live', 'connected');
    });

    player.on(mpegts.Events.LOADING_COMPLETE, function() {
      setStatus('Stream ended - reconnecting...');
      setTimeout(function() {
        startStream(PROXY_URL, false);
      }, 3000);
    });

  } else {
    // Fallback for browsers without MediaSource
    video.src = PROXY_URL;
    video.load();
    var p = video.play();
    if (p && p.then) {
      p.then(function() {
        streamStarted = true;
        playBtn.classList.add('hidden');
        setStatus('Live', 'connected');
      }).catch(function() {
        setStatus('Cannot autoplay', 'error');
      });
    }
  }
}

// Bind ALL possible interaction events for maximum TV compatibility
playBtn.addEventListener('click', handlePlayAction, true);
playBtn.addEventListener('touchend', handlePlayAction, true);
playBtn.addEventListener('pointerup', handlePlayAction, true);
playBtn.addEventListener('keydown', function(e) {
  // TV remotes send Enter or Space key
  if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 32) {
    handlePlayAction(e);
  }
}, true);

// Also make the entire player wrapper clickable as fallback
document.querySelector('.player-wrapper').addEventListener('click', function(e) {
  // Only handle if the click was NOT on the play button itself
  if (e.target === playBtn || playBtn.contains(e.target)) return;

  if (video.paused || !streamStarted) {
    handlePlayAction(e);
  } else {
    video.pause();
  }
});

// Video state listeners
video.addEventListener('play', function() {
  playBtn.textContent = '❚❚';
  playBtn.classList.add('hidden');
  streamStarted = true;
});

video.addEventListener('pause', function() {
  playBtn.textContent = '▶';
  playBtn.classList.remove('hidden');
});

video.addEventListener('waiting', function() {
  setStatus('Buffering...', '');
});

video.addEventListener('playing', function() {
  setStatus('Live', 'connected');
  playBtn.classList.add('hidden');
});

// Prevent duplicate fires from touch+click on same element
var lastPlayTime = 0;
var origHandler = handlePlayAction;
handlePlayAction = function(e) {
  var now = Date.now();
  if (now - lastPlayTime < 500) return; // debounce 500ms
  lastPlayTime = now;
  origHandler(e);
};

// Re-bind with debounced version
playBtn.removeEventListener('click', origHandler, true);
playBtn.removeEventListener('touchend', origHandler, true);
playBtn.removeEventListener('pointerup', origHandler, true);
playBtn.addEventListener('click', handlePlayAction, true);
playBtn.addEventListener('touchend', handlePlayAction, true);
playBtn.addEventListener('pointerup', handlePlayAction, true);
playBtn.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 32) {
    handlePlayAction(e);
  }
}, true);

// Auto-start on page load (will work if browser allows muted autoplay)
setStatus('Connecting...');
startStream(PROXY_URL, false);
