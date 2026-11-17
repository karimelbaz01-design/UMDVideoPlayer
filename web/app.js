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
function pollGamepad(){const pads=navigator.getGamepads?.()||[];const pad=Array.from(pads).find(Boolean);$('padStatus').textContent=pad?'Controller: '+pad.id:'Controller non rilevato';if(pad){const down=pad.buttons.map(b=>b.pressed);const fresh=i=>down[i]&&!previousButtons[i];if(fresh(4))go(tabs[(tabs.indexOf(active)+tabs.length-1)%tabs.length]);if(fresh(5))go(tabs[(tabs.indexOf(active)+1)%tabs.length]);const move=fresh(12)?-1:fresh(13)?1:0;if(move){const elements=[...document.querySelectorAll('nav button,section:not([hidden]) button,section:not([hidden]) input')].filter(el=>el.offsetParent!==null);const idx=elements.indexOf(document.activeElement);elements[(idx+move+elements.length)%elements.length]?.focus();}if(fresh(0)&&document.activeElement instanceof HTMLElement)document.activeElement.click();previousButtons=down;}else previousButtons=[];requestAnimationFrame(pollGamepad);}
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

$('inspectImage').onclick=()=>$('inspectFile').click();
$('inspectFile').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  const out=$('discReport');out.textContent='Analisi in corso…';
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
    out.textContent=['File: '+file.name,'Formato: ISO9660','Dimensione: '+file.size+' byte','Volume: '+(volume||'Non indicato'),'Cartelle radice: '+(names.join(', ')||'Nessuna rilevata'),'Tipo rilevato: '+(umd?'UMD VIDEO':game?'PSP GAME':'ISO non identificata come gioco o UMD Video'),...Object.entries(metadata).map(([key,value])=>key+': '+value),detail,'Integrità: struttura di base leggibile;
  }catch(err){out.textContent='Analisi non riuscita: '+err.message;}
  finally{e.target.value='';}
};

if('serviceWorker' in navigator&&location.protocol==='https:')window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
$('player').addEventListener('error',()=>{const err=$('player').error;notice('Il video non è riproducibile in questo browser'+(err?' (errore '+err.code+')':'')+'. Prova un formato H.264/AAC compatibile.');});
