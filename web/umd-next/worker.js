// Web Worker: monta la ISO tramite WORKERFS ed esegue il demuxing C++ / FFmpeg in background
importScripts('umd_core.js');

let Module = null;
let isRunning = false;
let halted = false;
let pumpTimer = null;
let outstandingPackets = 0;
const MAX_IN_FLIGHT = 8;

// Tipi pacchetto allineati con enum FrameType in umd_demuxer.h
const FRAME_VIDEO_H264 = 1;
const FRAME_AUDIO_PCM = 2;
const FRAME_EOF = 3;
const FRAME_ERROR = -1;

createUmdModule().then((mod) => {
  Module = mod;
  postMessage({ type: 'ready' });
});

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === 'open') {
    if (!Module) return;
    stopPump();
    halted = false;
    outstandingPackets = 0;

    try {
      // Crea punto di mount virtuale per leggere la ISO dal disco senza caricarla in RAM
      try { Module.FS.mkdir('/work'); } catch (_) {}
      try { Module.FS.unmount('/work'); } catch (_) {}

      Module.FS.mount(Module.WORKERFS, { files: [msg.file] }, '/work');
      const isoPath = '/work/' + msg.file.name;

      const ok = Module.ccall('umd_open_path', 'number', ['string'], [isoPath]);
      if (!ok) {
        postMessage({ type: 'error', message: 'Impossibile aprire UMD_VIDEO/STREAM/*.MPS nella ISO.' });
        return;
      }

      const width = Module._umd_get_width();
      const height = Module._umd_get_height();

      postMessage({ type: 'opened', width, height });
      startPump();
    } catch (err) {
      postMessage({ type: 'error', message: err.message || String(err) });
    }
  } else if (msg.type === 'halt') {
    halted = true;
    stopPump();
    outstandingPackets = 0;
  } else if (msg.type === 'packet-consumed') {
    outstandingPackets = Math.max(0, outstandingPackets - 1);
  } else if (msg.type === 'pause') {
    stopPump();
  } else if (msg.type === 'resume') {
    if (!halted) startPump();
  } else if (msg.type === 'seek') {
    if (!Module) return;
    const wasRunning = isRunning;
    stopPump();
    Module.ccall('umd_seek', 'number', ['number'], [msg.seconds]);
    postMessage({ type: 'seeked' });
    if (wasRunning) startPump();
  }
};

function startPump() {
  if (isRunning || halted) return;
  isRunning = true;
  pumpBatch();
}

function stopPump() {
  isRunning = false;
  if (pumpTimer) {
    clearTimeout(pumpTimer);
    pumpTimer = null;
  }
}

function pumpBatch() {
  if (!isRunning || !Module || halted) return;

  // Estrae piccoli lotti di pacchetti per ciclo evitando di bloccare l'event loop del Worker
  for (let i = 0; i < 4 && outstandingPackets < MAX_IN_FLIGHT; i++) {
    const pktType = Module._umd_step();

    if (pktType === FRAME_EOF) {
      stopPump();
      postMessage({ type: 'eof' });
      return;
    }

    if (pktType === FRAME_ERROR) {
      stopPump();
      postMessage({ type: 'error', message: 'Errore durante la lettura del flusso MPS.' });
      return;
    }

    const ptr = Module._umd_get_packet_data();
    const size = Module._umd_get_packet_size();
    const pts = Module._umd_get_packet_pts();
    const isKey = Module._umd_is_keyframe() === 1;

    if (ptr && size > 0) {
      // Copia i byte dalla memoria lineare WASM a un ArrayBuffer trasferibile (zero-copy transfer)
      const copy = new Uint8Array(size);
      copy.set(Module.HEAPU8.subarray(ptr, ptr + size));

      outstandingPackets++;
      postMessage(
        {
          type: 'packet',
          frameType: pktType,
          pts,
          isKey,
          buffer: copy.buffer
        },
        [copy.buffer]
      );
    }
  }

  pumpTimer = setTimeout(pumpBatch, outstandingPackets >= MAX_IN_FLIGHT ? 16 : 4);
}
