const CMapPrefix='package/cmaps/';
const CMapSuffix='.bcmap';
const isCMapName=name=>typeof name==='string'&&/^[A-Za-z0-9._-]+\.bcmap$/.test(name);
const text=(bytes,start,end)=>new TextDecoder().decode(bytes.subarray(start,end)).replace(/\0.*$/,'').trim();
const octal=(bytes,start,end)=>{const value=text(bytes,start,end).replace(/[^0-7].*$/,'');return value?Number.parseInt(value,8):0;};

export function parseCMapTar(bytes){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
  const maps=new Map();
  for(let offset=0;offset+512<=bytes.length;){
    const header=bytes.subarray(offset,offset+512);
    if(header.every(value=>value===0))break;
    const name=text(header,0,100),prefix=text(header,345,500),size=octal(header,124,136),type=header[156];
    if(!name||size<0||!Number.isSafeInteger(size))throw new Error('Invalid CMap archive header.');
    const path=prefix?`${prefix}/${name}`:name;
    const start=offset+512,end=start+size;
    if(end>bytes.length)throw new Error('Truncated CMap archive.');
    if((type===0||type===48)&&path.startsWith(CMapPrefix)&&isCMapName(path.slice(CMapPrefix.length))){
      const filename=path.slice(CMapPrefix.length);
      maps.set(filename,bytes.slice(start,end));
    }
    offset=start+Math.ceil(size/512)*512;
  }
  if(!maps.size)throw new Error('CMap archive contains no maps.');
  return maps;
}

async function gunzip(bytes){
  if(typeof DecompressionStream!=='function')throw new Error('CMap archive decompression is unavailable.');
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export class PdfBinaryDataFactory{
  constructor({cMapUrl=null,standardFontDataUrl=null,wasmUrl=null}){
    this.urls={cMapUrl,standardFontDataUrl,wasmUrl};
    this.cMaps=null;
    this.cMapArchive=null;
  }
  async loadCMaps(){
    if(!this.cMapArchive){
      const url=new URL('cmaps.tar.gz',this.urls.cMapUrl);
      const response=await fetch(url);
      if(!response.ok)throw new Error(`Unable to load CMap archive: ${response.status}`);
      this.cMapArchive=gunzip(await response.arrayBuffer()).then(parseCMapTar);
    }
    return this.cMapArchive;
  }
  async fetch({kind,filename}){
    if(kind==='cMapUrl'){
      const name=filename.endsWith(CMapSuffix)?filename:`${filename}${CMapSuffix}`;
      if(!isCMapName(name))throw new Error(`Invalid CMap name: ${filename}`);
      const data=(await this.loadCMaps()).get(name);
      if(!data)throw new Error(`CMap is not included: ${name}`);
      return data;
    }
    const base=this.urls[kind];
    if(!base)throw new Error(`Missing PDF.js resource URL: ${kind}`);
    const response=await fetch(new URL(filename,base));
    if(!response.ok)throw new Error(`Unable to load PDF.js resource: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
}
