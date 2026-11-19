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

const worker = new Worker('worker.js?v=bp-ea69c8b4');

let videoDecoder = null;
let waitingForKeyFrame = true;
let isPlaying = false;
let isSeeking = false;
let fatalDecoderError = false;
let workerFlowPaused = false;
function stopOnDecoderFailure(message) {
  if (fatalDecoderError) return;
  fatalDecoderError = true;
  isPlaying = false;
  workerFlowPaused = true;
  workerAcksPending = 0;
  worker.postMessage({type:'halt'});
  playPauseBtn.textContent = 'Errore video';
  playPauseBtn.disabled = true;
  statusText.textContent = 'Decodifica interrotta: ' + message + '. Carica nuovamente la ISO dopo una correzione.';
  updateDiagnostics();
}

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
let videoKeyPackets = 0;
let decoderErrors = 0;
let lastDiagnostic = 0;
let firstPacketHex = '';
let h264Sps = null, h264Pps = null, avccReady = false;
let lastDecoderError = '';
let droppedNonVideoNals = 0;
let packetsWithoutStartCode = 0;
let firstDecodeNalTypes = '';
let firstDecodeBytes = 0;
let workerAcksPending = 0;
const MAX_DECODE_QUEUE = 10;
let maxDecodeQueueSeen = 0;
function acknowledgePacket() {
  const queue = videoDecoder?.state === 'configured' ? videoDecoder.decodeQueueSize : 0;
  maxDecodeQueueSeen = Math.max(maxDecodeQueueSeen, queue);
  if (isPlaying && queue > MAX_DECODE_QUEUE) {
    workerAcksPending++;
    setTimeout(drainWorkerAcks, 16);
  } else worker.postMessage({type:'packet-consumed'});
}
function drainWorkerAcks() {
  if (!workerAcksPending) return;
  const queue = videoDecoder?.state === 'configured' ? videoDecoder.decodeQueueSize : 0;
  if (!isPlaying || queue <= MAX_DECODE_QUEUE) {
    while(workerAcksPending>0) {workerAcksPending--;worker.postMessage({type:'packet-consumed'});}
  } else setTimeout(drainWorkerAcks,16);
}

let accessUnitBuffer = new Uint8Array(0);
let accessUnitPts = 0;
let completedAccessUnits = 0;
let incompleteAccessUnits = 0;
let lastAccessUnitTime = 0;
function audBoundaries(b) {
  const out=[];
  for(let i=0;i+3<b.length;i++) {
    if(b[i]===0 && b[i+1]===0 && (b[i+2]===1 || (b[i+2]===0 && b[i+3]===1))) {
      const offset=i+(b[i+2]===1?3:4);
      if(offset<b.length && (b[offset]&31)===9) out.push(i);
      i=offset-1;
    }
  }
  return out;
}
function resetAccessUnits() {accessUnitBuffer=new Uint8Array(0);accessUnitPts=0;completedAccessUnits=0;incompleteAccessUnits=0;lastAccessUnitTime=0;}
function appendAccessUnits(buffer, pts) {
  const incoming=new Uint8Array(buffer);
  if(!incoming.length) return [];
  if(accessUnitBuffer.length===0) accessUnitPts=pts;
  const merged=new Uint8Array(accessUnitBuffer.length+incoming.length);
  merged.set(accessUnitBuffer);merged.set(incoming,accessUnitBuffer.length);
  const positions=audBoundaries(merged), result=[];
  if(positions.length>=2) {
    for(let i=0;i<positions.length-1;i++) {
      const start=i===0?0:positions[i];
      const bytes=merged.slice(start,positions[i+1]);
      if(bytes.length) result.push({buffer:bytes,pts:accessUnitPts});
      accessUnitPts=pts;
    }
    accessUnitBuffer=merged.slice(positions[positions.length-1]);
  } else if(merged.length>2*1024*1024) {
    // No reliable AUD boundary: do not feed a guessed partial frame to WebCodecs.
    incompleteAccessUnits++;
    accessUnitBuffer=merged.slice(-4);
    accessUnitPts=pts;
  } else accessUnitBuffer=merged;
  completedAccessUnits+=result.length;
  lastAccessUnitTime=performance.now();
  return result;
}

