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
const FRAME_INSPECTOR_VERSION='UMD v21 · PMF inspection';
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
          const mps=files.filter(r=>/\.MPS$/i.test(r.name)).sort((a,b)=>b.size-a.size)[0];
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
