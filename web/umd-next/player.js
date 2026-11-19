// Main Thread: gestisce VideoDecoder (WebCodecs), Web Audio API e sincronizzazione A/V
const isoInput = document.getElementById('isoInput');
const playPauseBtn = document.getElementById('playPauseBtn');
const seekBar = document.getElementById('seekBar');
const timeLabel = document.getElementById('timeLabel');
const statusText = document.getElementById('statusText');
const resLabel = document.getElementById('resLabel');
const canvas = document.getElementById('videoCanvas');
const ctx = canvas.getContext('2d');

const FRAME_VIDEO_H264 = 1;
const FRAME_AUDIO_PCM = 2;

const worker = new Worker('worker.js');

let videoDecoder = null;
let waitingForKeyFrame = true;
let isPlaying = false;
let isSeeking = false;

// Web Audio API (riproduzione PCM Float32 48kHz Stereo)
let audioCtx = null;
let nextAudioTime = 0;
let basePts = null;
let baseAudioTime = 0;
let firstVideoPts = null;
let videoWallStart = 0;
let videoPackets = 0;
let audioPackets = 0;
let decodedFrames = 0;
let playbackStart = 0;

// Coda frame video sincronizzati con l'orologio audio
const videoQueue = [];
let renderLoopId = null;

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function initVideoDecoder(width, height) {
  if (videoDecoder) {
    try { videoDecoder.close(); } catch (_) {}
  }
  clearVideoQueue();
  waitingForKeyFrame = true;

  canvas.width = width;
  canvas.height = height;
  resLabel.textContent = `${width}x${height}`;

  videoDecoder = new VideoDecoder({
    output: (frame) => {
      decodedFrames++;
      videoQueue.push(frame);
    },
    error: (err) => {
      console.error('Errore VideoDecoder:', err);
      statusText.textContent = 'Errore decodifica H.264: ' + err.message;
    }
  });

  // Omettendo 'description', WebCodecs accetta stream Annex-B (00 00 00 01) estratti da FFmpeg
  videoDecoder.configure({
    codec: 'avc1.4D401E', // Main Profile Level 3.0 (standard PSP UMD)
    codedWidth: width,
    codedHeight: height,
    optimizeForLatency: true
  });
}

function clearVideoQueue() {
  while (videoQueue.length > 0) {
    const f = videoQueue.shift();
    f.close();
  }
}

function scheduleAudio(buffer, pts) {
  initAudio();
  const floatData = new Float32Array(buffer);
  const numFrames = floatData.length / 2; // Stereo interleaved
  if (numFrames === 0) return;

  const audioBuffer = audioCtx.createBuffer(2, numFrames, 48000);
  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.getChannelData(1);

  for (let i = 0; i < numFrames; i++) {
    left[i] = floatData[i * 2];
    right[i] = floatData[i * 2 + 1];
  }

  const now = audioCtx.currentTime;
  if (nextAudioTime < now) {
    nextAudioTime = now + 0.05;
  }

  if (basePts === null) {
    basePts = pts;
    baseAudioTime = nextAudioTime;
  }

  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioCtx.destination);
  source.start(nextAudioTime);

  nextAudioTime += audioBuffer.duration;
}