function splitAnnexB(buffer) {
  const b = new Uint8Array(buffer), starts = [];
  for (let i=0; i+3<b.length;) {
    if(b[i]===0 && b[i+1]===0 && (b[i+2]===1 || (b[i+2]===0 && b[i+3]===1))) {
      starts.push({start:i, payload:i+(b[i+2]===1?3:4)}); i += b[i+2]===1?3:4;
    } else i++;
  }
  return starts.map((x,i)=>b.slice(x.payload,i+1<starts.length?starts[i+1].start:b.length)).filter(x=>x.length);
}
function avccDescription(sps,pps) {
  const out = new Uint8Array(11+sps.length+pps.length);
  let p=0; out[p++]=1;out[p++]=sps[1];out[p++]=sps[2];out[p++]=sps[3];out[p++]=0xff;out[p++]=0xe1;
  out[p++]=sps.length>>>8;out[p++]=sps.length&255;out.set(sps,p);p+=sps.length;
  out[p++]=1;out[p++]=pps.length>>>8;out[p++]=pps.length&255;out.set(pps,p);
  return out;
}
function toAvcc(nals) {
  const length=nals.reduce((a,n)=>a+4+n.length,0), out=new Uint8Array(length);let p=0;
  for(const n of nals){const len=n.length;out[p++]=(len>>>24)&255;out[p++]=(len>>>16)&255;out[p++]=(len>>>8)&255;out[p++]=len&255;out.set(n,p);p+=len;}
  return out;
}

