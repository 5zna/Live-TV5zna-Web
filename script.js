var STREAM_URL = 'http://ugeen.live:8080/Ugeen_VIPtHEG0y/1hLFbj/4527';
var video = document.getElementById('video');
var statusEl = document.getElementById('status');
var playerWrapper = document.querySelector('.player-wrapper');

function setStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (type ? ' ' + type : '');
}

var isHttps = location.protocol === 'https:';
var PROXY_URL = isHttps ? '/api/stream' : STREAM_URL;

var player = null;
var streamStarted = false;
var connectionStarted = false; // Has the user clicked to start the connection?
var isConnecting = false;       // Is it currently in the loading/connecting phase?
var currentAttempt = 0;
var retryTimeout = null;
var lastPlayTime = 0;

// Smart TV Detection
var ua = navigator.userAgent.toLowerCase();
var isSmartTV = ua.indexOf('smarttv') > -1 || 
                ua.indexOf('tizen') > -1 || 
                ua.indexOf('webos') > -1 || 
                ua.indexOf('smart-tv') > -1 || 
                ua.indexOf('lgbrowser') > -1 || 
                ua.indexOf('tv') > -1 || 
                ua.indexOf('appletv') > -1 || 
                ua.indexOf('googletv') > -1 || 
                ua.indexOf('roku') > -1;

console.log('Device Type: ' + (isSmartTV ? 'Smart TV' : 'PC/Mobile'));

// Define the playback methods to try in sequence
var PLAYBACK_METHODS = [];
if (isSmartTV) {
  PLAYBACK_METHODS = [
    { name: 'Native Direct', useMpegts: false, url: STREAM_URL },
    { name: 'Native Proxy', useMpegts: false, url: PROXY_URL },
    { name: 'MPEGTS Direct', useMpegts: true, url: STREAM_URL },
    { name: 'MPEGTS Proxy', useMpegts: true, url: PROXY_URL }
  ];
} else {
  PLAYBACK_METHODS = [
    { name: 'MPEGTS Proxy', useMpegts: true, url: PROXY_URL },
    { name: 'MPEGTS Direct', useMpegts: true, url: STREAM_URL },
    { name: 'Native Proxy', useMpegts: false, url: PROXY_URL },
    { name: 'Native Direct', useMpegts: false, url: STREAM_URL }
  ];
}

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
  
  // Keep the user-facing status simple and clean
  setStatus('جاري الاتصال...', 'connecting');

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

      player.on(mpegts.Events.ERROR, function(errorType, errorDetail, errorInfo) {
        console.error('MPEGTS Error in ' + method.name + ':', errorType, errorDetail, errorInfo);
        scheduleNextAttempt();
      });

      player.on(mpegts.Events.STATISTICS_INFO, function() {
        if (!streamStarted) {
          streamStarted = true;
          isConnecting = false;
          setStatus('Live', 'connected');
        }
      });

      player.on(mpegts.Events.LOADING_COMPLETE, function() {
        console.log('MPEGTS Loading complete in ' + method.name);
        scheduleNextAttempt();
      });

      try {
        var playPromise = video.play();
        if (playPromise !== undefined && typeof playPromise.then === 'function') {
          playPromise.then(function() {
            console.log('Playing successfully using ' + method.name);
          }).catch(function(err) {
            console.log('Autoplay blocked/failed for ' + method.name + ':', err.message);
          });
        }
      } catch (playError) {
        console.log('Autoplay blocked synchronously for ' + method.name + ':', playError);
      }

    } catch (e) {
      console.error('Failed to initialize mpegts player for ' + method.name + ':', e);
      scheduleNextAttempt();
    }
  } else {
    // Native HTML5 fallback
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
              isConnecting = false;
              setStatus('Live (Native)', 'connected');
            }).catch(function(err) {
              console.log('Native play blocked for ' + method.name + ':', err.message);
            });
          } else {
            streamStarted = true;
            isConnecting = false;
            setStatus('Live (Native)', 'connected');
          }
        } catch (playError) {
          console.log('Native play blocked synchronously for ' + method.name + ':', playError);
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
  
  // Keep displaying connecting/loading status to avoid confusing the user
  setStatus('جاري الاتصال...', 'connecting');
  
  // Wait 8 seconds before trying next method silently
  retryTimeout = setTimeout(function() {
    retryTimeout = null;
    currentAttempt++;
    tryNextPlaybackMethod(false);
  }, 8000);
}

// ============================================================
// PLAYER CLICK HANDLER (Single Action)
// ============================================================
function handlePlayerClick(e) {
  var now = Date.now();
  if (now - lastPlayTime < 800) {
    if (e) e.preventDefault();
    return;
  }
  lastPlayTime = now;

  console.log('Player click triggered. Started: ' + streamStarted + ', Connecting: ' + isConnecting);

  if (!connectionStarted) {
    // 1. Initial click: Start the connection sequence
    connectionStarted = true;
    isConnecting = true;
    currentAttempt = 0;
    tryNextPlaybackMethod(true); // User gesture = true (starts unmuted)
  } else if (isConnecting) {
    // 2. Currently connecting: Ignore click to prevent aborting/restarting the connection
    console.log('Stream is connecting. Ignoring click.');
  } else if (streamStarted) {
    // 3. Playback active: standard play/pause toggle
    if (video.paused) {
      video.muted = false;
      video.play().catch(function() {});
    } else {
      video.pause();
    }
  }
}

// Bind click event to the player wrapper (landing area)
playerWrapper.addEventListener('click', handlePlayerClick);
playerWrapper.addEventListener('touchend', handlePlayerClick);

// Also handle keyboard navigation (Enter/Space)
playerWrapper.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 32) {
    handlePlayerClick(e);
  }
});

// Update status overlay text based on HTML5 video events
video.addEventListener('waiting', function() {
  if (streamStarted) {
    setStatus('جاري التحميل...', 'buffering');
  }
});

video.addEventListener('playing', function() {
  isConnecting = false;
  streamStarted = true;
  setStatus('Live', 'connected');
});

video.addEventListener('pause', function() {
  if (streamStarted) {
    setStatus('مؤقت (اضغط للاستئناف)', 'paused');
  }
});

video.addEventListener('play', function() {
  if (streamStarted) {
    setStatus('Live', 'connected');
  }
});