function startRenderLoop() {
  if (renderLoopId) cancelAnimationFrame(renderLoopId);

  const render = () => {
    if (isPlaying) {
      // Calcola il tempo corrente del filmato basandosi sull'orologio hardware dell'audio
      const hasAudioClock = audioCtx && audioCtx.state === 'running' && basePts !== null;
      const mediaClock = hasAudioClock ? basePts + (audioCtx.currentTime - baseAudioTime) : (firstVideoPts === null ? 0 : firstVideoPts + (performance.now() - videoWallStart) / 1000);

      if (!isSeeking) {
        seekBar.value = Math.floor(mediaClock);
        timeLabel.textContent = formatTime(mediaClock);
      }

      // Disegna il frame corrispondente al timestamp corrente
      while (videoQueue.length > 0) {
        const frame = videoQueue[0];
        const framePts = frame.timestamp / 1_000_000;

        if (framePts <= mediaClock + 0.02) {
          videoQueue.shift();
          ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
          frame.close();
        } else {
          break;
        }
      }
    }

    // Applica backpressure al Worker se il buffer video in memoria supera 30 frame
    if (isPlaying && videoQueue.length > 30) {
      worker.postMessage({ type: 'pause' });
    } else if (isPlaying && videoQueue.length < 15) {
      worker.postMessage({ type: 'resume' });
    }

    if (isPlaying && performance.now() - playbackStart > 2500 && decodedFrames === 0) {
      statusText.textContent = `Diagnostica: video ${videoPackets} pacchetti, audio ${audioPackets}, frame decodificati ${decodedFrames}. ${videoPackets === 0 ? 'Nessun pacchetto video ricevuto.' : 'Il decoder H.264 non ha prodotto immagini.'}`;
    }
    renderLoopId = requestAnimationFrame(render);
  };

  renderLoopId = requestAnimationFrame(render);
}

worker.onmessage = (e) => {
  const msg = e.data;

  if (msg.type === 'ready') {
    statusText.textContent = 'Motore WASM pronto. Seleziona una ISO UMD Video.';
  } else if (msg.type === 'opened') {
    initAudio();
    initVideoDecoder(msg.width, msg.height);
    basePts = null;
    firstVideoPts = null;
    videoPackets = audioPackets = decodedFrames = 0;
    playbackStart = performance.now();
    nextAudioTime = 0;
    isPlaying = true;
    playPauseBtn.disabled = false;
    playPauseBtn.textContent = 'Pausa';
    seekBar.disabled = false;
    statusText.textContent = 'Riproduzione in corso...';
    startRenderLoop();
  } else if (msg.type === 'packet') {
    if (msg.frameType === FRAME_VIDEO_H264) {
      videoPackets++;
      if (firstVideoPts === null) { firstVideoPts = msg.pts; videoWallStart = performance.now(); }
      if (waitingForKeyFrame && !msg.isKey) {
        return; // Scarta i P/B frame finche' non arriva un I-Frame valido
      }
      waitingForKeyFrame = false;

      if (videoDecoder && videoDecoder.state === 'configured') {
        const chunk = new EncodedVideoChunk({
          type: msg.isKey ? 'key' : 'delta',
          timestamp: Math.round(msg.pts * 1_000_000), // microsecondi
          data: msg.buffer
        });
        try { videoDecoder.decode(chunk); } catch (err) { statusText.textContent = 'Errore WebCodecs: ' + err.message; console.error(err); }
      }
    } else if (msg.frameType === FRAME_AUDIO_PCM) {
      audioPackets++;
      scheduleAudio(msg.buffer, msg.pts);
    }
  } else if (msg.type === 'seeked') {
    clearVideoQueue();
    if (videoDecoder && videoDecoder.state === 'configured') {
      videoDecoder.reset();
      videoDecoder.configure({
        codec: 'avc1.4D401E',
        codedWidth: canvas.width,
        codedHeight: canvas.height,
        optimizeForLatency: true
      });
    }
    waitingForKeyFrame = true;
    basePts = null;
    firstVideoPts = null;
    videoPackets = audioPackets = decodedFrames = 0;
    playbackStart = performance.now();
    nextAudioTime = 0;
    isSeeking = false;
  } else if (msg.type === 'eof') {
    statusText.textContent = 'Riproduzione terminata.';
    isPlaying = false;
    playPauseBtn.textContent = 'Riproduci';
  } else if (msg.type === 'error') {
    statusText.textContent = 'Errore: ' + msg.message;
  }
};

isoInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  statusText.textContent = `Apertura ${file.name}...`;
  statusText.textContent = 'Analisi struttura ISO in corso...';
  const report = await inspectIso9660(file);
  statusText.textContent = report;
  console.info('FRAME ISO preflight:', report);
  if (!report.startsWith('ISO9660 OK')) return;
  try { initAudio(); } catch (err) { console.warn('Audio non disponibile:', err); }
  worker.postMessage({ type: 'open', file });
});

playPauseBtn.addEventListener('click', () => {
  if (isPlaying) {
    isPlaying = false;
    worker.postMessage({ type: 'pause' });
    if (audioCtx) audioCtx.suspend();
    playPauseBtn.textContent = 'Riproduci';
    statusText.textContent = 'In pausa';
  } else {
    isPlaying = true;
    if (audioCtx) audioCtx.resume();
    worker.postMessage({ type: 'resume' });
    playPauseBtn.textContent = 'Pausa';
    statusText.textContent = 'Riproduzione in corso...';
  }
});

seekBar.addEventListener('input', () => {
  isSeeking = true;
  timeLabel.textContent = formatTime(Number(seekBar.value));
});

seekBar.addEventListener('change', () => {
  const targetSec = Number(seekBar.value);
  worker.postMessage({ type: 'seek', seconds: targetSec });
});

// Controllo preliminare ISO 9660: non legge l'intero file in memoria.
async function inspectIso9660(file) {
  const sector = 2048;
  const read = async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
  const le32 = (b, i) => (b[i] | (b[i+1] << 8) | (b[i+2] << 16) | (b[i+3] << 24)) >>> 0;
  const pvd = await read(16 * sector, sector);
  if (pvd.length !== sector || pvd[0] !== 1 || String.fromCharCode(...pvd.slice(1, 6)) !== 'CD001') {
    return 'Formato ISO 9660 non riconosciuto (firma CD001 assente al settore 16).';
  }
  const directory = async (lba, size) => {
    if (!size || size > 16 * 1024 * 1024 || lba * sector + size > file.size) throw new Error('Directory ISO non valida.');
    const b = await read(lba * sector, size);
    const entries = [];
    for (let p = 0; p < b.length;) {
      const n = b[p];
      if (!n) { p = (Math.floor(p / sector) + 1) * sector; continue; }
      if (n < 34 || p + n > b.length || p + 33 + b[p+32] > p + n) break;
      const len = b[p+32];
      let name = String.fromCharCode(...b.slice(p+33, p+33+len)).split(';')[0].toUpperCase();
      if (!(len === 1 && (b[p+33] === 0 || b[p+33] === 1))) entries.push({name,lba:le32(b,p+2),size:le32(b,p+10),dir:!!(b[p+25]&2)});
      p += n;
    }
    return entries;
  };
  try {
    let entries = await directory(le32(pvd,158), le32(pvd,166));
    const umd = entries.find(x => x.dir && x.name === 'UMD_VIDEO');
    if (!umd) return 'ISO valida, ma manca la cartella UMD_VIDEO: potrebbe non essere un disco UMD Video.';
    entries = await directory(umd.lba, umd.size);
    const stream = entries.find(x => x.dir && x.name === 'STREAM');
    if (!stream) return 'Cartella UMD_VIDEO presente, ma STREAM assente.';
    entries = await directory(stream.lba, stream.size);
    const movies = entries.filter(x => !x.dir && x.name.endsWith('.MPS'));
    if (!movies.length) return 'Cartella STREAM presente, ma nessun file .MPS trovato.';
    const largest = movies.reduce((a,b)=>a.size>b.size?a:b);
    const start = await read(largest.lba * sector, 32);
    const hex = Array.from(start.slice(0,12), x => x.toString(16).padStart(2,'0')).join(' ');
    return 'ISO9660 OK; ' + movies.length + ' file MPS; principale: ' + largest.name + ' (' + Math.round(largest.size/1048576) + ' MiB); primi byte: ' + hex + '.';
  } catch (err) { return 'Errore nell’analisi delle directory ISO: ' + err.message; }
}