const diagnostics = document.createElement('pre');
diagnostics.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 monospace;color:#c4d7e8;background:#10151e;padding:12px;border-radius:8px;margin-top:12px';
diagnostics.textContent = 'Diagnostica: in attesa della ISO';
document.querySelector('.container').appendChild(diagnostics);
function updateDiagnostics() {
  diagnostics.textContent = `Video: ${videoPackets} pacchetti (key: ${videoKeyPackets}) | Audio: ${audioPackets} | Frame: ${decodedFrames} | Errori decoder: ${decoderErrors}\nPrimo pacchetto: ${firstPacketHex || 'nessuno'}\nAudio: ${audioCtx?.state || 'non inizializzato'} | Decoder: ${videoDecoder?.state || 'non inizializzato'} | AVCC: ${avccReady ? 'configurato' : 'in attesa SPS/PPS'}\nUltimo errore: ${lastDecoderError || 'nessuno'}\nNAL scartate (AUD/SEI/altri): ${droppedNonVideoNals} | Pacchetti senza start code: ${packetsWithoutStartCode}\nPrimo chunk: ${firstDecodeNalTypes || 'non inviato'} (${firstDecodeBytes} byte)\nCoda decoder: ${videoDecoder?.decodeQueueSize ?? 0} (picco ${maxDecodeQueueSeen}) | ACK sospesi: ${workerAcksPending}\nAccess unit complete: ${completedAccessUnits} | Buffer: ${accessUnitBuffer.length} byte | Overflow: ${incompleteAccessUnits}`;
}
function containsIdr(buffer) {
  const b = new Uint8Array(buffer);
  for(let i=0;i+4<b.length;i++) {
    if(b[i]===0 && b[i+1]===0 && (b[i+2]===1 || (b[i+2]===0 && b[i+3]===1))) {
      const p=i+(b[i+2]===1?3:4);
      if(p<b.length && (b[p]&31)===5) return true;
    }
  }
  return false;
}

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
      decoderErrors++;
      lastDecoderError = err?.message || String(err);
      console.error('Errore VideoDecoder:', err);
      stopOnDecoderFailure(lastDecoderError);
    }
  });

  // Configurazione rimandata finché non troviamo SPS e PPS nel flusso.
  avccReady = false;
  h264Sps = h264Pps = null;
  lastDecoderError = '';
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
          try {
            // Use the decoded frame's actual display dimensions; never stretch
            // a differently sized VideoFrame into a fixed 480x272 backing store.
            const displayWidth = frame.displayWidth || frame.codedWidth;
            const displayHeight = frame.displayHeight || frame.codedHeight;
            if (displayWidth > 0 && displayHeight > 0) {
              if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
                canvas.width = displayWidth;
                canvas.height = displayHeight;
                resLabel.textContent = displayWidth + 'x' + displayHeight;
              }
              ctx.drawImage(frame, 0, 0, displayWidth, displayHeight);
            }
          } catch (err) {
            lastDecoderError = 'Canvas: ' + (err?.message || String(err));
            updateDiagnostics();
          } finally {
            frame.close();
          }
        } else {
          break;
        }
      }
    }

    // Send flow-control transitions only, not a resume on every animation frame.
    if (isPlaying && !fatalDecoderError) {
      if (videoQueue.length > 30 && !workerFlowPaused) {
        workerFlowPaused = true;
        worker.postMessage({type:'pause'});
      } else if (videoQueue.length < 15 && workerFlowPaused) {
        workerFlowPaused = false;
        worker.postMessage({type:'resume'});
      }
    }

    if (isPlaying && completedAccessUnits > 150 && decodedFrames === 0) {
      stopOnDecoderFailure('Nessun fotogramma dopo 150 access unit');
    }
    if (isPlaying && performance.now() - lastDiagnostic > 1000) { lastDiagnostic = performance.now(); updateDiagnostics(); }
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
    fatalDecoderError = false;
    workerFlowPaused = false;
    initVideoDecoder(msg.width, msg.height);
    basePts = null;
    firstVideoPts = null;
    videoPackets = audioPackets = decodedFrames = videoKeyPackets = decoderErrors = 0;
    firstPacketHex = ''; droppedNonVideoNals = packetsWithoutStartCode = firstDecodeBytes = 0; firstDecodeNalTypes = ''; resetAccessUnits(); workerAcksPending=0;maxDecodeQueueSeen=0;
    updateDiagnostics();
    playbackStart = performance.now();
    nextAudioTime = 0;
    isPlaying = true;
    playPauseBtn.disabled = false;
    playPauseBtn.textContent = 'Pausa';
    seekBar.disabled = false;
    statusText.textContent = 'Riproduzione in corso...';
    const boot = document.getElementById('bootDiagnostics');
    if (boot) boot.textContent = 'ISO aperta dal motore WASM. Diagnostica dei pacchetti in basso.';
    startRenderLoop();
  } else if (msg.type === 'packet') {
    if (fatalDecoderError) return;
    try {
    if (msg.frameType === FRAME_VIDEO_H264) {
      videoPackets++;
      if (!firstPacketHex) firstPacketHex = Array.from(new Uint8Array(msg.buffer).slice(0,24), b=>b.toString(16).padStart(2,'0')).join(' ');
      const accessUnits = appendAccessUnits(msg.buffer, msg.pts);
      for (const unit of accessUnits) {
      const nals = splitAnnexB(unit.buffer);
      if (!nals.length) { packetsWithoutStartCode++; continue; }
      for(const nal of nals) {
        if ((nal[0]&31)===7) h264Sps = nal;
        if ((nal[0]&31)===8) h264Pps = nal;
      }
      // Conserva solo slice VCL (1/5): SPS/PPS sono già nella description avcC.
      // AUD (9), SEI (6) e altre unità non sono inviate al decoder hardware.
      const videoNals = nals.filter(n => { const t=n[0]&31; const keep=t===1 || t===5; if (!keep && t!==7 && t!==8) droppedNonVideoNals++; return keep; });
      const keyPacket = videoNals.some(n=>(n[0]&31)===5);
      if (keyPacket) videoKeyPackets++;
      if (!avccReady && h264Sps && h264Pps && videoDecoder?.state === 'unconfigured') {
        try {
          videoDecoder.configure({
            codec: 'avc1.' + Array.from(h264Sps.slice(1,4),b=>b.toString(16).padStart(2,'0')).join(''),
            description: avccDescription(h264Sps,h264Pps),
            codedWidth: canvas.width, codedHeight: canvas.height,
            optimizeForLatency: true
          });
          avccReady = true;
          updateDiagnostics();
        } catch(err) {
          lastDecoderError = err.message || String(err);
          statusText.textContent = 'Configurazione AVCC: ' + lastDecoderError;
          updateDiagnostics();
          stopOnDecoderFailure(lastDecoderError);
          return;
        }
      }
      if (firstVideoPts === null) { firstVideoPts = unit.pts; videoWallStart = performance.now(); }
      if (!avccReady || !videoNals.length || (waitingForKeyFrame && !keyPacket)) continue;
      waitingForKeyFrame = false;
      if (videoDecoder?.state === 'configured') {
        try {
          if (!firstDecodeNalTypes) { firstDecodeNalTypes = videoNals.map(n=>n[0]&31).join(','); firstDecodeBytes = videoNals.reduce((a,n)=>a+n.length+4,0); }
          videoDecoder.decode(new EncodedVideoChunk({
            type: keyPacket ? 'key' : 'delta',
            timestamp: Math.round(unit.pts * 1000000),
            data: toAvcc(videoNals)
          }));
        } catch(err) {
          lastDecoderError = err.message || String(err);
          statusText.textContent = 'Errore WebCodecs: ' + lastDecoderError;
          updateDiagnostics();
          worker.postMessage({type:'pause'});isPlaying=false;
        }
      }
      }
    } else if (msg.frameType === FRAME_AUDIO_PCM) {
      audioPackets++;
      scheduleAudio(msg.buffer, msg.pts);
    }
    } finally { if (!fatalDecoderError) acknowledgePacket(); }
  } else if (msg.type === 'seeked') {
    clearVideoQueue();
    if (videoDecoder && videoDecoder.state === 'configured') {
      videoDecoder.reset();
      avccReady = false;
      h264Sps = h264Pps = null;
    }
    waitingForKeyFrame = true;
    resetAccessUnits();
    workerAcksPending=0;
    workerFlowPaused=false;
    basePts = null;
    firstVideoPts = null;
    videoPackets = audioPackets = decodedFrames = 0;
    playbackStart = performance.now();
    nextAudioTime = 0;
    isSeeking = false;
  } else if (msg.type === 'eof') {
    updateDiagnostics();
    statusText.textContent = 'Riproduzione terminata.';
    isPlaying = false;
    playPauseBtn.textContent = 'Riproduci';
  } else if (msg.type === 'error') {
    updateDiagnostics();
    statusText.textContent = 'Errore: ' + msg.message;
    const boot = document.getElementById('bootDiagnostics');
    if (boot) boot.textContent = 'Errore motore: ' + msg.message + '\nControlla anche il risultato analisi ISO riportato nella diagnostica.';
  }
};

isoInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  statusText.textContent = `Apertura ${file.name}...`;
  statusText.textContent = 'Analisi struttura ISO in corso...';
  const report = await inspectIso9660(file);
  statusText.textContent = report;
  const boot = document.getElementById('bootDiagnostics');
  if (boot) boot.textContent = 'Analisi ISO: ' + report;
  diagnostics.textContent = 'Analisi ISO: ' + report;
  console.info('FRAME ISO preflight:', report);
  if (!report.startsWith('ISO9660 OK')) return;
  try { initAudio(); } catch (err) { console.warn('Audio non disponibile:', err); }
  worker.postMessage({ type: 'open', file });
});

playPauseBtn.addEventListener('click', () => {
  if (fatalDecoderError) return;
  if (isPlaying) {
    isPlaying = false;
    workerFlowPaused = true;
    worker.postMessage({ type: 'pause' });
    if (audioCtx) audioCtx.suspend();
    playPauseBtn.textContent = 'Riproduci';
    statusText.textContent = 'In pausa';
  } else {
    isPlaying = true;
    workerFlowPaused = false;
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
