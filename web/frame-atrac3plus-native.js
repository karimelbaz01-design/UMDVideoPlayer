(function(g){'use strict';
async function load(options={}){
 if(typeof g.createFrameAtrac3Plus!=='function'){
  await new Promise((ok,bad)=>{const s=document.createElement('script');s.src='./frame-atrac3plus-wasm.js?v=fix-20261122-2';s.onload=ok;s.onerror=()=>bad(Error('Decoder JS non disponibile'));document.head.appendChild(s);});
 }
 const m=await g.createFrameAtrac3Plus({locateFile:p=>'./'+p+'?v=fix-20261122-2'});
 const available=()=>{try{return m.cwrap('frame_atrac3p_available','number',[])();}catch(e){throw Error('Il modulo WASM pubblicato non include ancora frame_atrac3p_available. Attendi la nuova compilazione e aggiorna la pagina.');}};
 const init=m.cwrap('frame_atrac3p_init','number',['number','number','number']);
 const decode=m.cwrap('frame_atrac3p_decode_frame','number',['number','number','number','number']);
 const channels=m.cwrap('frame_atrac3p_get_channels','number',[]);
 const rate=m.cwrap('frame_atrac3p_get_sample_rate','number',[]);
 const close=m.cwrap('frame_atrac3p_close',null,[]);
 if(options.probeOnly)return {available:available()===1,dispose(){}};
 const ch=options.channels||2, sampleRate=options.sampleRate||44100;
 const rc=init(ch,sampleRate,options.blockAlign||0);
 if(rc!==0)throw Error('ATRAC3plus init error '+rc);
 const capacity=65536, out=m._malloc(capacity*4);
 if(!out){close();throw Error('Allocazione PCM fallita');}
 let disposed=false;
 return {decode(packet){
   if(disposed)throw Error('Decoder chiuso');
   const bytes=packet instanceof Uint8Array?packet:new Uint8Array(packet);
   const ptr=m._malloc(bytes.byteLength);
   if(!ptr)throw Error('Allocazione packet fallita');
   try{
     m.HEAPU8.set(bytes,ptr);
     const n=decode(ptr,bytes.byteLength,out,capacity);
     if(n<0)throw Error('ATRAC3plus decode error '+n);
     if(n===0)return null;
     const pcm=new Float32Array(n);
     pcm.set(m.HEAPF32.subarray(out>>>2,(out>>>2)+n));
     return {samples:pcm,channels:channels(),sampleRate:rate()};
   }finally{m._free(ptr);}
 },dispose(){if(disposed)return;disposed=true;m._free(out);close();}};
}
g.FrameAtrac3PlusNative={load};
})(window);
