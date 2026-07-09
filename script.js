const STREAM_URL = 'http://ugeen.live:8080/Ugeen_VIPtHEG0y/1hLFbj/4526';
const video = document.getElementById('video');
const statusEl = document.getElementById('status');

function setStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (type ? ' ' + type : '');
}

function playVideo(src) {
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
    video.addEventListener('loadedmetadata', () => {
      video.play().catch(() => {});
      setStatus('Live', 'connected');
    });
    video.addEventListener('error', () => {
      setStatus('Error: browser cannot play stream', 'error');
    });
  } else if (window.Hls) {
    const hls = new Hls({ debug: false });
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
      setStatus('Live', 'connected');
    });
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        setStatus('Stream unavailable', 'error');
      }
    });
  } else {
    video.src = src;
    video.addEventListener('error', () => {
      setStatus('Stream unavailable', 'error');
    });
  }
}

setStatus('Connecting...');
playVideo(STREAM_URL);
