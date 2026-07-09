const STREAM_URL = 'http://ugeen.live:8080/Ugeen_VIPtHEG0y/1hLFbj/4526';
const video = document.getElementById('video');
const statusEl = document.getElementById('status');

function setStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (type ? ' ' + type : '');
}

const isHttps = location.protocol === 'https:';
const PROXY_URL = isHttps ? '/api/stream' : STREAM_URL;

let player = null;

function playStream(url) {
  if (mpegts.isSupported()) {
    player = mpegts.createPlayer({
      type: 'mpegts',
      url: url,
      isLive: true,
    });
    player.attachMediaElement(video);
    player.load();
    player.on(mpegts.Events.LIVE, () => {
      setStatus('Live', 'connected');
    });
    player.on(mpegts.Events.ERROR, () => {
      setStatus('Stream error', 'error');
    });
    player.on(mpegts.Events.LOADING_COMPLETED, () => {
      setStatus('Reconnecting...');
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    video.addEventListener('loadedmetadata', () => {
      video.play().catch(() => {});
      setStatus('Live', 'connected');
    });
    video.addEventListener('error', () => {
      setStatus('Stream unavailable', 'error');
    });
  } else {
    video.src = url;
    video.addEventListener('error', () => {
      setStatus('Browser cannot play this stream', 'error');
    });
  }
}

setStatus('Connecting...');
playStream(PROXY_URL);
