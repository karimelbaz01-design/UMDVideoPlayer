'use strict';
const tabs=['home','play','watch','iptv','web','library','settings'];
const $=id=>document.getElementById(id);
let active='home',objectURL=null,previousButtons=[];
const notice=message=>{$('notice').textContent=message;};
function go(tab){if(!tabs.includes(tab))return;active=tab;for(const id of tabs)$(id).hidden=id!==tab;document.querySelectorAll('nav [data-go]').forEach(b=>{if(b.dataset.go===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});window.scrollTo(0,0);}
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
function play(src,temporary=false){if(objectURL){URL.revokeObjectURL(objectURL);objectURL=null;}if(temporary)objectURL=src;$('player').src=src;go('watch');$('player').play().catch(()=>notice('Tocca Play per avviare il video.'));}
$('pickVideo').onclick=()=>$('videoFile').click();
$('videoFile').onchange=e=>{const f=e.target.files[0];if(f)play(URL.createObjectURL(f),true);};
$('openVideoUrl').onclick=()=>{const url=$('videoUrl').value.trim();try{const u=new URL(url);if(!['https:','http:'].includes(u.protocol))throw Error();play(u.href);}catch{notice('Inserisci un indirizzo HTTP(S) valido.');}};
$('pickGames').onclick=()=>$('games').click();
const games=new Set(JSON.parse(localStorage.getItem('frame.web.games.v1')||'[]'));
function renderGames(){const list=$('gameList');list.replaceChildren();if(!games.size){list.textContent='Nessun gioco importato';return;}for(const name of [...games].sort()){const row=document.createElement('div');row.className='item';const label=document.createElement('span');label.textContent=name;const remove=document.createElement('button');remove.textContent='Rimuovi';remove.onclick=()=>{games.delete(name);localStorage.setItem('frame.web.games.v1',JSON.stringify([...games]));renderGames();};row.append(label,remove);list.append(row);}}
renderGames();
$('games').onchange=e=>{for(const f of e.target.files){if(/\.(iso|cso)$/i.test(f.name))games.add(f.name);}localStorage.setItem('frame.web.games.v1',JSON.stringify([...games]));renderGames();notice('Nomi aggiunti. Il browser non conserva le immagini PSP.');e.target.value='';};
$('pickPlaylist').onclick=()=>$('playlistFile').click();
$('playlistFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;const data=await f.text();const lines=data.replace(/\r/g,'').split('\n');const channels=[];let label='Canale';for(const line of lines){const s=line.trim();if(s.startsWith('#EXTINF:')){label=s.split(',').slice(1).join(',').trim()||'Canale';}else if(s&&!s.startsWith('#')){try{const u=new URL(s);if(['http:','https:'].includes(u.protocol))channels.push({label,url:u.href});}catch{}label='Canale';}}const list=$('channelList');list.replaceChildren();for(const c of channels.slice(0,500)){const b=document.createElement('button');b.textContent=c.label;b.style.margin='5px';b.onclick=()=>play(c.url);list.append(b);}if(!channels.length)list.textContent='Nessun canale HTTP(S) valido trovato.';notice(channels.length+' canali caricati. Alcuni flussi potrebbero non essere supportati da Safari.');};
$('openSite').onclick=()=>{try{const u=new URL($('address').value);if(!['https:','http:'].includes(u.protocol))throw Error();window.open(u.href,'_blank','noopener,noreferrer');}catch{notice('Inserisci un indirizzo HTTP(S) valido.');}};
let nextMoveAt=0;
function pollGamepad(){
  const pads=navigator.getGamepads?.()||[];
  const pad=Array.from(pads).find(Boolean);
  $('padStatus').textContent=pad?'Controller: '+pad.id:'Controller non rilevato';
  if(pad){
    const down=pad.buttons.map(b=>b.pressed),fresh=i=>down[i]&&!previousButtons[i];
    if(fresh(4))go(tabs[(tabs.indexOf(active)+tabs.length-1)%tabs.length]);
    if(fresh(5))go(tabs[(tabs.indexOf(active)+1)%tabs.length]);
    const axisY=pad.axes?.[1]||0;
    const up=down[12]||axisY<-.65,downward=down[13]||axisY>.65;
    const move=up?-1:downward?1:0,now=performance.now();
    if(move&&now>=nextMoveAt){
      const elements=[...document.querySelectorAll('nav button,section:not([hidden]) button,section:not([hidden]) input:not([type=file])')].filter(el=>el.getClientRects().length>0);
      const idx=elements.indexOf(document.activeElement);
      elements[(idx+move+elements.length)%elements.length]?.focus();
      nextMoveAt=now+(previousButtons[12]||previousButtons[13]?130:240);
    }
    if(!move)nextMoveAt=0;
    if(fresh(0)&&document.activeElement instanceof HTMLElement){
      const target=document.activeElement;
      if(target.tagName==='BUTTON')target.click();
      else if(target.tagName==='INPUT'&&target.type==='url')target.focus();
    }
    if(fresh(1)&&active!=='home')go('home');
    previousButtons=down;
  }else{previousButtons=[];nextMoveAt=0;}
  requestAnimationFrame(pollGamepad);
}
if(navigator.getGamepads)requestAnimationFrame(pollGamepad);


async function inspectIsoDirectory(file,extent,length){
  const block=2048;
  if(!Number.isSafeInteger(extent)||!Number.isSafeInteger(length)||length<0||length>8388608||extent*block+length>file.size)throw Error('Directory ISO non valida.');
  const b=new Uint8Array(await file.slice(extent*block,extent*block+length).arrayBuffer()),records=[];
  for(let p=0;p<b.length;){
    const len=b[p];if(!len){p=(Math.floor(p/block)+1)*block;continue;}
    if(len<34||p+len>b.length)break;
    const n=b[p+32];if(n>1&&p+33+n<=p+len){
      const name=new TextDecoder('ascii').decode(b.slice(p+33,p+33+n)).replace(/;\d+$/,'');
      const v=new DataView(b.buffer,b.byteOffset+p,len);
      records.push({name,extent:v.getUint32(2,true),size:v.getUint32(10,true),directory:!!(b[p+25]&2)});
    }p+=len;
  }return records;
}
async function inspectSfo(file,record){
  if(!record||record.directory||record.size>262144||record.extent*2048+record.size>file.size)return {};
  const b=new Uint8Array(await file.slice(record.extent*2048,record.extent*2048+record.size).arrayBuffer());
  if(b.length<20)return {};
  const v=new DataView(b.buffer,b.byteOffset,b.byteLength);if(v.getUint32(0,true)!==0x46535000)return {};
  const keys=v.getUint32(8,true),data=v.getUint32(12,true),count=Math.min(v.getUint32(16,true),128),result={};
  for(let i=0;i<count;i++){
    const p=20+i*16;if(p+16>b.length)break;
    const k=keys+v.getUint16(p,true),size=v.getUint32(p+4,true),value=data+v.getUint32(p+12,true);
    if(k>=b.length||size>4096||value+size>b.length)continue;
    const end=b.indexOf(0,k);if(end<0)continue;
    const key=new TextDecoder().decode(b.slice(k,end));
    if(!['TITLE','DISC_ID','CATEGORY','DISC_VERSION','PSP_SYSTEM_VER'].includes(key))continue;
    result[key]=new TextDecoder().decode(b.slice(value,value+size)).replace(/\0+$/,'');
  }return result;
}

const isoPicker=$('inspectFile'),isoButton=$('inspectImage'),isoReport=$('discReport');
const FRAME_INSPECTOR_VERSION='UMD v69 · WASM stage watchdog';
isoReport.textContent='Analizzatore pronto: '+FRAME_INSPECTOR_VERSION+' — seleziona una ISO.';
isoButton.onclick=()=>{isoReport.textContent='Seleziona il file dall’app File. Se il nome non compare dopo la selezione, usa il campo Scegli file sottostante.';isoPicker.click();};
isoPicker.addEventListener('cancel',()=>{isoReport.textContent='Nessun file selezionato. Se il file è su iCloud, scaricalo prima nell’app File e riprova.';});
isoPicker.onchange=async e=>{
  const file=e.target.files&&e.target.files[0];
  if(!file){isoReport.textContent='Il browser non ha restituito alcun file. Prova a spostare la ISO in Sul mio iPhone → Download.';return;}
  const out=isoReport;out.textContent='Analizzatore: '+FRAME_INSPECTOR_VERSION+'\nFile selezionato: '+file.name+' ('+file.size+' byte).\nAnalisi in corso…';
  try{
    const sector=2048, pvdOffset=16*sector;
    if(file.size<pvdOffset+sector)throw Error('Immagine troppo piccola per una ISO PSP.');
    const head=new Uint8Array(await file.slice(0,24).arrayBuffer());
    const signature=new TextDecoder('ascii').decode(head.slice(0,4));
    if(signature==='CISO'){
      const view=new DataView(head.buffer);
      const headerSize=view.getUint32(4,true),totalBytes=Number(view.getBigUint64(8,true)),blockSize=view.getUint32(16,true);
      out.textContent=['Formato: CSO (immagine compressa)','Dimensione file: '+file.size+' byte','Header: '+headerSize+' byte','Dimensione ISO decompressa: '+totalBytes+' byte','Blocco: '+blockSize+' byte','Per analizzare il contenuto CSO serve decompressione dedicata.','Emulazione: non disponibile in questa anteprima.'].join('\n');return;
    }
    const pvd=new Uint8Array(await file.slice(pvdOffset,pvdOffset+sector).arrayBuffer());
    const magic=new TextDecoder('ascii').decode(pvd.slice(1,6));
    if(pvd[0]!==1||magic!=='CD001')throw Error('Settore ISO9660 primario non valido (CD001 assente).');
    const volume=new TextDecoder('ascii').decode(pvd.slice(40,72)).trim();
    const root=pvd.slice(156,190), rootExtent=new DataView(root.buffer,root.byteOffset,root.byteLength).getUint32(2,true),rootLength=new DataView(root.buffer,root.byteOffset,root.byteLength).getUint32(10,true);
    if(rootLength===0||rootExtent*sector>=file.size)throw Error('Directory principale ISO9660 non valida.');
    const size=Math.min(rootLength,2*1024*1024);
    const dir=new Uint8Array(await file.slice(rootExtent*sector,rootExtent*sector+size).arrayBuffer());
    const names=[];let offset=0;
    while(offset<dir.length){const len=dir[offset];if(len===0){offset=(Math.floor(offset/sector)+1)*sector;continue;}if(len<34||offset+len>dir.length)break;const n=dir[offset+32];if(n>1&&offset+33+n<=dir.length){names.push(new TextDecoder('ascii').decode(dir.slice(offset+33,offset+33+n)).replace(/;\d+$/,''));}offset+=len;}
    const game=names.some(n=>n.toUpperCase()==='PSP_GAME');
    const umd=names.some(n=>n.toUpperCase()==='UMD_VIDEO');
    let metadata={},detail='';
    const selected=(await inspectIsoDirectory(file,rootExtent,rootLength)).find(r=>r.directory&&r.name.toUpperCase()===(umd?'UMD_VIDEO':'PSP_GAME'));
    if(selected){
      const contents=await inspectIsoDirectory(file,selected.extent,selected.size);
      const sfo=contents.find(r=>r.name.toUpperCase()==='PARAM.SFO');
      if(sfo)metadata=await inspectSfo(file,sfo);
      detail='Elementi nella cartella '+selected.name+': '+contents.slice(0,24).map(r=>r.name).join(', ');
    }
    let umdDetails=['Analizzatore: '+FRAME_INSPECTOR_VERSION];
    if(umd&&selected){
      const contents=await inspectIsoDirectory(file,selected.extent,selected.size);
      umdDetails.push('CATALOGO UMD (identificazione preliminare):');
      const presentation=['ICON0.PNG','ICON1.PMF','PIC0.PNG','PIC1.PNG','SND0.AT3'];
      const presentationFiles=contents.filter(r=>!r.directory&&presentation.includes(r.name.toUpperCase()));
      umdDetails.push('Presentazione/copertina: '+(presentationFiles.length?presentationFiles.map(r=>r.name+' ('+r.size+' byte)').join(', '):'nessuna risorsa standard nella cartella UMD_VIDEO'));
      const oldCover=document.getElementById('frame-umd-cover-panel');
      if(oldCover){for(const img of oldCover.querySelectorAll('img'))if(img.dataset.objectUrl)URL.revokeObjectURL(img.dataset.objectUrl);oldCover.remove();}
      const panel=document.createElement('div');panel.id='frame-umd-cover-panel';
      panel.style.cssText='margin:14px 0;padding:12px;border:1px solid #51445e;border-radius:12px;background:#171520;color:#eee';
      const heading=document.createElement('strong');heading.textContent='ANTEPRIMA ORIGINALE UMD';
      const status=document.createElement('p');status.textContent='Verifica immagini del disco in corso…';status.style.cssText='font-size:13px;overflow-wrap:anywhere';
      panel.append(heading,status);
      isoReport.insertAdjacentElement('beforebegin',panel);
      const images=contents.filter(r=>!r.directory&&['ICON0.PNG','PIC1.PNG'].includes(r.name.toUpperCase()));
      let success=0,failed=0;
      for(const rec of images){
        const label=document.createElement('p');label.textContent=rec.name+' — '+rec.size+' byte';
        label.style.cssText='font-size:12px;margin:8px 0 4px';
        panel.appendChild(label);
        const offset=rec.extent*2048;
        if(rec.size<24||rec.size>8*1024*1024||offset+rec.size>file.size){label.textContent+=' — dati fuori intervallo';failed++;continue;}
        const blob=file.slice(offset,offset+rec.size,'image/png');
        const bytes=new Uint8Array(await blob.slice(0,24).arrayBuffer());
        const valid=[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
        const width=new DataView(bytes.buffer).getUint32(16,false),height=new DataView(bytes.buffer).getUint32(20,false);
        if(!valid||width<1||height<1||width>8192||height>8192){label.textContent+=' — intestazione PNG non valida ('+width+'x'+height+')';failed++;continue;}
        const url=URL.createObjectURL(blob);
        const img=document.createElement('img');img.dataset.objectUrl=url;
        img.alt='Immagine '+rec.name+' estratta dal disco';img.loading='eager';
        img.style.cssText='display:block;width:auto;max-width:100%;height:auto;max-height:300px;object-fit:contain;margin:8px auto;background:#333';
        img.onload=()=>{label.textContent+=' — visualizzata '+img.naturalWidth+'x'+img.naturalHeight;};
        img.onerror=()=>{label.textContent+=' — Safari non riesce a decodificare il PNG';img.remove();};
        panel.appendChild(img);img.src=url;
        const link=document.createElement('a');link.href=url;link.download=rec.name;
        link.textContent='Salva '+rec.name;link.style.cssText='display:inline-block;margin:5px 0 12px;color:#c5a5ff;text-decoration:underline';
        panel.appendChild(link);success++;
      }
      if(!images.length)status.textContent='Nessuna immagine ICON0.PNG / PIC1.PNG trovata.';
      else status.textContent='Immagini trovate: '+images.length+'. Intestazioni PNG valide: '+success+'. Non valide: '+failed+'. Se resta vuoto, usa Salva per verificare il file originale.';
      umdDetails.push('Anteprima UMD: '+images.length+' immagini trovate, '+success+' PNG con intestazione valida, '+failed+' non valide; verifica rendering in Safari sopra il rapporto.');
      const pmf=contents.find(r=>!r.directory&&r.name.toUpperCase()==='ICON1.PMF');
      if(pmf){
        const line=document.createElement('p');line.style.cssText='font-size:13px;margin:14px 0 6px';panel.appendChild(line);
        const offset=pmf.extent*2048;
        if(pmf.size>0&&pmf.size<=32*1024*1024&&offset+pmf.size<=file.size){
          const header=new Uint8Array(await file.slice(offset,offset+Math.min(64,pmf.size)).arrayBuffer());
          const signature=String.fromCharCode(...header.slice(0,4));
          const hex=Array.from(header.slice(0,24),b=>b.toString(16).padStart(2,'0')).join(' ');
          line.textContent='ICON1.PMF — '+pmf.size+' byte — firma: '+JSON.stringify(signature)+'; primi byte: '+hex;
          const raw=file.slice(offset,offset+pmf.size,'application/octet-stream');
          const url=URL.createObjectURL(raw);
          const link=document.createElement('a');link.href=url;link.download='ICON1.PMF';
          link.textContent='Esporta ICON1.PMF per verifica';link.style.cssText='display:block;color:#c5a5ff;text-decoration:underline;margin:8px 0';
          panel.appendChild(link);
          const note=document.createElement('p');note.textContent=signature==='PSMF'
            ? 'Contenitore PSMF riconosciuto. Animazione non ancora decodificata: Safari non riproduce direttamente PMF.'
            : 'Firma PSMF non rilevata. Non è ancora possibile stabilire se questo file contenga una vera animazione.';
          note.style.cssText='font-size:12px;color:#c6bccc';panel.appendChild(note);
          if(signature==='PSMF'&&pmf.size>=2048){
            const bytes=new Uint8Array(await file.slice(offset,offset+pmf.size).arrayBuffer());
            const data=bytes.subarray(2048);
            const counts={pack:0,system:0,video:0,private:0,audio:0,other:0};
            const sampleIds=[];
            for(let k=0;k+6<=data.length;){
              if(data[k]!==0||data[k+1]!==0||data[k+2]!==1){k++;continue;}
              const id=data[k+3];
              if(id===0xba){counts.pack++;k+=4;continue;}
              if(id===0xbb)counts.system++;
              else if(id>=0xe0&&id<=0xef)counts.video++;
              else if(id===0xbd)counts.private++;
              else if(id>=0xc0&&id<=0xdf)counts.audio++;
              else counts.other++;
              if(sampleIds.length<12)sampleIds.push('0x'+id.toString(16)+'@'+k);
              const size=(data[k+4]<<8)|data[k+5];
              k+=size>0?Math.max(6,6+size):4;
            }
            const streamLine=document.createElement('p');streamLine.style.cssText='font-size:13px;line-height:1.5;overflow-wrap:anywhere';
            streamLine.textContent='Diagnostica PSMF: header 2048 byte; dati dopo header '+data.length+' byte. Start code rilevati: pack='+counts.pack+', system='+counts.system+', video='+counts.video+', private='+counts.private+', audio='+counts.audio+', altri='+counts.other+'. Esempi: '+sampleIds.join(', ')+'. Conteggio preliminare: non prova la presenza di frame decodificabili.';
            panel.appendChild(streamLine);
            umdDetails.push(streamLine.textContent);
            const videoChunks=[];let payloadBytes=0,skipped=0;
            for(let pos=0;pos+14<=data.length;pos+=2048){
              const sector=data.subarray(pos,Math.min(pos+2048,data.length));
              let p=-1;
              for(let k=0;k+9<sector.length;k++){
                if(sector[k]===0&&sector[k+1]===0&&sector[k+2]===1&&sector[k+3]>=0xe0&&sector[k+3]<=0xef){p=k;break;}
              }
              if(p<0){skipped++;continue;}
              const packetLen=(sector[p+4]<<8)|sector[p+5];
              const payloadStart=p+9+sector[p+8];
              const end=packetLen?Math.min(sector.length,p+6+packetLen):sector.length;
              if((sector[p+6]&0xc0)!==0x80||payloadStart>=end){skipped++;continue;}
              const chunk=sector.slice(payloadStart,end);
              videoChunks.push(chunk);payloadBytes+=chunk.length;
            }
            const elementary=new Uint8Array(payloadBytes);let write=0;
            for(const chunk of videoChunks){elementary.set(chunk,write);write+=chunk.length;}
            const nals={};let first=-1;
            for(let k=0;k+4<elementary.length;k++){
              if(elementary[k]===0&&elementary[k+1]===0&&((elementary[k+2]===1)||(elementary[k+2]===0&&elementary[k+3]===1))){
                const len=elementary[k+2]===1?3:4;
                const type=elementary[k+len]&31;
                if(type>=1&&type<=12){nals[type]=(nals[type]||0)+1;if(first<0)first=k;}
                k+=len;
              }
            }
            const diagnostic=document.createElement('p');diagnostic.style.cssText='font-size:13px;line-height:1.5;overflow-wrap:anywhere';
            diagnostic.textContent='Estrazione video PMF sperimentale: settori PES video='+videoChunks.length+', settori ignorati='+skipped+', payload='+payloadBytes+' byte; firme NAL Annex-B='+JSON.stringify(nals)+'. Questo test non conferma la decodifica.';
            panel.appendChild(diagnostic);umdDetails.push(diagnostic.textContent);
            if(payloadBytes&&((nals[7]||0)>0||(nals[5]||0)>0)){
              const blob=new Blob([elementary],{type:'application/octet-stream'});
              const href=URL.createObjectURL(blob);
              const a=document.createElement('a');a.href=href;a.download='ICON1-video-esperimento.h264';
              a.textContent='Esporta flusso H.264 sperimentale';a.style.cssText='display:block;margin:10px 0;color:#c5a5ff;text-decoration:underline';
              panel.appendChild(a);
              const previewButton=document.createElement('button');
              previewButton.type='button';
              previewButton.textContent='▶ RIPRODUCI ANTEPRIMA ANIMATA (BETA)';
              previewButton.style.cssText='display:block;margin:12px 0;padding:12px;border:0;border-radius:10px;background:#bba0f4;color:#15111e;font-weight:700;max-width:100%';
              const canvas=document.createElement('canvas');
              canvas.width=288;canvas.height=160;
              canvas.style.cssText='display:none;width:288px;max-width:100%;aspect-ratio:9/5;background:#000;border-radius:10px;image-rendering:auto';
              const status=document.createElement('p');
              status.style.cssText='font-size:13px;color:#c6bccc;overflow-wrap:anywhere';
              let playbackController=null;
              previewButton.onclick=async()=>{
                if(playbackController){
                  playbackController.abort();
                  return;
                }
                const controller=new AbortController();
                playbackController=controller;
                previewButton.textContent='■ FERMA ANTEPRIMA';
                canvas.style.display='block';
                status.textContent='Preparazione decoder H.264…';
                try{
                  await framePreviewH264(elementary,canvas,status,controller.signal);
                }catch(err){if(!controller.signal.aborted)status.textContent='Anteprima non disponibile: '+err.message;}
                finally{
                  if(playbackController===controller)playbackController=null;
                  previewButton.textContent='▶ RIPRODUCI ANTEPRIMA ANIMATA (BETA)';
                }
              };
              panel.append(previewButton,canvas,status);
            }

          }
          umdDetails.push('ICON1.PMF: '+pmf.size+' byte; firma '+JSON.stringify(signature)+'; '+(signature==='PSMF'?'header PSMF rilevato':'header PSMF non rilevato')+'; nessun frame decodificato.');
        }else{line.textContent='ICON1.PMF: intervallo non valido o file troppo grande per la diagnostica.';}
      }else umdDetails.push('ICON1.PMF: assente.');
      umdDetails.push('Menu, film principale ed extra: NON classificati; richiedono interpretazione di PLAYLIST.UMD, CLIPINF e collegamenti tra stream.');
      const resources=contents.find(r=>r.directory&&r.name.toUpperCase()==='RESOURCE');
      if(resources){
        const entries=await inspectIsoDirectory(file,resources.extent,resources.size);
        umdDetails.push('RESOURCE: '+entries.length+' elementi; '+entries.slice(0,8).map(r=>r.name).join(', '));
      }
      for(const folder of ['STREAM','CLIPINF']){
        const rec=contents.find(r=>r.directory&&r.name.toUpperCase()===folder);
        if(!rec)continue;
        const entries=await inspectIsoDirectory(file,rec.extent,rec.size);
        const files=entries.filter(r=>!r.directory);
        umdDetails.push(folder+': '+files.length+' file');
        umdDetails.push(...files.slice(0,12).map(r=>'  '+r.name+' — '+(r.size/1048576).toFixed(2)+' MiB'));
        if(folder==='STREAM'){
          // Size is only a candidate heuristic, not proof of a playlist target.
          const mpsCandidates=files.filter(r=>/\.MPS$/i.test(r.name)).sort((a,b)=>b.size-a.size);
          const oldCandidates=document.getElementById('frame-umd-stream-candidates');
          if(oldCandidates)oldCandidates.remove();
          const candidatesPanel=document.createElement('section');
          candidatesPanel.id='frame-umd-stream-candidates';
          candidatesPanel.style.cssText='margin:14px 0;padding:12px;border:1px solid #51445e;border-radius:12px;background:#171520;color:#eee';
          const title=document.createElement('strong');
          title.textContent='UMD VIDEO · CONTENUTI DA IDENTIFICARE';
          const hint=document.createElement('p');
          hint.style.cssText='font-size:13px;line-height:1.5;color:#c6bccc';
          hint.textContent='La dimensione suggerisce quali file contengono il film, ma non basta per identificare PLAY o Bonus. Serve leggere i riferimenti della playlist.';
          candidatesPanel.append(title,hint);
          for(const [index,entry] of mpsCandidates.entries()){
            const line=document.createElement('p');
            line.style.cssText='font-size:13px;margin:6px 0;overflow-wrap:anywhere';
            line.textContent=entry.name+' · '+(entry.size/1048576).toFixed(2)+' MiB'+(index===0?' · candidato principale (non verificato)':' · contenuto da classificare');
            candidatesPanel.appendChild(line);
          }
          const note=document.createElement('p');
          note.style.cssText='font-size:12px;color:#c6bccc';
          note.textContent='PLAY non è ancora collegato: un file MPS non è un MP4 e il browser non può avviarlo direttamente.';
          candidatesPanel.appendChild(note);
          panel.insertAdjacentElement('afterend',candidatesPanel);
          const mps=mpsCandidates[0];
          if(mps){
            const start=mps.extent*2048;
            const available=Math.max(0,file.size-start);
            umdDetails.push('MPS selezionato: '+mps.name+'; offset='+start+'; dimensione dichiarata='+mps.size+'; byte disponibili='+available);
            if(available===0){umdDetails.push('MPEG-PS: impossibile leggere il campione: offset fuori dal file ISO.');}
            else {
            const sample=new Uint8Array(await file.slice(start,start+Math.min(mps.size,available,262144)).arrayBuffer());
            const counts={pack:0,system:0,video:0,private1:0,audio:0,other:0};
            for(let i=0;i+4<sample.length;i++){
              if(sample[i]!==0||sample[i+1]!==0||sample[i+2]!==1)continue;
              const code=sample[i+3];
              if(code===0xba)counts.pack++;
              else if(code===0xbb)counts.system++;
              else if(code>=0xe0&&code<=0xef)counts.video++;
              else if(code===0xbd)counts.private1++;
              else if(code>=0xc0&&code<=0xdf)counts.audio++;
              else counts.other++;
              i+=3;
            }
            umdDetails.push('Analisi campione '+mps.name+' ('+sample.length+' byte):');
            umdDetails.push('Start code MPEG-PS: pack='+counts.pack+', system='+counts.system+', video='+counts.video+', private_stream_1='+counts.private1+', audio='+counts.audio);
            umdDetails.push('Nota: conteggio preliminare delle firme, non verifica dei pacchetti né decodifica.');
            // Check PES header bounds and optional PTS without copying the full UMD movie.
            const pes={video:0,private1:0,audio:0,invalid:0,pts:0,firstPTS:null,lastPTS:null};
            for(let i=0;i+9<sample.length;i++){
              if(sample[i]!==0||sample[i+1]!==0||sample[i+2]!==1)continue;
              const id=sample[i+3];
              if(!((id>=0xe0&&id<=0xef)||(id>=0xc0&&id<=0xdf)||id===0xbd))continue;
              const len=(sample[i+4]<<8)|sample[i+5],flags=sample[i+7],headerLen=sample[i+8];
              const payload=i+9+headerLen;
              if((sample[i+6]&0xc0)!==0x80||payload>sample.length||(len!==0&&len<3+headerLen)){pes.invalid++;continue;}
              if(id===0xbd)pes.private1++;else if(id>=0xe0)pes.video++;else pes.audio++;
              if((flags&0x80)&&headerLen>=5&&i+14<=sample.length){
                const p=i+9,b=sample;
                if((b[p]&1)&&(b[p+2]&1)&&(b[p+4]&1)){
                  const pts=(b[p]&14)*536870912+b[p+1]*4194304+(b[p+2]&254)*16384+b[p+3]*128+((b[p+4]&254)/2);
                  if(Number.isFinite(pts)){pes.pts++;if(pes.firstPTS===null)pes.firstPTS=pts;pes.lastPTS=pts;}
                }
              }
            }
            umdDetails.push('PES header plausibili (campione): video='+pes.video+', private='+pes.private1+', audio='+pes.audio+', non validi='+pes.invalid);
            umdDetails.push('PTS leggibili='+pes.pts+(pes.firstPTS===null?'':'; primo='+pes.firstPTS+'; ultimo='+pes.lastPTS+' (clock 90 kHz)'));
            umdDetails.push('Avvertenza: validazione parziale di header, non demux completo o prova del codec.');

            // Bounded PES demux probe: honor PES lengths; avoid scanning payload as packet headers.
            const demux={videoBytes:0,privateBytes:0,audioBytes:0,packets:0,truncated:0,nalTypes:{},nalCount:0};
            const videoChunks=[];
            for(let pos=0;pos+9<=sample.length;){
              if(sample[pos]!==0||sample[pos+1]!==0||sample[pos+2]!==1){pos++;continue;}
              const id=sample[pos+3];
              if(id===0xba){
                if(pos+14>sample.length)break;
                const stuffing=sample[pos+13]&7;
                pos+=14+stuffing;continue;
              }
              if(id===0xb9){pos+=4;continue;}
              if(id===0xbb||id===0xbc||id===0xbe||id===0xbf){
                if(pos+6>sample.length)break;
                pos+=6+((sample[pos+4]<<8)|sample[pos+5]);continue;
              }
              if(!((id>=0xe0&&id<=0xef)||(id>=0xc0&&id<=0xdf)||id===0xbd)){pos+=4;continue;}
              const pesLen=(sample[pos+4]<<8)|sample[pos+5],hdr=sample[pos+8];
              const dataStart=pos+9+hdr,packetEnd=pesLen?pos+6+pesLen:sample.length;
              if((sample[pos+6]&0xc0)!==0x80||dataStart>packetEnd){pos+=4;continue;}
              const end=Math.min(packetEnd,sample.length);
              const bytes=Math.max(0,end-dataStart);
              if(id>=0xe0){demux.videoBytes+=bytes;if(bytes)videoChunks.push(sample.subarray(dataStart,end));}
              else if(id===0xbd)demux.privateBytes+=bytes;
              else demux.audioBytes+=bytes;
              demux.packets++;
              if(packetEnd>sample.length){demux.truncated++;break;}
              if(!pesLen)break;
              pos=packetEnd;
            }
            // H.264 Annex-B NAL types in video PES payloads; detection only, no decode.
            for(const chunk of videoChunks){
              for(let k=0;k+4<chunk.length;k++){
                if(chunk[k]!==0||chunk[k+1]!==0)continue;
                const offset=chunk[k+2]===1?3:(chunk[k+2]===0&&chunk[k+3]===1?4:0);
                if(!offset||k+offset>=chunk.length)continue;
                const h=chunk[k+offset],type=h&31;
                if((h&128)===0&&type>=1&&type<=23){
                  demux.nalTypes[type]=(demux.nalTypes[type]||0)+1;demux.nalCount++;
                }
                k+=offset;
              }
            }
            umdDetails.push('Demux PES sperimentale (256 KiB): '+demux.packets+' pacchetti; payload video='+demux.videoBytes+' byte; privato='+demux.privateBytes+' byte; audio='+demux.audioBytes+' byte; troncati='+demux.truncated);
            umdDetails.push('Firme NAL H.264 nei payload video: '+(demux.nalCount?Object.entries(demux.nalTypes).map(([type,n])=>type+'='+n).join(', '):'nessuna individuata nel campione'));
            umdDetails.push('Limiti: nessun video estratto o riproducibile; PES a lunghezza zero e NAL su confini di pacchetto richiedono un parser completo.');

            // Join video PES payloads in stream order before parsing Annex-B boundaries.
            // The last NAL may be incomplete because the sample ends mid-stream.
            const joinedSize=videoChunks.reduce((n,c)=>n+c.length,0);
            const joined=new Uint8Array(joinedSize);
            let cursor=0;for(const c of videoChunks){joined.set(c,cursor);cursor+=c.length;}
            // First bounded playback experiment for the actual movie stream.
            // Unlike ICON1.PMF, these bytes come from the largest UMD .MPS.
            // This is NOT a full movie player: the 256 KiB sample can start
            // between keyframes and is expected to fail on some discs.
            const previousMovieTest=document.getElementById('frame-umd-movie-test');
            if(previousMovieTest)previousMovieTest.remove();
            const movieTest=document.createElement('section');
            movieTest.id='frame-umd-movie-test';
            movieTest.style.cssText='margin:14px 0;padding:12px;border:1px solid #51445e;border-radius:12px;background:#171520;color:#eee';
            const movieTitle=document.createElement('strong');
            movieTitle.textContent='TEST VIDEO DEL FILM · SPERIMENTALE';
            const movieDescription=document.createElement('p');
            movieDescription.style.cssText='font-size:13px;color:#c6bccc;line-height:1.5';
            movieDescription.textContent='Campione locale dal file '+mps.name+' (256 KiB MPEG-PS). Il video può non decodificarsi: non è ancora la riproduzione del film completo e non include audio.';
            const movieButton=document.createElement('button');
            movieButton.type='button';
            movieButton.textContent='▶ PROVA DECODIFICA VIDEO DEL FILM';
            movieButton.style.cssText='display:block;padding:12px;border:0;border-radius:10px;background:#bba0f4;color:#15111e;font-weight:700;max-width:100%';
            const movieCanvas=document.createElement('canvas');
            movieCanvas.width=288;movieCanvas.height=160;
            movieCanvas.style.cssText='display:none;width:288px;max-width:100%;aspect-ratio:9/5;background:#000;border-radius:10px';
            const movieStatus=document.createElement('p');
            movieStatus.style.cssText='font-size:13px;color:#c6bccc;overflow-wrap:anywhere';
            movieButton.onclick=async()=>{
              movieButton.disabled=true;
              movieCanvas.style.display='block';
              movieStatus.textContent='Verifica decoder H.264 sul campione del film…';
              try{
                const startCodes=[];
                for(let i=0;i+4<joined.length;i++){
                  if(joined[i]!==0||joined[i+1]!==0)continue;
                  const prefix=joined[i+2]===1?3:(joined[i+2]===0&&joined[i+3]===1?4:0);
                  if(prefix&&i+prefix<joined.length){startCodes.push({at:i,type:joined[i+prefix]&31});i+=prefix-1;}
                }
                const counts={};
                for(const n of startCodes)counts[n.type]=(counts[n.type]||0)+1;
                if(!counts[7]||!counts[8]||!counts[5])
                  throw Error('Campione privo di sequenza completa SPS/PPS/IDR (SPS '+(counts[7]||0)+', PPS '+(counts[8]||0)+', IDR '+(counts[5]||0)+'). Serve cercare un punto di avvio nel film, non forzare il decoder.');
                if(!counts[9])throw Error('Nel campione manca AUD: il decoder attuale non sa separare correttamente i fotogrammi del film.');
                await framePreviewH264(joined,movieCanvas,movieStatus);
                movieStatus.textContent='TEST FILM (00001.MPS): '+movieStatus.textContent+' Attenzione: fotogrammi decodificati non equivalgono a video visivamente corretto.';
              }
              catch(err){movieStatus.textContent='Campione non decodificabile: '+err.message+'. È necessario un demux/lettore completo.';}
              finally{movieButton.disabled=false;}
            };
            const exportButton=document.createElement('button');
            exportButton.type='button';
            exportButton.textContent='ESPORTA CAMPIONE MPS · 20 MB (7%)';
            exportButton.style.cssText='display:block;margin-top:10px;padding:12px;border:1px solid #8d79aa;border-radius:10px;background:#30263f;color:#fff;font-weight:700;max-width:100%';
            const exportReport=document.createElement('p');
            exportReport.style.cssText='font-size:12px;color:#c6bccc;overflow-wrap:anywhere';
            exportButton.onclick=async()=>{
              exportButton.disabled=true;
              exportReport.textContent='Preparazione del campione originale…';
              try{
                const size=Math.min(20*1024*1024,mps.size,Math.max(0,file.size-start));
                if(size<1024)throw Error('File MPS non disponibile nella ISO.');
                const target=Math.floor(Math.max(0,mps.size-size)*0.07);
                // This is a byte-exact excerpt, not a converted or remuxed video.
                const blob=file.slice(start+target,start+target+size,'application/octet-stream');
                const url=URL.createObjectURL(blob);
                const link=document.createElement('a');
                link.href=url;
                link.download='FRAME_00001_MPS_7percent_20MiB.bin';
                link.style.display='none';
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(()=>URL.revokeObjectURL(url),60000);
                exportReport.textContent='Richiesto il salvataggio del campione originale da '+(target/1048576).toFixed(1)+' MiB, '+(size/1048576).toFixed(1)+' MiB. Su iPhone controlla Download in Safari o File. È un estratto grezzo, non un video riproducibile autonomamente.';
              }catch(err){exportReport.textContent='Esportazione non riuscita: '+err.message;}
              finally{exportButton.disabled=false;}
            };
            const scanButton=document.createElement('button');
            scanButton.type='button';
            scanButton.textContent='CERCA PUNTI DI AVVIO NEL FILM';
            scanButton.style.cssText='display:block;margin-top:10px;padding:12px;border:1px solid #8d79aa;border-radius:10px;background:transparent;color:#eee;font-weight:700;max-width:100%';
            const scanReport=document.createElement('p');
            scanReport.style.cssText='font-size:12px;color:#c6bccc;white-space:pre-wrap;overflow-wrap:anywhere';
            const frameButton=document.createElement('button');
            frameButton.type='button';
            frameButton.textContent='▶ PROVA PRIMO FOTOGRAMMA (PES)';
            frameButton.style.cssText='display:none;margin-top:10px;padding:12px;border:1px solid #bba0f4;border-radius:10px;background:#30263f;color:#eee;font-weight:700;max-width:100%';
            const frameCanvas=document.createElement('canvas');
            frameCanvas.width=288;frameCanvas.height=160;
            frameCanvas.style.cssText='display:none;width:288px;max-width:100%;background:#000;border-radius:10px;margin-top:10px';
            const frameReport=document.createElement('p');
            frameReport.style.cssText='font-size:12px;color:#c6bccc;overflow-wrap:anywhere';
            let frameCandidate=null;
            const movieSamples=[];
            const samplePicker=document.createElement('select');
            samplePicker.setAttribute('aria-label','Seleziona il punto del film da decodificare');
            samplePicker.style.cssText='display:none;width:100%;max-width:100%;margin-top:12px;padding:12px;border:1px solid #a98bce;border-radius:10px;background:#211a2c;color:#fff;font-size:15px';
            samplePicker.onchange=()=>{
              const sample=movieSamples[Number(samplePicker.value)];
              frameCandidate=sample?.data||null;
              frameReport.textContent=sample?'Punto selezionato: '+sample.percent+'% del file MPS, '+sample.data.length+' byte di video. Premi il test hardware per confrontare le immagini.':'';
              if(frameCanvas._framePlayback)frameCanvas._framePlayback.stop();
              frameCanvas.parentElement.querySelector('[data-frame-movie-samples]')?.remove();
              frameCanvas.getContext('2d').clearRect(0,0,frameCanvas.width,frameCanvas.height);
              frameCanvas.style.display='none';
              alternateButton.disabled=false;
              frameButton.disabled=false;
            };
            frameButton.onclick=async()=>{
              if(!frameCandidate)return;
              frameButton.disabled=true;
              frameCanvas.style.display='block';
              frameReport.textContent='Tentativo WebCodecs sul video estratto dai PES…';
              try{
                await frameDecodeMovieAccessUnits(frameCandidate,frameCanvas,frameReport,'prefer-software',movieSamples[Number(samplePicker.value)]?.timing||[]);
                frameReport.textContent='TEST FILM PES: '+frameReport.textContent+' Controlla visivamente: righe verdi o immagini distorte NON sono un fotogramma valido.';
              }catch(err){frameReport.textContent='Test PES non riuscito: '+err.message;}
              finally{frameButton.disabled=false;}
            };
            const nativeButton=document.createElement('button');
            nativeButton.type='button';
            nativeButton.textContent='▶ RIPRODUCI CAMPIONE SU SAFARI';
            nativeButton.style.cssText='display:none;margin-top:10px;padding:12px;border:1px solid #bba0f4;border-radius:10px;background:#30263f;color:#eee;font-weight:700';
            const nativeVideo=document.createElement('video');
            nativeVideo.controls=true;nativeVideo.playsInline=true;
            nativeVideo.style.cssText='display:none;width:100%;max-width:520px;margin-top:10px;background:black';
            let nativeUrl=null;
            // Verified playback route: user-supplied progressive MP4 plays through
            // Safari's native media pipeline. This does NOT claim to transcode ISO.
            const verifiedLabel=document.createElement('label');
            verifiedLabel.textContent='RIPRODUCI MP4 PROGRESSIVO (file locale già convertito)';
            verifiedLabel.style.cssText='display:block;margin-top:12px;font-size:13px;color:#d7c8e8';
            const verifiedPicker=document.createElement('input');
            verifiedPicker.type='file';verifiedPicker.accept='video/mp4,.mp4';
            verifiedPicker.style.cssText='display:block;max-width:100%;margin:8px 0 12px;color:#eee';
            const verifiedVideo=document.createElement('video');
            verifiedVideo.controls=true;verifiedVideo.playsInline=true;
            verifiedVideo.preload='metadata';
            verifiedVideo.style.cssText='display:none;width:100%;max-width:520px;background:#000;border-radius:10px;margin:8px 0';
            const verifiedStatus=document.createElement('p');
            verifiedStatus.style.cssText='font-size:12px;color:#cfc0dd;margin:6px 0';
            verifiedStatus.textContent='Riproduzione locale senza caricamento online. La conversione automatica da UMD ISO non è ancora disponibile.';
            let verifiedUrl=null;
            verifiedPicker.onchange=()=>{
              const selected=verifiedPicker.files?.[0];
              if(!selected)return;
              if(verifiedUrl)URL.revokeObjectURL(verifiedUrl);
              verifiedUrl=URL.createObjectURL(selected);
              verifiedVideo.src=verifiedUrl;verifiedVideo.style.display='block';
              verifiedVideo.onerror=()=>{verifiedStatus.textContent='Safari non supporta questo file (errore '+(verifiedVideo.error?.code??'?')+'). Usa un MP4 H.264 progressivo compatibile.';};
              verifiedVideo.onloadedmetadata=()=>{verifiedStatus.textContent='File locale pronto: '+selected.name+' · '+verifiedVideo.duration.toFixed(2)+' s. Premi Play.';};
              verifiedVideo.load();
            };
            // Experimental in-browser FFmpeg/WASM conversion of the ISO-derived
            // short sample. Never process the entire ISO in WASM memory.
            const wasmButton=document.createElement('button');
            wasmButton.type='button';
            wasmButton.textContent='▶ TEST CONVERSIONE PROGRESSIVA DA ISO (WASM)';
            wasmButton.style.cssText='display:none';
            const wasmVideo=document.createElement('video');
            wasmVideo.controls=true;wasmVideo.playsInline=true;
            wasmVideo.style.cssText='display:none;width:100%;max-width:520px;margin-top:10px;background:black';
            const wasmNote=document.createElement('p');
            wasmNote.style.cssText='display:none;font-size:12px;color:#cfc0dd';
            wasmNote.textContent='Prova sperimentale: converte solo il campione ISO selezionato (circa 1,5 s), senza audio. Richiede download del motore FFmpeg WASM e memoria libera.';
            let wasmUrl=null;
            wasmButton.onclick=async()=>{
              if(!frameCandidate)return;
              wasmButton.disabled=true;
              wasmNote.style.display='block';
              let stage='inizializzazione',watchdog=null,seconds=0;
              try{
                watchdog=setInterval(()=>{seconds++;wasmNote.textContent='FASE: '+stage+' · '+seconds+' s trascorsi. '+(seconds>30?'Se resta qui, il caricamento non è riuscito.':'Attendi il risultato della fase corrente.');},1000);
                stage='preparazione campione ISO';
                wasmNote.textContent='Preparazione campione H.264 dalla ISO…';
                const input=new Uint8Array(await frameNativeMp4(frameCandidate).arrayBuffer());
                wasmNote.textContent='Caricamento FFmpeg WASM (può richiedere tempo e connessione)…';
                // CDN ESM imports need bundled dependency resolution. The
                // previous jsDelivr ESM entry used bare imports and its worker
                // had relative imports that break inside a blob: URL.
                // Both modules below are served as bundled ESM by esm.sh.
                const withDeadline=(promise,ms,label)=>Promise.race([
                  promise,
                  new Promise((_,reject)=>setTimeout(()=>reject(
                    Error(label+' oltre '+Math.round(ms/1000)+' secondi. Verifica rete o memoria Safari.')),ms))
                ]);
                stage='download libreria FFmpeg';
                const {FFmpeg}=await withDeadline(
                  import('https://esm.sh/@ffmpeg/ffmpeg@0.12.10?bundle'),
                  20000,'Download libreria FFmpeg');
                stage='download utilità FFmpeg';
                const {toBlobURL}=await withDeadline(
                  import('https://esm.sh/@ffmpeg/util@0.12.1?bundle'),
                  20000,'Download utilità FFmpeg');
                const core='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';
                const ffmpeg=new FFmpeg();
                ffmpeg.on('log',({message})=>{
                  if(/error|invalid|failed/i.test(message))
                    wasmNote.textContent='FFmpeg: '+message.slice(0,180);
                });
                wasmNote.textContent='Preparazione worker e motore WASM…';
                stage='download worker FFmpeg';
                const workerURL=await withDeadline(
                  toBlobURL('https://esm.sh/@ffmpeg/ffmpeg@0.12.10/dist/esm/worker.js?bundle','text/javascript'),
                  20000,'Download worker FFmpeg');
                stage='download core JavaScript';
                const coreURL=await withDeadline(toBlobURL(core+'/ffmpeg-core.js','text/javascript'),30000,'Download core FFmpeg');
                stage='download motore WebAssembly';
                const wasmURL=await withDeadline(toBlobURL(core+'/ffmpeg-core.wasm','application/wasm'),60000,'Download WebAssembly FFmpeg');
                wasmNote.textContent='Avvio FFmpeg WebAssembly…';
                stage='avvio worker WebAssembly';
                await withDeadline(ffmpeg.load({classWorkerURL:workerURL,coreURL,wasmURL}),30000,'Avvio worker FFmpeg');
                stage='caricamento campione nel motore';
                await withDeadline(ffmpeg.writeFile('input.mp4',input),15000,'Scrittura file WASM');
                wasmNote.textContent='Conversione interlacciato → progressivo in corso…';
                stage='conversione video (max 90 s)';
                const code=await withDeadline(ffmpeg.exec(['-i','input.mp4','-map','0:v:0','-vf','bwdif=mode=send_frame:parity=auto:deint=all,format=yuv420p','-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart','-an','output.mp4'], -1),90000,'Conversione FFmpeg');
                if(code!==0)throw Error('FFmpeg terminato con codice '+code);
                stage='lettura video convertito';
                const output=await withDeadline(ffmpeg.readFile('output.mp4'),15000,'Lettura video convertito');
                if(wasmUrl)URL.revokeObjectURL(wasmUrl);
                wasmUrl=URL.createObjectURL(new Blob([output],{type:'video/mp4'}));
                wasmVideo.src=wasmUrl;wasmVideo.style.display='block';
                wasmVideo.onerror=()=>{wasmNote.textContent='Conversione completata, ma Safari rifiuta il file risultante (errore '+(wasmVideo.error?.code??'?')+').';};
                wasmVideo.onloadedmetadata=()=>{wasmNote.textContent='Campione convertito in locale: '+wasmVideo.duration.toFixed(2)+' secondi. Premi Play e controlla verde e fluidità.';};
                wasmVideo.load();
                ffmpeg.terminate();
              }catch(err){
                wasmNote.textContent='Conversione WASM non riuscita: '+(err?.message||String(err))+'. Il motore può non caricarsi su Safari o non avere abbastanza memoria.';
              }finally{if(watchdog)clearInterval(watchdog);wasmButton.disabled=false;}
            };
            const mp4Export=document.createElement('button');
            mp4Export.type='button';
            mp4Export.textContent='ESPORTA MP4 GENERATO (per analisi)';
            mp4Export.style.cssText='display:none;margin-top:8px;padding:10px;border:1px solid #8d79aa;border-radius:9px;background:transparent;color:#eee';
            mp4Export.onclick=()=>{
              if(!frameCandidate)return;
              try{
                const url=URL.createObjectURL(frameNativeMp4(frameCandidate));
                const a=document.createElement('a');a.href=url;a.download='FRAME_native_test_v61.mp4';
                document.body.appendChild(a);a.click();a.remove();
                setTimeout(()=>URL.revokeObjectURL(url),60000);
              }catch(e){frameReport.textContent='Esportazione MP4 fallita: '+e.message;}
            };
            nativeButton.onclick=()=>{
              frameCandidate=movieSamples[Number(samplePicker.value)]?.data||frameCandidate;
              if(!frameCandidate)return;
              try{
                if(nativeUrl)URL.revokeObjectURL(nativeUrl);
                nativeUrl=URL.createObjectURL(frameNativeMp4(frameCandidate));
                nativeVideo.src=nativeUrl;nativeVideo.style.display='block';
                frameReport.textContent='Test nativo MP4 con coppie di campi interlacciati, senza ricodifica e senza audio: premi Play. Non è un file progressivo ricodificato; potrebbe essere incompatibile con Safari.';
                nativeVideo.onerror=async()=>{
                  const mediaCode=nativeVideo.error?.code??'?';
                  frameReport.textContent='MP4 rifiutato da Safari (errore '+mediaCode+'). Provo il decoder diretto WebCodecs, senza scaricare il file…';
                  nativeVideo.style.display='none';
                  if(typeof VideoDecoder==='undefined'){
                    frameReport.textContent+=' WebCodecs non disponibile: serve una ricodifica H.264 progressiva.';
                    return;
                  }
                  try{
                    frameCanvas.style.display='block';
                    await frameDecodeMovieAccessUnits(frameCandidate,frameCanvas,frameReport,'prefer-software',movieSamples[Number(samplePicker.value)]?.timing||[]);
                    frameReport.textContent+=' Il contenitore MP4 resta incompatibile: questa è una riproduzione di fotogrammi su canvas, senza audio.';
                  }catch(err){
                    frameReport.textContent='MP4 non supportato (errore '+mediaCode+'); anche il decoder WebCodecs non riesce a ricostruire il campione: '+(err?.message||err);
                  }
                };
                nativeVideo.onloadedmetadata=()=>{frameReport.textContent='Safari ha caricato il campione MP4 ('+nativeVideo.duration.toFixed(2)+' s). Premi Play: la lettura dei metadati non garantisce che il video sia decodificabile.';};
                nativeVideo.onplaying=()=>{frameReport.textContent='Riproduzione avviata su Safari. Controlla fluidità e immagini: il test è senza audio.';};
                nativeVideo.onwaiting=()=>{frameReport.textContent='Safari è in attesa di dati o decodifica: possibile blocco del campione.';};
                nativeVideo.onstalled=()=>{frameReport.textContent='Safari ha interrotto il caricamento del campione.';};
                nativeVideo.onended=()=>{frameReport.textContent='Campione terminato su Safari. Verifica se i fotogrammi sono stati fluidi.';};
                nativeVideo.load();
              }catch(e){frameReport.textContent='Test nativo non riuscito: '+e.message;}
            };
            const nalCompareButton=document.createElement('button');
            nalCompareButton.type='button';
            nalCompareButton.textContent='CONFRONTA FLUSSO SENZA AUD';
            nalCompareButton.style.cssText='display:none;margin-top:10px;padding:12px;border:1px solid #8d79aa;border-radius:10px;background:transparent;color:#eee;font-weight:700;max-width:100%';
            nalCompareButton.onclick=async()=>{
              if(!frameCandidate)return;
              nalCompareButton.disabled=true;frameCanvas.style.display='block';
              frameReport.textContent='Confronto Annex-B senza NAL AUD…';
              try{await frameDecodeMovieAccessUnits(frameCandidate,frameCanvas,frameReport,'prefer-hardware',movieSamples[Number(samplePicker.value)]?.timing||[],'no-aud');}
              catch(err){frameReport.textContent='Confronto senza AUD non riuscito: '+err.message;}
              finally{nalCompareButton.disabled=false;}
            };
            const alternateButton=document.createElement('button');
            alternateButton.type='button';
            alternateButton.textContent='CONFRONTA DECODER HARDWARE';
            alternateButton.style.cssText='display:none;margin-top:10px;padding:12px;border:1px solid #8d79aa;border-radius:10px;background:transparent;color:#eee;font-weight:700;max-width:100%';
            alternateButton.onclick=async()=>{
              if(!frameCandidate)return;
              alternateButton.disabled=true;
              frameCanvas.style.display='block';
              frameReport.textContent='Prova del percorso hardware WebCodecs sul punto '+(movieSamples[Number(samplePicker.value)]?.percent??'?')+'%…';
              try{
                await frameDecodeMovieAccessUnits(frameCandidate,frameCanvas,frameReport,'prefer-hardware',movieSamples[Number(samplePicker.value)]?.timing||[]);
                frameReport.textContent+=' Il browser può usare lo stesso decoder anche con questa preferenza; il confronto visivo non garantisce un percorso diverso.';
              }catch(err){frameReport.textContent='Decoder hardware: '+err.message;}
              finally{alternateButton.disabled=false;}
            };
            scanButton.onclick=async()=>{
              scanButton.disabled=true;
              frameCandidate=null;movieSamples.length=0;samplePicker.replaceChildren();samplePicker.style.display='none';frameButton.style.display='none';nativeButton.style.display='none';wasmButton.style.display='none';mp4Export.style.display='none';alternateButton.style.display='none';nalCompareButton.style.display='none';frameCanvas.style.display='none';frameReport.textContent='';
              scanReport.textContent='Ricerca su 16 posizioni con finestre da 2 MiB: cerco access unit complete…';
              try{
                const sections=16,windowBytes=2097152;
                const rows=[];
                for(let index=0;index<sections;index++){
                  // Sample across the whole movie without reading 1+ GiB into RAM.
                  const offset=Math.floor((mps.size-windowBytes)*index/Math.max(1,sections-1));
                  const bytes=new Uint8Array(await file.slice(start+offset,start+offset+windowBytes).arrayBuffer());
                  // Parse MPEG-PS packet boundaries before inspecting H.264.
                  // A window may start in the middle of a packet; resynchronize
                  // at a plausible pack header and never count raw MPS bytes.
                  const videoParts=[];
                  const videoTiming=[];
                  let pesPackets=0,videoBytes=0;
                  let ptsPackets=0,dtsPackets=0,invalidPts=0,backwardPts=0,largePtsGaps=0;
                  let ptsDtsDifferent=0,ptsDtsMaxMs=0,invalidPes=0,splitNalPrefixes=0;
                  let firstPts=null,lastPts=null;
                  const readClock=(at)=>{
                    if(at+4>=bytes.length)return null;
                    const a=bytes[at],b=bytes[at+1],c=bytes[at+2],d=bytes[at+3],e=bytes[at+4];
                    if((a&1)!==1||(c&1)!==1||(e&1)!==1)return null;
                    return ((a>>1)&7)*1073741824 + b*4194304 + ((c>>1)&127)*32768 + d*128 + (e>>1);
                  };
                  for(let pos=0;pos+14<bytes.length;){
                    if(bytes[pos]!==0||bytes[pos+1]!==0||bytes[pos+2]!==1){pos++;continue;}
                    const id=bytes[pos+3];
                    if(id===0xba){pos+=14+(bytes[pos+13]&7);continue;}
                    if(id===0xbb||id===0xbc||id===0xbe||id===0xbf){
                      const size=(bytes[pos+4]<<8)|bytes[pos+5];
                      pos+=6+size;continue;
                    }
                    if(id<0xbd||id>0xef){pos++;continue;}
                    const length=(bytes[pos+4]<<8)|bytes[pos+5];
                    const header=bytes[pos+8];
                    const end=length?pos+6+length:bytes.length;
                    const begin=pos+9+header;
                    if((bytes[pos+6]&0xc0)!==0x80||begin>end||end>bytes.length||!length){invalidPes++;pos++;continue;}
                    if(id>=0xe0&&id<=0xef&&begin<end){
                      const flags=(bytes[pos+7]>>6)&3;
                      const payloadPts=(flags===2||flags===3)?readClock(pos+9):null;
                      const payloadDts=flags===3?readClock(pos+14):null;
                      videoTiming.push({at:videoBytes,pts:payloadPts,dts:payloadDts});
                      if(flags===2||flags===3){
                        const pts=readClock(pos+9);
                        if(pts===null)invalidPts++;
                        else{
                          ptsPackets++;
                          if(firstPts===null)firstPts=pts;
                          if(lastPts!==null){
                            let diff=pts-lastPts;
                            if(diff<-(2**32))diff+=2**33;
                            if(diff<0)backwardPts++;
                            if(diff>90000)largePtsGaps++;
                          }
                          lastPts=pts;
                        }
                        if(flags===3){
                          const dts=readClock(pos+14);
                          if(dts!==null){
                            dtsPackets++;
                            const pts=readClock(pos+9);
                            if(pts!==null){
                              let diff=pts-dts;
                              if(diff<-(2**32))diff+=2**33;
                              if(diff>2**32)diff-=2**33;
                              if(diff!==0)ptsDtsDifferent++;
                              ptsDtsMaxMs=Math.max(ptsDtsMaxMs,Math.round(Math.abs(diff)/90));
                            }
                          }
                        }
                      }
                      if(videoParts.length){
                        const prev=videoParts[videoParts.length-1];
                        const tail=prev.subarray(Math.max(0,prev.length-3));
                        const head=bytes.subarray(begin,Math.min(end,begin+3));
                        const combo=new Uint8Array(tail.length+head.length);
                        combo.set(tail);combo.set(head,tail.length);
                        for(let k=Math.max(0,tail.length-3);k<tail.length;k++){
                          if(combo[k]===0&&combo[k+1]===0&&(combo[k+2]===1||(combo[k+2]===0&&combo[k+3]===1)))splitNalPrefixes++;
                        }
                      }
                      videoParts.push(bytes.subarray(begin,end));
                      videoBytes+=end-begin;
                      pesPackets++;
                    }
                    pos=end;
                  }
                  const elementary=new Uint8Array(videoBytes);
                  let write=0;
                  for(const part of videoParts){elementary.set(part,write);write+=part.length;}
                  const nals={sps:0,pps:0,idr:0,aud:0};
                  for(let j=0;j+5<elementary.length;j++){
                    if(elementary[j]!==0||elementary[j+1]!==0)continue;
                    const p=elementary[j+2]===1?3:(elementary[j+2]===0&&elementary[j+3]===1?4:0);
                    if(!p)continue;
                    const h=elementary[j+p],type=h&31;
                    if(h&128)continue;
                    if(type===7)nals.sps++;
                    if(type===8)nals.pps++;
                    if(type===5)nals.idr++;
                    if(type===9)nals.aud++;
                    j+=p;
                  }
                  if(movieSamples.length<8&&nals.sps&&nals.pps&&nals.idr&&nals.aud){
                    // Keep only a bounded local sample. Trim to a parameter set
                    // before the first IDR so the decoder starts on a keyframe.
                    const marks=[];
                    for(let q=0;q+5<elementary.length;q++){
                      if(elementary[q]!==0||elementary[q+1]!==0)continue;
                      const prefix=elementary[q+2]===1?3:(elementary[q+2]===0&&elementary[q+3]===1?4:0);
                      if(prefix){marks.push({at:q,type:elementary[q+prefix]&31});q+=prefix-1;}
                    }
                    const idr=marks.findIndex(x=>x.type===5);
                    if(idr>=0){
                      let first=-1;
                      for(let q=idr;q>=0;q--)if(marks[q].type===7){first=q;break;}
                      if(first>=0&&marks.slice(first,idr).some(x=>x.type===8)){
                        const cut=marks[first].at;
                        const candidate=elementary.slice(cut);
                        // The decoder requires a complete AUD-bounded IDR access unit.
                        // A raw IDR signature by itself is insufficient.
                        const boundaries=marks.filter(m=>m.at>=cut&&m.type===9);
                        let valid=false;
                        for(let t=0;t+1<boundaries.length;t++){
                          const left=boundaries[t].at,right=boundaries[t+1].at;
                          const members=marks.filter(m=>m.at>=left&&m.at<right);
                          if(members.some(m=>m.type===5)&&marks.some(m=>m.type===7&&m.at<right)&&marks.some(m=>m.type===8&&m.at<right)){
                            valid=true;break;
                          }
                        }
                        if(valid&&candidate.length>1000)movieSamples.push({
                          percent:Math.round(offset/Math.max(1,mps.size)*100),data:candidate,
                          timing:videoTiming.filter(p=>p.at>=cut).map(p=>({...p,at:p.at-cut}))
                        });
                      }
                    }
                  }
                  rows.push({percent:Math.round(offset/Math.max(1,mps.size)*100),pesPackets,videoBytes,ptsPackets,dtsPackets,invalidPts,backwardPts,largePtsGaps,ptsDtsDifferent,ptsDtsMaxMs,invalidPes,splitNalPrefixes,ptsSpanSeconds:firstPts!==null&&lastPts!==null?Math.round((lastPts-firstPts)/9000)/10:null,...nals});
                  if(index%4===3)scanReport.textContent='Analizzate '+(index+1)+'/'+sections+' posizioni…';
                  await new Promise(resolve=>setTimeout(resolve,0));
                }
                const candidates=rows.filter(r=>r.sps&&r.pps&&r.idr);
                if(movieSamples.length){
                  movieSamples.forEach((sample,i)=>{
                    const option=document.createElement('option');
                    option.value=String(i);
                    option.textContent='Punto '+sample.percent+'% · '+Math.round(sample.data.length/1024)+' KiB';
                    samplePicker.appendChild(option);
                  });
                  samplePicker.style.display='block';
                  frameCandidate=movieSamples[0].data;
                  frameButton.style.display='none';nativeButton.style.display='block';wasmButton.style.display='none';mp4Export.style.display='block';alternateButton.style.display='none';nalCompareButton.style.display='none';
                  frameReport.textContent='Trovati '+movieSamples.length+' punti indipendenti. Cambia punto per capire se il verde dipende dall’inizio del flusso. Non è una correzione dei colori.';
                }
                scanReport.textContent='Ricerca completata. '+candidates.length+'/'+sections+' finestre contengono firme SPS, PPS e IDR nei payload video PES.\n'+rows.map(r=>r.percent+'%: PES '+r.pesPackets+', video '+r.videoBytes+' B, SPS '+r.sps+', PPS '+r.pps+', IDR '+r.idr+', AUD '+r.aud+', PES scartati '+r.invalidPes+', prefissi NAL divisi '+r.splitNalPrefixes+', PTS/DTS diversi '+r.ptsDtsDifferent+', scarto massimo '+r.ptsDtsMaxMs+'ms, PTS '+r.ptsPackets+', DTS '+r.dtsPackets+', PTS non validi '+r.invalidPts+', PTS indietro '+r.backwardPts+', salti >1s '+r.largePtsGaps+', intervallo '+(r.ptsSpanSeconds===null?'n/d':r.ptsSpanSeconds+'s')).join('\n')+'\nATTENZIONE: firme nei payload PES, non fotogrammi validati. Il test non riproduce ancora il film.';
              }catch(err){scanReport.textContent='Ricerca interrotta: '+err.message;}
              finally{scanButton.disabled=false;}
            };
            movieTest.append(movieTitle,movieDescription,movieButton,movieCanvas,movieStatus,exportButton,exportReport,scanButton,scanReport,samplePicker,nativeButton,nativeVideo,wasmButton,wasmVideo,wasmNote,verifiedLabel,verifiedPicker,verifiedVideo,verifiedStatus,mp4Export,frameButton,alternateButton,nalCompareButton,frameCanvas,frameReport);
            candidatesPanel.insertAdjacentElement('afterend',movieTest);
            const starts=[];
            for(let k=0;k+3<joined.length;k++){
              if(joined[k]!==0||joined[k+1]!==0)continue;
              const prefix=joined[k+2]===1?3:(joined[k+2]===0&&joined[k+3]===1?4:0);
              if(prefix){starts.push({at:k,header:k+prefix});k+=prefix-1;}
            }
            const units={complete:0,partial:starts.length?1:0,sps:0,pps:0,idr:0,sei:0,other:0,invalid:0,maxSize:0};
            const parameters=[];
            const spsHeaders=[];
            const parseSpsDimensions=(nal)=>{
              try{
                if(nal.length<5||(nal[0]&31)!==7)return null;
                const raw=[];for(let q=1;q<nal.length;q++){
                  if(q>=3&&nal[q]===3&&nal[q-1]===0&&nal[q-2]===0)continue;
                  raw.push(nal[q]);
                }
                let bit=0;const read=(n)=>{if(n<0||n>32||bit+n>raw.length*8)throw Error('short SPS');let v=0;for(let j=0;j<n;j++){v=v*2+((raw[bit>>3]>>(7-(bit&7)))&1);bit++;}return v;};
                const ue=()=>{let zeros=0;while(read(1)===0){zeros++;if(zeros>24)throw Error('invalid Golomb');}return (2**zeros)-1+(zeros?read(zeros):0);};
                const se=()=>{const v=ue();return v&1?(v+1)/2:-(v/2);};
                const profile=read(8),constraints=read(8),level=read(8);ue();
                let chroma=1;
                if([100,110,122,244,44,83,86,118,128,138,139,134,135].includes(profile)){
                  chroma=ue();if(chroma===3)read(1);
                  ue();ue();read(1);
                  if(read(1)){for(let i=0;i<(chroma!==3?8:12);i++)if(read(1)){let last=8,next=8;const n=i<6?16:64;for(let j=0;j<n;j++){if(next!==0)next=(last+se()+256)%256;last=next===0?last:next;}}}
                }
                ue();const poc=ue();
                if(poc===0)ue();
                else if(poc===1){read(1);se();se();const count=ue();if(count>256)throw Error('poc');for(let i=0;i<count;i++)se();}
                ue();read(1);const w=ue(),h=ue();const frameOnly=read(1);
                if(!frameOnly)read(1);
                read(1);const cropFlag=read(1);
                let left=0,right=0,top=0,bottom=0;
                if(cropFlag){left=ue();right=ue();top=ue();bottom=ue();}
                const subWidth=chroma===1||chroma===2?2:1,subHeight=chroma===1?2:1;
                const cropX=chroma===0?1:subWidth,cropY=chroma===0?(2-frameOnly):subHeight*(2-frameOnly);
                const width=(w+1)*16-(left+right)*cropX,height=(h+1)*16*(2-frameOnly)-(top+bottom)*cropY;
                if(width<=0||height<=0||width>8192||height>8192)throw Error('dimensions');
                return {width,height,profile,level,constraints};
              }catch(e){return null;}
            };
            const dimensions=[];
            const seenDimensions=new Set();

            const seenSps=new Set();
            let suspiciousShort=0, emulationMarkers=0;
            for(let j=0;j+1<starts.length;j++){
              const a=starts[j],b=starts[j+1],length=b.at-a.header;
              if(length<1){units.invalid++;continue;}
              const header=joined[a.header],type=header&31;
              if((header&128)!==0||type===0||type>23){units.invalid++;continue;}
              units.complete++;units.maxSize=Math.max(units.maxSize,length);
              if(length<4)suspiciousShort++;
              for(let t=a.header+1;t+2<b.at;t++){
                if(joined[t]===0&&joined[t+1]===0&&joined[t+2]===3){emulationMarkers++;t+=2;}
              }
              if(type===7){
                units.sps++;
                if(parameters.length<4)parameters.push('SPS '+length+' byte');
                if(length>=4){
                  const profile=joined[a.header+1],constraints=joined[a.header+2],level=joined[a.header+3];
                  const parsed=parseSpsDimensions(joined.subarray(a.header,b.at));
                  if(parsed){const dims=parsed.width+'x'+parsed.height;if(!seenDimensions.has(dims)){seenDimensions.add(dims);dimensions.push(dims);}}
                  const signature=profile+':'+constraints+':'+level;
                  if(!seenSps.has(signature)){
                    seenSps.add(signature);
                    spsHeaders.push('profile_idc='+profile+', flags='+constraints+', level_idc='+level);
                  }
                }
              }
              else if(type===8){units.pps++;if(parameters.length<4)parameters.push('PPS '+length+' byte');}
              else if(type===5)units.idr++;
              else if(type===6)units.sei++;
              else units.other++;
            }
            umdDetails.push('Annex-B ricostruito (campione): '+joinedSize+' byte di payload video concatenati da '+videoChunks.length+' PES; NAL complete='+units.complete+', ultima potenzialmente incompleta='+units.partial+', non valide='+units.invalid);
            umdDetails.push('NAL delimitate: SPS='+units.sps+', PPS='+units.pps+', IDR='+units.idr+', SEI='+units.sei+', altre='+units.other+'; massima='+units.maxSize+' byte');
            if(parameters.length)umdDetails.push('Parametri trovati: '+parameters.join('; ')+' (contenuto non ancora interpretato)');
            umdDetails.push('Controllo qualità NAL: unità sotto 4 byte='+suspiciousShort+', marcatori emulation_prevention='+emulationMarkers);
            umdDetails.push('SPS (header preliminare): '+(spsHeaders.length?spsHeaders.join(' | '):'nessun header SPS completo nel campione'));
            umdDetails.push('Risoluzione SPS decodificata (campione): '+(dimensions.length?dimensions.join(' | '):'non determinata; dati incompleti o non validi'));
            umdDetails.push('Attenzione: le NAL sono delimitate sintatticamente, non ancora validate con un decoder H.264.');

            // A bounded, genuine Annex-B sample can be exported for external decoder testing.
            // Retain complete NALs only and begin at the first SPS followed by PPS and IDR.
            let exportStart=-1,exportEnd=-1,hasPps=false;
            for(let j=0;j+1<starts.length;j++){
              const type=joined[starts[j].header]&31;
              if(exportStart<0){if(type===7)exportStart=j;continue;}
              if(type===8)hasPps=true;
              if(hasPps&&type===5){exportEnd=starts.length-1;break;}
            }
            let vclCount=0,idrCount=0,invalidHeaders=0,shortNal=0,firstIdr=-1;
            const shortTypes={},allTypes={},shortExamples=[];
            let zeroLength=0,oneByte=0,twoBytes=0,threeBytes=0;
            for(let j=Math.max(0,exportStart);j+1<starts.length;j++){
              const start=starts[j],end=starts[j+1];
              const size=end.at-start.header,header=joined[start.header],type=header&31;
              allTypes[type]=(allTypes[type]||0)+1;
              if((header&128)!==0||type===0||type>23)invalidHeaders++;
              if(size<4){
                shortNal++;shortTypes[type]=(shortTypes[type]||0)+1;
                if(size===0)zeroLength++;else if(size===1)oneByte++;else if(size===2)twoBytes++;else if(size===3)threeBytes++;
                if(shortExamples.length<8)shortExamples.push('tipo '+type+' ('+size+' byte, offset '+start.at+')');
              }
              if(type===1||type===5)vclCount++;
              if(type===5){idrCount++;if(firstIdr<0)firstIdr=j;}
            }
            const formatTypes=(counts)=>Object.keys(counts).sort((a,b)=>Number(a)-Number(b)).map(t=>t+':'+counts[t]).join(', ')||'nessuno';
            umdDetails.push('Diagnostica campione esportabile: VCL (slice)='+vclCount+', IDR='+idrCount+', NAL sotto 4 byte='+shortNal+', header non validi='+invalidHeaders);
            umdDetails.push('Tipi NAL totali: '+formatTypes(allTypes));
            umdDetails.push('NAL corte per tipo: '+formatTypes(shortTypes)+'; dimensioni 0/1/2/3 byte='+[zeroLength,oneByte,twoBytes,threeBytes].join('/'));
            if(shortExamples.length)umdDetails.push('Esempi NAL corte: '+shortExamples.join('; '));
            umdDetails.push('Diagnostica: i confini Annex-B sono provvisori; occorre validare slice header e continuità PES prima di attribuire i dati a frame reali.');
            if(exportStart>=0&&exportEnd>exportStart){
              const first=starts[exportStart].at,last=starts[exportEnd].at;
              const raw=joined.slice(first,last);
              if(raw.length>0&&raw.length<=1048576){
                const old=window.__frameVideoSampleUrl;
                if(old)URL.revokeObjectURL(old);
                const url=URL.createObjectURL(new Blob([raw],{type:'application/octet-stream'}));
                window.__frameVideoSampleUrl=url;
                const link=document.getElementById('frame-h264-sample-link')||document.createElement('a');
                link.id='frame-h264-sample-link';
                link.textContent='SCARICA CAMPIONE H.264 (sperimentale)';
                link.href=url;link.download='FRAME_UMD_video_sample.h264';
                link.style.cssText='display:inline-block;margin-top:12px;padding:12px;border-radius:10px;background:#bba0f4;color:#15111e;font-weight:700;text-decoration:none;';
                const outNode=document.getElementById('discReport');
                if(outNode&&outNode.parentNode)outNode.parentNode.appendChild(link);
                umdDetails.push('Campione H.264 esportabile: '+raw.length+' byte, da SPS a NAL dopo IDR; NON garantito decodificabile.');
              }
            }else{
              umdDetails.push('Campione H.264: SPS/PPS/IDR non presenti in sequenza completa nel campione.');
            }

            umdDetails.push('Verifica necessaria: le NAL possono attraversare PES non inclusi nel campione; nessun frame è ancora decodificato.');



            }
          }else{umdDetails.push('MPEG-PS: nessun file .MPS riconosciuto nella cartella STREAM.');}
        }
        if(files.length>12)umdDetails.push('  … e altri '+(files.length-12)+' file');
      }
      const playlist=contents.find(r=>r.name.toUpperCase()==='PLAYLIST.UMD'&&!r.directory);
      if(playlist){
        umdDetails.push('PLAYLIST.UMD: '+playlist.size+' byte (presente)');
        if(playlist.extent*2048+playlist.size<=file.size&&playlist.size<=8388608){
          const header=new Uint8Array(await file.slice(playlist.extent*2048,playlist.extent*2048+Math.min(64,playlist.size)).arrayBuffer());
          umdDetails.push('Intestazione playlist (hex): '+Array.from(header.slice(0,24),b=>b.toString(16).padStart(2,'0')).join(' '));
        }
      }
      // UMD menu investigation: inspect the actual disc structures rather than
      // presenting a fabricated PSP menu or guessing which MPS is "Play".
      const oldMenu=document.getElementById('frame-umd-menu-inspector');
      if(oldMenu)oldMenu.remove();
      const menuPanel=document.createElement('section');
      menuPanel.id='frame-umd-menu-inspector';
      menuPanel.style.cssText='margin:14px 0;padding:12px;border:1px solid #51445e;border-radius:12px;background:#171520;color:#eee;max-width:100%;overflow-wrap:anywhere';
      const menuTitle=document.createElement('strong');
      menuTitle.textContent='MENU UMD · INDAGINE STRUTTURALE';
      const menuIntro=document.createElement('p');
      menuIntro.style.cssText='font-size:13px;line-height:1.5;color:#c6bccc';
      menuIntro.textContent='Il menu originale (PLAY e riquadri illustrati) non coincide con ICON1.PMF. Qui leggiamo le risorse reali del disco; i comandi del film non sono ancora attivi.';
      menuPanel.append(menuTitle,menuIntro);
      const menuInfo=document.createElement('pre');
      menuInfo.style.cssText='font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:250px;overflow:auto';
      const menuLines=[];
      if(resources){
        const entries=await inspectIsoDirectory(file,resources.extent,resources.size);
        menuLines.push('RESOURCE ('+entries.length+' elementi):');
        for(const entry of entries.slice(0,35))menuLines.push('  '+(entry.directory?'[DIR] ':'')+entry.name+(entry.directory?'':' · '+entry.size+' byte'));
      }else menuLines.push('RESOURCE: cartella assente');
      if(playlist&&playlist.extent*2048+playlist.size<=file.size&&playlist.size<=8388608){
        const bytes=new Uint8Array(await file.slice(playlist.extent*2048,playlist.extent*2048+playlist.size).arrayBuffer());
        const strings=[];
        let current='';
        for(const byte of bytes){
          if(byte>=32&&byte<=126)current+=String.fromCharCode(byte);
          else{if(current.length>=4)strings.push(current);current='';}
        }
        if(current.length>=4)strings.push(current);
        menuLines.push('PLAYLIST.UMD: '+bytes.length+' byte');
        menuLines.push('Stringhe ASCII leggibili (non interpretate): '+(strings.slice(0,24).join(' | ')||'nessuna'));
        menuLines.push('Primi 96 byte HEX: '+Array.from(bytes.slice(0,96),x=>x.toString(16).padStart(2,'0')).join(' '));
      }else menuLines.push('PLAYLIST.UMD: non disponibile per analisi');
      menuInfo.textContent=menuLines.join('\n');
      const menuNote=document.createElement('p');
      menuNote.style.cssText='font-size:12px;color:#c6bccc';
      menuNote.textContent='Analisi locale: nessun file caricato online. Non sono ancora stati ricostruiti i pulsanti, i collegamenti o il motore dei menu UMD.';
      menuPanel.append(menuInfo,menuNote);
      panel.insertAdjacentElement('afterend',menuPanel);
      umdDetails.push('Lettura STREAM/CLIPINF: sola ispezione; decoder e audio UMD non integrati nel browser.');
    }
    const report=['File: '+file.name,'Formato: ISO9660','Dimensione: '+file.size+' byte','Volume: '+(volume||'Non indicato'),'Cartelle radice: '+(names.join(', ')||'Nessuna rilevata'),'Tipo rilevato: '+(umd?'UMD VIDEO':game?'PSP GAME':'ISO non identificata come gioco o UMD Video'),...Object.entries(metadata).map(([key,value])=>key+': '+value),detail,...umdDetails,'Integrità: struttura di base leggibile; contenuto e riproduzione non verificati.','Riproduzione PSP/UMD: non ancora disponibile in Safari.'];
    out.textContent=report.filter(Boolean).join(String.fromCharCode(10));
  }catch(err){out.textContent='Analizzatore: '+FRAME_INSPECTOR_VERSION+'\nAnalisi non riuscita: '+err.message;}
  finally{e.target.value='';}
};

if('serviceWorker' in navigator&&location.protocol==='https:')window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
$('player').addEventListener('error',()=>{const err=$('player').error;notice('Il video non è riproducibile in questo browser'+(err?' (errore '+err.code+')':'')+'. Prova un formato H.264/AAC compatibile.');});

// Android native UMD reader: browser preview continues to use the JavaScript inspector.
if (window.FrameNative && document.getElementById('inspectImage')) {
  const nativeButton = document.createElement('button');
  nativeButton.textContent = 'Analizza disco con motore Android';
  nativeButton.type = 'button';
  nativeButton.onclick = () => window.FrameNative.pickDisc();
  document.getElementById('inspectImage').insertAdjacentElement('afterend', nativeButton);
}

if (window.FrameNative && typeof window.FrameNative.previewUmd === 'function') {
  const watch = document.getElementById('watch');
  if (watch) {
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'primary';
    preview.textContent = 'ANTEPRIMA UMD VIDEO (SPERIMENTALE, SENZA AUDIO)';
    preview.addEventListener('click', () => window.FrameNative.previewUmd());
    watch.insertBefore(preview, watch.querySelector('.panel'));
  }
}


// Experimental local UMD ICON1.PMF animation: native browser WebCodecs,
// with Annex-B access units grouped at AUD boundaries (NAL type 9).
// No upload or remote conversion; unsupported Safari versions show an error.
// Experimental native MP4 path: wrap the original AVC access units in an
// ISO BMFF file without re-encoding. Safari's HTMLVideoElement then owns decode.
function frameNativeMp4(data){
  const bytes=(...v)=>new Uint8Array(v);
  const u16=n=>bytes((n>>>8)&255,n&255);
  const u32=n=>bytes((n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255);
  const ascii=s=>Uint8Array.from(s,c=>c.charCodeAt(0));
  const join=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let p=0;for(const a of parts){out.set(a,p);p+=a.length;}return out;};
  const box=(name,...parts)=>{const payload=join(...parts);return join(u32(payload.length+8),ascii(name),payload);};
  const full=(name,version,flags,...parts)=>box(name,bytes(version,(flags>>16)&255,(flags>>8)&255,flags&255),...parts);
  const nals=[];
  for(let p=0;p+5<data.length;){
    if(data[p]!==0||data[p+1]!==0){p++;continue;}
    const len=data[p+2]===1?3:(data[p+2]===0&&data[p+3]===1?4:0);
    if(!len){p++;continue;}
    nals.push({at:p,header:p+len,type:data[p+len]&31});p+=len+1;
  }
  const aud=nals.filter(n=>n.type===9);
  if(aud.length<4)throw Error('Campione senza delimitatori H264 sufficienti');
  const firstIdr=nals.find(n=>n.type===5);
  if(!firstIdr)throw Error('Nessun IDR nel campione');
  const beforeIdr=nals.filter(n=>n.at<firstIdr.at);
  const pps=[...beforeIdr].reverse().find(n=>n.type===8);
  const sps=pps&&[...beforeIdr].reverse().find(n=>n.type===7&&n.at<pps.at);
  if(!sps||!pps)throw Error('SPS/PPS validi non presenti prima dell’IDR');
  const payload=n=>{
    const next=nals.find(x=>x.at>n.at);
    const end=next?next.at:data.length;
    // Do not strip trailing zero bytes: H.264 CABAC alignment and padding
    // must be retained exactly until the next Annex-B start code.
    return data.subarray(n.header,end);
  };
  const spsData=payload(sps),ppsData=payload(pps);
  const avcc=box('avcC',bytes(1,spsData[1],spsData[2],spsData[3],255,225),u16(spsData.length),spsData,bytes(1),u16(ppsData.length),ppsData);
  const units=[];
  let cursor=0;
  for(let j=0;j<aud.length-1;j++){
    const begin=aud[j].at,end=aud[j+1].at;
    while(cursor<nals.length&&nals[cursor].at<begin)cursor++;
    const members=[];
    while(cursor<nals.length&&nals[cursor].at<end)members.push(nals[cursor++]);
    const slices=members.filter(n=>n.type===1||n.type===5);
    if(!slices.length)continue;
    const parts=members.filter(n=>n.type!==9&&n.type!==12).map(payload);
    units.push({parts,key:slices.some(n=>n.type===5)});
  }
  const key=units.findIndex(u=>u.key);
  if(key<0)throw Error('Nessun fotogramma IDR nel campione');
  // UMD H.264 uses interlaced field pictures. The earlier mux treated
  // each AUD-delimited field as a complete MP4 frame (90 samples -> ~45
  // decoded pictures in FFmpeg). Combine consecutive fields into one
  // sample; each sample retains both original field bitstreams.
  const fields=units.slice(key,key+90);
  if(fields.length<10)throw Error('Campione troppo corto');
  const samples=[];
  for(let k=0;k+1<fields.length;k+=2){
    samples.push({parts:[...fields[k].parts,...fields[k+1].parts],
      key:fields[k].key||fields[k+1].key});
  }
  if(samples.length<5)throw Error('Campione troppo corto dopo accoppiamento campi');
  const sampleBytes=samples.map(u=>join(...u.parts.map(p=>join(u32(p.length),p))));
  const sizes=sampleBytes.map(b=>b.length);
  const ftyp=box('ftyp',ascii('isom'),u32(512),ascii('isom'),ascii('iso2'),ascii('avc1'),ascii('mp41'));
  const mdat=box('mdat',...sampleBytes);
  const timescale=30000,duration=samples.length*1001,width=720,height=480;
  const matrix=join(u32(65536),u32(0),u32(0),u32(0),u32(65536),u32(0),u32(0),u32(0),u32(1073741824));
  const mvhd=full('mvhd',0,0,u32(0),u32(0),u32(timescale),u32(duration),u32(65536),u16(256),u16(0),new Uint8Array(8),matrix,new Uint8Array(24),u32(2));
  const tkhd=full('tkhd',0,7,u32(0),u32(0),u32(1),u32(0),u32(duration),new Uint8Array(8),u16(0),u16(0),u16(0),u16(0),matrix,u32(width*65536),u32(height*65536));
  const mdhd=full('mdhd',0,0,u32(0),u32(0),u32(timescale),u32(duration),u16(0x55c4),u16(0));
  const hdlr=full('hdlr',0,0,u32(0),ascii('vide'),new Uint8Array(12),ascii('VideoHandler'),bytes(0));
  const vmhd=full('vmhd',0,1,u16(0),u16(0),u16(0),u16(0));
  const dinf=box('dinf',full('dref',0,0,u32(1),full('url ',0,1)));
  const compressor=new Uint8Array(32);
  const avc1=box('avc1',new Uint8Array(6),u16(1),new Uint8Array(16),u16(width),u16(height),u32(0x00480000),u32(0x00480000),u32(0),u16(1),compressor,u16(24),u16(0xffff),avcc);
  const stsd=full('stsd',0,0,u32(1),avc1);
  const stts=full('stts',0,0,u32(1),u32(samples.length),u32(1001));
  const stsc=full('stsc',0,0,u32(1),u32(1),u32(samples.length),u32(1));
  const stsz=full('stsz',0,0,u32(0),u32(samples.length),...sizes.map(u32));
  const stco=full('stco',0,0,u32(1),u32(ftyp.length+8));
  const stss=full('stss',0,0,u32(samples.filter(u=>u.key).length),...samples.flatMap((u,i)=>u.key?[u32(i+1)]:[]));
  // v64 diagnostic: do not invent composition offsets from a partial
  // slice-type heuristic. It generated negative PTS and non-monotonic
  // timestamps. Decode-order-only MP4 establishes whether Safari can
  // open a structurally simple native sample before adding true POC/PTS.
  const stbl=box('stbl',stsd,stts,stsc,stsz,stco,stss);
  const minf=box('minf',vmhd,dinf,stbl);
  const mdia=box('mdia',mdhd,hdlr,minf);
  const trak=box('trak',tkhd,mdia);
  const moov=box('moov',mvhd,trak);
  // Place metadata before the media and point stco to the actual mdat payload.
  // v60 placed moov at the end; exporting this result permits ffprobe validation.
  const chunkOffset=ftyp.length+moov.length+8;
  const stcoFinal=full('stco',0,0,u32(1),u32(chunkOffset));
  const stblFinal=box('stbl',stsd,stts,stsc,stsz,stcoFinal,stss);
  const moovFinal=box('moov',mvhd,box('trak',tkhd,box('mdia',mdhd,hdlr,box('minf',vmhd,dinf,stblFinal))));
  return new Blob([ftyp,moovFinal,mdat],{type:'video/mp4'});
}
async function frameDecodeMovieAccessUnits(data,canvas,status,acceleration='prefer-software',pesTiming=[],nalMode='original'){
  if(typeof VideoDecoder==='undefined'||typeof EncodedVideoChunk==='undefined')
    throw Error('WebCodecs non disponibile in questo browser.');
  const nals=[];
  for(let i=0;i+4<data.length;){
    if(data[i]!==0||data[i+1]!==0){i++;continue;}
    const prefix=data[i+2]===1?3:(data[i+2]===0&&data[i+3]===1?4:0);
    if(!prefix){i++;continue;}
    const header=i+prefix;
    if(header<data.length)nals.push({at:i,header,type:data[header]&31});
    i=header+1;
  }
  const aud=nals.filter(n=>n.type===9);
  if(aud.length<3)throw Error('Meno di tre delimitatori AUD: impossibile ricostruire access unit complete.');
  const units=[];
  // The PES payloads have already been concatenated into a continuous
  // elementary stream. Build AUD-bounded units with a single linear pass,
  // including NALs split across original PES boundaries.
  let nalCursor=0,discardedUnits=0,multiSliceUnits=0;
  for(let j=0;j+1<aud.length;j++){
    const begin=aud[j].at,end=aud[j+1].at;
    while(nalCursor<nals.length&&nals[nalCursor].at<begin)nalCursor++;
    const members=[];
    while(nalCursor<nals.length&&nals[nalCursor].at<end)members.push(nals[nalCursor++]);
    const slices=members.filter(n=>n.type===1||n.type===5);
    const hasIDR=slices.some(n=>n.type===5);
    const invalid=members.some(n=>(data[n.header]&128)!==0);
    if(!invalid&&slices.length&&end-begin>=24){
      if(slices.length>1)multiSliceUnits++;
      units.push({begin,end,hasIDR,members,sliceCount:slices.length});
    }else discardedUnits++;
  }
  // PES timestamps are sparse (often one timestamp per many video PES
  // packets). Associate anchors with nearby AUD access units for diagnosis;
  // do not falsely assign a single PES PTS to every contained picture.
  const timingAnchors=pesTiming.filter(t=>t.pts!==null||t.dts!==null);
  const nearestUnit=at=>{
    let lo=0,hi=units.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(units[mid].begin<at)lo=mid+1;else hi=mid;}
    return Math.min(lo,units.length-1);
  };
  const anchored=timingAnchors.map(t=>({unit:nearestUnit(t.at),pts:t.pts,dts:t.dts}));
  let nonMonotonicAnchors=0,anchorReorder=0;
  for(let i=1;i<anchored.length;i++){
    if(anchored[i].pts!==null&&anchored[i-1].pts!==null&&anchored[i].pts<anchored[i-1].pts)nonMonotonicAnchors++;
    if(anchored[i].unit===anchored[i-1].unit)anchorReorder++;
  }
  // Read H.264 slice_type from the first VCL NAL. This is diagnostic
  // and allows presentation-order testing without assuming decode order.
  const sliceKind=unit=>{
    const n=unit.members.find(x=>x.type===1||x.type===5);
    if(!n)return '?';
    const raw=[];let zeros=0;
    const next=nals.find(x=>x.at>n.at)?.at??unit.end;
    for(let k=n.header+1;k<next;k++){
      const b=data[k];
      if(zeros>=2&&b===3){zeros=0;continue;}
      raw.push(b);zeros=b===0?zeros+1:0;
      if(raw.length>=32)break;
    }
    let bit=0;
    const readBit=()=>{if(bit>=raw.length*8)throw Error('slice header incompleto');const v=(raw[bit>>3]>>(7-(bit&7)))&1;bit++;return v;};
    const ue=()=>{let zeros=0;while(readBit()===0){zeros++;if(zeros>24)throw Error('ExpGolomb invalido');}let v=1;for(let j=0;j<zeros;j++)v=v*2+readBit();return v-1;};
    try{ue();const type=ue()%5;return ['P','B','I','SP','SI'][type];}catch{return '?';}
  };
  for(const unit of units)unit.pictureType=sliceKind(unit);
  // Validate the Annex-B elementary stream before handing it to WebCodecs.
  // Corrupt NAL boundaries can silently produce green/ghosted decoded images.
  const nalStats={forbidden:0,empty:0,missingStart:0,invalidRef:0};
  for(let k=0;k<nals.length;k++){
    const n=nals[k],end=k+1<nals.length?nals[k+1].at:data.length;
    if(data[n.header]&128)nalStats.forbidden++;
    if(end<=n.header+1)nalStats.empty++;
    if(n.type===5&&((data[n.header]>>5)&3)===0)nalStats.invalidRef++;
    if(data[n.at]!==0||data[n.at+1]!==0)nalStats.missingStart++;
  }
  if(nalStats.forbidden||nalStats.empty||nalStats.missingStart||nalStats.invalidRef)
    throw Error('Flusso H264 non valido: '+JSON.stringify(nalStats));
  const firstKey=units.findIndex(u=>u.hasIDR);
  if(firstKey<0)throw Error('Nessuna access unit IDR completa nel campione PES.');
  const first=units[firstKey];
  // Parameter sets must precede the IDR slice; parameter sets following
  // the keyframe can belong to a later configuration.
  const idrNal=first.members.find(n=>n.type===5);
  const preceding=nals.filter(n=>n.at<idrNal.at);
  const pps=[...preceding].reverse().find(n=>n.type===8);
  const sps=pps&&[...preceding].reverse().find(n=>n.type===7&&n.at<pps.at);
  if(!sps||!pps||sps.header+3>=data.length)
    throw Error('Parametri SPS/PPS mancanti prima del primo fotogramma IDR.');
  const codec='avc1.'+Array.from(data.subarray(sps.header+1,sps.header+4),b=>b.toString(16).padStart(2,'0')).join('');
  // UMD video may contain reordered B pictures (PTS != DTS).
  // Low-latency decoding can compromise frame reordering; disable it.
  const config={codec,hardwareAcceleration:acceleration,optimizeForLatency:false,avc:{format:'annexb'}};
  // Convert Annex-B NAL units to length-prefixed AVC, with an explicit
  // AVCDecoderConfigurationRecord. Safari's Annex-B WebCodecs path is
  // producing corrupt pictures although FFmpeg decodes the same ES.
  const rawNal=n=>{
    const end=nals.find(x=>x.at>n.at)?.at??data.length;
    let last=end;
    while(last>n.header+1&&data[last-1]===0)last--;
    return data.subarray(n.header,last);
  };
  const spsBytes=rawNal(sps),ppsBytes=rawNal(pps);
  const avcc=new Uint8Array(11+spsBytes.length+ppsBytes.length);
  let ac=0;
  avcc[ac++]=1;avcc[ac++]=spsBytes[1];avcc[ac++]=spsBytes[2];avcc[ac++]=spsBytes[3];
  avcc[ac++]=255;avcc[ac++]=225;
  avcc[ac++]=(spsBytes.length>>8)&255;avcc[ac++]=spsBytes.length&255;
  avcc.set(spsBytes,ac);ac+=spsBytes.length;
  avcc[ac++]=1;avcc[ac++]=(ppsBytes.length>>8)&255;avcc[ac++]=ppsBytes.length&255;
  avcc.set(ppsBytes,ac);
  const avcConfig={codec,hardwareAcceleration:acceleration,optimizeForLatency:false,description:avcc};
  const avcSupported=await VideoDecoder.isConfigSupported(avcConfig);
  const useAvc=avcSupported.supported;
  if(useAvc){delete config.avc;Object.assign(config,avcConfig);}
  const toAvc=unit=>{
    const parts=[];let total=0;
    for(let k=0;k<unit.members.length;k++){
      const n=unit.members[k];
      if(n.type===9||n.type===7||n.type===8)continue;
      const end=k+1<unit.members.length?unit.members[k+1].at:unit.end;
      let last=end;while(last>n.header+1&&data[last-1]===0)last--;
      const nal=data.subarray(n.header,last);
      if(!nal.length)continue;
      parts.push(nal);total+=4+nal.length;
    }
    const out=new Uint8Array(total);let pos=0;
    for(const nal of parts){
      const len=nal.length;
      out[pos++]=(len>>>24)&255;out[pos++]=(len>>>16)&255;
      out[pos++]=(len>>>8)&255;out[pos++]=len&255;
      out.set(nal,pos);pos+=len;
    }
    return out;
  };
  const supported=await VideoDecoder.isConfigSupported(config);
  if(!supported.supported)throw Error('Decoder Safari non supporta '+codec+' Annex-B.');
  const spsEnd=nals.find(n=>n.at>sps.at)?.at??pps.at;
  const prefix=data.subarray(sps.at,spsEnd);
  const ppsEnd=nals.find(n=>n.at>pps.at)?.at??first.begin;
  // The SPS and PPS may be separated by other NAL units. Send only
  // their exact byte ranges, with no intervening SEI/AUD/slices.
  const params=new Uint8Array(prefix.length+Math.max(0,ppsEnd-pps.at));
  params.set(prefix);params.set(data.subarray(pps.at,ppsEnd),prefix.length);
  // Keep an untouched elementary-stream export for independent FFmpeg
  // comparison with exactly the bytes sent to the browser decoder.
  const debugExport=document.createElement('button');
  debugExport.type='button';
  debugExport.textContent='ESPORTA H264 DEMUX FRAME (diagnostica)';
  debugExport.style.cssText='display:block;margin:8px 0;padding:10px;border:1px solid #8d79aa;border-radius:9px;background:transparent;color:#eee';
  debugExport.onclick=()=>{
    const blob=new Blob([data],{type:'application/octet-stream'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='FRAME_demux_7percent.h264';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  };
  const priorExport=canvas.parentElement.querySelector('[data-frame-h264-export]');
  if(priorExport)priorExport.remove();
  debugExport.dataset.frameH264Export='true';
  canvas.insertAdjacentElement('afterend',debugExport);
  let decoded=0,decoderError=null;
  // Retain downscaled canvases, not VideoFrame objects, to limit iPhone memory.
  const pictures=[];
  const decoder=new VideoDecoder({
    output(frame){
      const picture=document.createElement('canvas');
      picture.width=frame.displayWidth;picture.height=frame.displayHeight;
      picture.getContext('2d').drawImage(frame,0,0);
      // WebCodecs may output frames in presentation order, not submission
      // order. Preserve timestamps for diagnostics and playback sorting.
      pictures.push({canvas:picture,timestamp:frame.timestamp});decoded++;
      frame.close();
    },
    error(err){decoderError=err;}
  });
  try{
    decoder.configure(config);
    // UMD Video often stores interlaced top/bottom fields as separate AUD
    // units. Feed a pair as one coded picture when both fields are present.
    // This is an experimental decoder path; the original bytes are preserved.
    const rawFields=units.slice(firstKey,firstKey+90);
    const selected=[];
    for(let k=0;k<rawFields.length;k+=2){
      const firstField=rawFields[k],secondField=rawFields[k+1];
      if(!secondField){selected.push(firstField);break;}
      selected.push({
        begin:firstField.begin,end:secondField.end,
        members:[...firstField.members,...secondField.members],
        hasIDR:firstField.hasIDR||secondField.hasIDR,
        pictureType:firstField.pictureType
      });
    }
    // In decode order, B pictures typically follow their future reference.
    // Build a presentation-order timestamp map for the common closed GOP
    // pattern: I, P, B, P, B... . Unknown patterns retain decode order.
    const presentation=[];
    let pendingReference=null;
    if(selected.length)presentation.push(0);
    for(let k=1;k<selected.length;k++){
      const type=selected[k].pictureType;
      if(type==='B'){presentation.push(k);}
      else{
        if(pendingReference!==null)presentation.push(pendingReference);
        pendingReference=k;
      }
    }
    if(pendingReference!==null)presentation.push(pendingReference);
    const presentationRank=new Array(selected.length);
    presentation.forEach((decodeIndex,rank)=>{presentationRank[decodeIndex]=rank;});
    const bCount=selected.filter(u=>u.pictureType==='B').length;
    for(let i=0;i<selected.length;i++){
      if(decoder.state==='closed')break;
      const unit=selected[i];
      let chunk=useAvc?toAvc(unit):data.slice(unit.begin,unit.end);
      if(!useAvc&&nalMode==='no-aud'){
        const parts=[];let size=0;
        for(let k=0;k<unit.members.length;k++){
          const n=unit.members[k];if(n.type===9)continue;
          const end=k+1<unit.members.length?unit.members[k+1].at:unit.end;
          const part=data.subarray(n.at,end);parts.push(part);size+=part.length;
        }
        chunk=new Uint8Array(size);let at=0;
        for(const part of parts){chunk.set(part,at);at+=part.length;}
      }
      if(i===0&&!useAvc){
        const combined=new Uint8Array(params.length+chunk.length);
        combined.set(params);combined.set(chunk,params.length);chunk=combined;
      }
      decoder.decode(new EncodedVideoChunk({type:unit.hasIDR?'key':'delta',timestamp:(presentationRank[i]??i)*33367,data:chunk}));
      if(decoder.decodeQueueSize>8)await new Promise(resolve=>setTimeout(resolve,20));
    }
    if(decoder.state!=='closed')await decoder.flush();
    if(!pictures.length)throw Error(decoderError?.message||'Nessun fotogramma prodotto dal decoder.');
    // Keep decoder output order and report whether it differs from
    // submitted chunk order. Synthetic timestamps are NOT real UMD PTS.
    const outputReorders=pictures.reduce((n,p,i)=>n+(i>0&&p.timestamp<pictures[i-1].timestamp?1:0),0);
    pictures.sort((a,b)=>a.timestamp-b.timestamp);
    const timestamps=pictures.map(p=>p.timestamp);
    const uniqueTimestamps=new Set(timestamps).size;
    for(let i=0;i<pictures.length;i++)pictures[i]=pictures[i].canvas;
    // The green startup is an actual decoding artifact, not a display filter.
    // Start preview after warm-up; preserve full frames for diagnostic thumbnails.
    // Inspect frames without altering pixels. Detect conspicuous green tint
    // and alternating horizontal scanlines, then start at a cleaner frame.
    const quality=(picture)=>{
      const probe=document.createElement('canvas');
      probe.width=96;probe.height=64;
      const cx=probe.getContext('2d',{willReadFrequently:true});
      cx.drawImage(picture,0,0,96,64);
      const rgba=cx.getImageData(0,0,96,64).data;
      let green=0,bright=0,alternation=0;
      const rows=[];
      for(let y=0;y<64;y++){
        let luminance=0;
        for(let x=0;x<96;x++){
          const k=(y*96+x)*4,r=rgba[k],g=rgba[k+1],b=rgba[k+2];
          if(g>r*1.38&&g>b*1.38&&g>45)green++;
          if(r>45||g>45||b>45)bright++;
          luminance+=(r+g+b)/3;
        }
        rows.push(luminance/96);
      }
      for(let y=2;y<64;y++)alternation+=Math.abs(rows[y]-2*rows[y-1]+rows[y-2]);
      return {green:green/6144,striping:alternation/62,visible:bright/6144};
    };
    const scores=pictures.map(quality);
    const baseline=Math.min(15,Math.max(0,pictures.length-1));
    let warmup=baseline;
    // Avoid discarding a mostly normal scene: select a later frame only if
    // it is substantially cleaner than the default 15-frame warm-up.
    const startScore=q=>q.green*3+q.striping/65+(q.visible<0.12?1:0);
    const baselineScore=startScore(scores[baseline]);
    for(let i=baseline+1;i<pictures.length;i++){
      if(startScore(scores[i])<Math.min(0.48,baselineScore*0.55)){
        warmup=i;break;
      }
    }
    canvas.width=pictures[warmup].width;canvas.height=pictures[warmup].height;
    const context=canvas.getContext('2d');
    context.drawImage(pictures[warmup],0,0);
    const oldGrid=canvas.parentElement.querySelector('[data-frame-movie-samples]');
    if(oldGrid)oldGrid.remove();
    const grid=document.createElement('div');
    grid.dataset.frameMovieSamples='true';
    grid.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0';
    const indices=[0,29,59,89].filter(i=>i<pictures.length);
    for(const index of indices){
      const cell=document.createElement('div');
      const thumbnail=pictures[index];
      const preview=document.createElement('canvas');
      preview.width=288;preview.height=192;
      preview.style.cssText='width:100%;height:auto;background:black;border-radius:8px';
      preview.getContext('2d').drawImage(thumbnail,0,0,288,192);
      const caption=document.createElement('p');
      caption.style.cssText='font-size:12px;margin:3px 0';
      caption.textContent='Fotogramma '+(index+1)+' / '+decoded;
      cell.append(preview,caption);grid.appendChild(cell);
    }
    canvas.insertAdjacentElement('afterend',grid);
    const prior=canvas._framePlayback;
    if(prior)prior.stop();
    const controls=document.createElement('div');
    controls.style.cssText='display:flex;gap:8px;margin:8px 0;flex-wrap:wrap';
    const play=document.createElement('button');
    play.type='button';play.textContent='▶ RIPRODUCI ANTEPRIMA FLUIDA';
    play.style.cssText='padding:9px;border-radius:8px;border:1px solid #a98bce;background:#30263f;color:white';
    const stop=document.createElement('button');
    stop.type='button';stop.textContent='■ FERMA';
    stop.style.cssText='padding:9px;border-radius:8px;border:1px solid #a98bce;background:transparent;color:white';
    const playbackNote=document.createElement('p');
    playbackNote.style.cssText='font-size:12px;color:#c6bccc';
    playbackNote.textContent='Anteprima silenziosa: avvio al fotogramma '+(warmup+1)+' / '+pictures.length+' (stima automatica di verde e righe). Il controllo non modifica i colori.';
    const live=document.createElement('canvas');
    live.width=canvas.width;live.height=canvas.height;
    live.style.cssText='display:block;width:100%;max-width:520px;height:auto;background:#000;border-radius:10px;margin:10px 0';
    live.getContext('2d').drawImage(pictures[warmup],0,0);
    controls.append(play,stop);
    grid.insertAdjacentElement('afterend',controls);
    controls.insertAdjacentElement('afterend',live);
    live.insertAdjacentElement('afterend',playbackNote);
    // v73: deterministic presentation clock for the validated paired-field
    // preview. 30000/1001 is provisional, not a measured original UMD PTS.
    // Keep decoded frames cached and loop them without re-decoding or
    // accumulating setInterval drift. Do not redraw twice per display tick.
    const fps=30000/1001;
    const frameMs=1000/fps;
    const count=pictures.length-warmup;
    let raf=null,started=0,lastIndex=-1,lastStep=-1,dropped=0,loops=0;
    const halt=()=>{if(raf!==null)cancelAnimationFrame(raf);raf=null;play.disabled=false;};
    const drawIndex=index=>{
      const picture=pictures[index];
      context.drawImage(picture,0,0,canvas.width,canvas.height);
      live.getContext('2d').drawImage(picture,0,0,live.width,live.height);
      playbackNote.textContent='Anteprima '+fps.toFixed(2)+' fps (stimati) · fotogramma '+(index+1)+'/'+pictures.length+
        ' · cicli '+loops+' · fotogrammi saltati '+dropped+' · senza audio.';
    };
    const tick=now=>{
      if(document.hidden){halt();playbackNote.textContent='Anteprima in pausa: scheda non visibile.';return;}
      const elapsed=Math.max(0,now-started);
      const step=Math.floor(elapsed/frameMs);
      const index=warmup+(step%count);
      loops=Math.floor(step/count);
      if(index!==lastIndex){
        if(lastIndex>=warmup){
          if(lastStep>=0&&step>lastStep+1)dropped+=step-lastStep-1;
        }
        drawIndex(index);lastIndex=index;lastStep=step;
      }
      raf=requestAnimationFrame(tick);
    };
    play.onclick=()=>{halt();lastIndex=-1;lastStep=-1;dropped=0;loops=0;started=performance.now();play.disabled=true;raf=requestAnimationFrame(tick);};
    stop.onclick=()=>{halt();playbackNote.textContent='Anteprima fermata · '+loops+' cicli · '+dropped+' fotogrammi saltati.';};
    canvas._framePlayback={stop:()=>{halt();controls.remove();live.remove();playbackNote.remove();}};
    playbackNote.textContent='Anteprima in ciclo a 29,97 fps stimati, senza audio. Premi RIPRODUCI per verificare il movimento.';
    status.textContent='Test campi interlacciati accoppiati ('+rawFields.length+' campi in '+selected.length+' campioni). Formato decoder '+(useAvc?'AVC length-prefixed con avcC':'Annex-B fallback')+'. Riordino sperimentale B-frame: '+bCount+' B su '+selected.length+' unità; timestamp di presentazione ricostruiti (non PTS originali). Decoder senza modalità bassa latenza; inversioni timestamp in output '+outputReorders+'. NAL '+(nalMode==='no-aud'?'senza AUD':'originali con AUD')+'. PTS originali associati: '+anchored.length+', PTS decrescenti '+nonMonotonicAnchors+', più ancore sulla stessa unità '+anchorReorder+'. Timestamp sintetici ancora usati per la riproduzione. NAL '+nals.length+', AUD '+aud.length+', unità scartate '+discardedUnits+', unità multi-slice '+multiSliceUnits+'. PES ('+acceleration+'): '+selected.length+' unità complete, '+decoded+' fotogrammi, '+uniqueTimestamps+' timestamp distinti. Avvio al fotogramma '+(warmup+1)+' (verde '+Math.round(scores[warmup].green*100)+'%, righe '+scores[warmup].striping.toFixed(1)+'). Ordinamento per timestamp; artefatti non ancora corretti.';
  }finally{
    if(decoder.state!=='closed')decoder.close();
  }
}
async function framePreviewH264(data,canvas,status,signal){
  if(typeof VideoDecoder==='undefined'||typeof EncodedVideoChunk==='undefined')
    throw Error('WebCodecs VideoDecoder non supportato in questo browser. Usa Safari aggiornato o la futura app nativa.');
  const nals=[];
  for(let i=0;i+4<data.length;){
    if(data[i]!==0||data[i+1]!==0){i++;continue;}
    const prefix=data[i+2]===1?3:(data[i+2]===0&&data[i+3]===1?4:0);
    if(!prefix){i++;continue;}
    nals.push({start:i,header:i+prefix,type:data[i+prefix]&31});
    i+=prefix;
  }
  if(!nals.length)throw Error('Nessuna unità H.264 trovata.');
  // AUD identifies access-unit boundaries in this PSP PMF sample.
  const boundaries=[];
  for(const nal of nals)if(nal.type===9&&nal.start>0)boundaries.push(nal.start);
  const slices=[];let start=0;
  for(const at of boundaries){if(at>start){slices.push(data.slice(start,at));start=at;}}
  if(start<data.length)slices.push(data.slice(start));
  if(slices.length<2)throw Error('Nessun confine fra fotogrammi rilevato.');
  const sps=nals.find(n=>n.type===7);
  const codec=sps&&sps.header+3<data.length?
    'avc1.'+Array.from(data.slice(sps.header+1,sps.header+4),x=>x.toString(16).padStart(2,'0')).join(''):'avc1.4d401e';
  const config={codec,hardwareAcceleration:'prefer-software',optimizeForLatency:true};
  const support=await VideoDecoder.isConfigSupported(config);
  if(!support.supported)throw Error('Codec '+codec+' non supportato da WebCodecs.');
  const ctx=canvas.getContext('2d');
  const frames=[];
  let decodeError=null;
  const decoder=new VideoDecoder({
    output:frame=>{
      if(frames.length<90)frames.push(frame);
      else frame.close();
      status.textContent='Decodifica UMD: '+frames.length+' fotogrammi acquisiti (senza audio).';
    },
    error:err=>{decodeError=err;status.textContent='Errore decoder H.264: '+err.message;}
  });
  try{
    decoder.configure(config);
    let timestamp=0;
    for(let i=0;i<slices.length;i++){
      if(decoder.state==='closed')break;
      decoder.decode(new EncodedVideoChunk({
        type:i===0?'key':'delta',timestamp,data:slices[i]
      }));
      timestamp+=33333;
      if(decoder.decodeQueueSize>8)await new Promise(resolve=>setTimeout(resolve,30));
    }
    if(decoder.state!=='closed')await decoder.flush();
    if(!frames.length)throw Error(decodeError?.message||'Nessun fotogramma decodificato.');
    // Display frames at a human-visible cadence instead of drawing them all
    // immediately in the decoder output callback.
    const snapshots=[0,Math.floor((frames.length-1)/2),frames.length-1];
    const samples=[];
    for(const index of snapshots){
      ctx.drawImage(frames[index],0,0,canvas.width,canvas.height);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let hash=2166136261;
      for(let k=0;k<pixels.length;k+=64){
        hash=Math.imul(hash^pixels[k],16777619)>>>0;
        hash=Math.imul(hash^pixels[k+1],16777619)>>>0;
        hash=Math.imul(hash^pixels[k+2],16777619)>>>0;
      }
      samples.push(hash.toString(16));
    }
    const unique=new Set(samples).size;
    // WebCodecs returns frames in presentation order. Respect their timestamps
    // instead of assuming a fixed frame rate or racing through the canvas.
    const firstTimestamp=frames[0].timestamp;
    const durationUs=Math.max(0,frames[frames.length-1].timestamp-firstTimestamp);
    const fps=durationUs>0?Math.round((frames.length-1)*1000000/durationUs):0;
    const previous=canvas.parentElement.querySelector('[data-frame-pmf-diagnostic]');
    if(previous)previous.remove();
    const diagnostic=document.createElement('div');
    diagnostic.dataset.framePmfDiagnostic='true';
    diagnostic.style.cssText='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:10px 0;max-width:100%';
    for(let j=0;j<snapshots.length;j++){
      const thumb=document.createElement('canvas');
      thumb.width=144;thumb.height=80;
      thumb.style.cssText='display:block;width:100%;height:auto;border-radius:6px;background:#000';
      thumb.getContext('2d').drawImage(frames[snapshots[j]],0,0,144,80);
      const wrap=document.createElement('div');
      wrap.style.cssText='min-width:0;font-size:11px;color:#c6bccc';
      wrap.append(thumb,document.createTextNode(['Inizio','Metà','Fine'][j]));
      diagnostic.appendChild(wrap);
    }
    canvas.insertAdjacentElement('afterend',diagnostic);
    const frameDuration=durationUs>0?durationUs/Math.max(1,frames.length-1):33333;
    const loopDuration=durationUs+frameDuration;
    const loops=3;
    status.textContent='Campioni differenti: '+unique+'/3 · '+frames.length+' fotogrammi · '+(fps||'?')+' fps. Riproduzione x'+loops+'; premi FERMA per interrompere.';
    const started=performance.now();
    await new Promise(resolve=>{
      let raf=0;
      const stop=()=>{if(raf)cancelAnimationFrame(raf);resolve();};
      if(signal)signal.addEventListener('abort',stop,{once:true});
      function tick(now){
        if(signal?.aborted){stop();return;}
        const elapsed=(now-started)*1000;
        if(elapsed>=loopDuration*loops){
          ctx.drawImage(frames[frames.length-1],0,0,canvas.width,canvas.height);
          resolve();
          return;
        }
        const localTime=elapsed%loopDuration;
        let index=0;
        while(index+1<frames.length&&frames[index+1].timestamp-firstTimestamp<=localTime)index++;
        ctx.drawImage(frames[index],0,0,canvas.width,canvas.height);
        raf=requestAnimationFrame(tick);
      }
      raf=requestAnimationFrame(tick);
    });
    status.textContent=signal?.aborted?'Anteprima interrotta. Campioni differenti: '+unique+'/3.':
      'Anteprima riprodotta '+loops+' volte: '+frames.length+' fotogrammi, '+(fps||'?')+' fps stimati, '+unique+'/3 campioni differenti. Nessun audio.';
  }finally{
    for(const frame of frames)frame.close();
    if(decoder.state!=='closed')decoder.close();
  }
}
