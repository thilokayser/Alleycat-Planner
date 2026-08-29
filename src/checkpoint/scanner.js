/* ---------------- Checkpoint-App: QR-Scanner ----------------
   Eigenständiger Nachbau, kein Import aus src/rider/scanner.js — beide
   Bundles werden unabhängig gebaut (siehe build.js RIDER_FILES /
   CHECKPOINT_FILES) und keins darf vom anderen abhängen. Verhalten
   bewusst identisch zur Fahrer-App: Ergebnis per Callback statt
   globalem Zustand. */

let cpScanStream = null;
let cpScanRAF = null;
let cpScanOnResult = null;

async function startCpScan(onResult){
  cpScanOnResult = onResult;
  cpState.view = 'scanner';
  cpState.error = '';
  renderCp();

  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    cpScanFail(t('checkpointScan.scanCameraUnsupported'));
    return;
  }
  if(typeof jsQR !== 'function'){
    cpScanFail(t('checkpointScan.scanNoReader'));
    return;
  }

  try{
    cpScanStream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}});
  }catch(e){
    cpScanFail(t('checkpointScan.scanCameraDenied'));
    return;
  }

  const video = document.getElementById('cp-scan-video');
  if(!video){ stopCpScan(); return; }
  video.srcObject = cpScanStream;
  try{ await video.play(); }catch(e){}

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  function tick(){
    if(!cpScanStream) return;
    if(video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth){
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height);
      if(code && code.data){
        const cb = cpScanOnResult;
        stopCpScan(true);
        if(cb) cb(String(code.data).trim());
        return;
      }
    }
    cpScanRAF = requestAnimationFrame(tick);
  }
  cpScanRAF = requestAnimationFrame(tick);
}

function stopCpScan(silent){
  if(cpScanRAF){ cancelAnimationFrame(cpScanRAF); cpScanRAF = null; }
  if(cpScanStream){
    cpScanStream.getTracks().forEach(tr => tr.stop());
    cpScanStream = null;
  }
  cpScanOnResult = null;
  if(!silent){
    cpState.view = cpState.session ? 'home' : 'login';
    renderCp();
  }
}

function cpScanFail(message){
  stopCpScan(true);
  cpState.error = message;
  cpState.errorRetry = cpState.session ? 'home' : 'login';
  cpState.view = 'error';
  renderCp();
}
