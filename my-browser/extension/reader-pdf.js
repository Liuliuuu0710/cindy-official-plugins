import {getDocument,GlobalWorkerOptions} from './vendor/pdfjs/pdf.mjs';
import {createOCR,ocrLanguages} from './ocr.js';
import {PdfBinaryDataFactory} from './pdf-cmap-bundle.js';
const MAX_TEXT_PART=1000,MAX_BATCH_ITEMS=12,MAX_BATCH_CHARS=20000,MAX_TRANSLATION_BATCHES=20,MAX_TRANSLATION_CHARS=200000;
function boundedParts(value,max=MAX_TEXT_PART){const parts=[];for(let start=0;start<value.length;start+=max)parts.push(value.slice(start,start+max));return parts;}
function translationBatches(parts){const batches=[];let batch=[],characters=0;for(const part of parts){if(batch.length&&(batch.length>=MAX_BATCH_ITEMS||characters+part.length>MAX_BATCH_CHARS)){batches.push(batch);batch=[];characters=0;}batch.push(part);characters+=part.length;}if(batch.length)batches.push(batch);return batches;}
GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
export async function openPDF({file,container,call,target,t,report}) {
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const button=(text,fn)=>{const b=el('button',text);b.onclick=()=>Promise.resolve(fn()).catch(report);return b;};
  const task=getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true,
    cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,
    standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href,
    wasmUrl:new URL('./vendor/pdfjs/wasm/',import.meta.url).href,
    useWorkerFetch:false,BinaryDataFactory:PdfBinaryDataFactory});
  const pdf=await task.promise;let number=1,generation=0,translationRevision=0,renderTask,texts=[],ocrBusy=false,selectedRegion;
  const progress=el('p'),ocr=createOCR(n=>{progress.textContent=`OCR ${Math.round(n*100)}%`;});
  container.replaceChildren();const navigation=el('div');navigation.className='row';const label=el('span'),canvas=el('canvas'),text=el('div');text.className='stack';canvas.style.cssText='max-width:100%;height:auto;border:1px solid var(--board);touch-action:none;cursor:crosshair';
  const language=el('select');language.setAttribute('aria-label',t.ocrLanguage);
  for(const [value,name]of Object.entries(ocrLanguages)){const o=el('option',name);o.value=value;language.append(o);}
  const question=el('textarea');question.placeholder=t.pdfQuestion;const answer=el('p');
  navigation.append(button(t.previousPage,()=>{number=Math.max(1,number-1);return page();}),label,button(t.nextPage,()=>{number=Math.min(pdf.numPages,number+1);return page();}),button(t.translate,translate));
  const scan=el('div');scan.className='row';scan.append(language,button(t.ocr,()=>scanPage()),button(t.cropOCR,()=>scanPage(true)),progress);
  const layout=el('div');layout.className='pdf-layout';const sheet=el('div'),reading=el('div'),selection=el('div');sheet.style.position='relative';selection.style.cssText='position:absolute;border:2px solid var(--focus);pointer-events:none;display:none';sheet.append(canvas,selection);reading.className='stack';const style=el('style',' .pdf-layout{display:grid;grid-template-columns:minmax(0,3fr) minmax(260px,2fr);gap:20px;align-items:start}@media(max-width:800px){.pdf-layout{grid-template-columns:1fr}}');
  reading.append(el('small',t.cropHint),scan,text,question,button(t.explain,async()=>{if(!question.value.trim())return;const g=generation;const r=await call({op:'explain',text:question.value,context:texts.join('\n').slice(0,4000),target:target()});if(g===generation)answer.textContent=r.text;}),answer);layout.append(sheet,reading);container.append(style,navigation,layout);
  let start;
  const point=e=>{const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(canvas.width,(e.clientX-r.left)*canvas.width/r.width)),y:Math.max(0,Math.min(canvas.height,(e.clientY-r.top)*canvas.height/r.height))};};
  canvas.onpointerdown=e=>{start=point(e);canvas.setPointerCapture(e.pointerId);};
  canvas.onpointerup=e=>{if(!start)return;const end=point(e);selectedRegion={x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),w:Math.abs(end.x-start.x),h:Math.abs(end.y-start.y)};start=null;const scale=canvas.getBoundingClientRect().width/canvas.width;Object.assign(selection.style,{display:'block',left:selectedRegion.x*scale+'px',top:selectedRegion.y*scale+'px',width:selectedRegion.w*scale+'px',height:selectedRegion.h*scale+'px'});progress.textContent=selectedRegion.w>5&&selectedRegion.h>5?t.cropSelected:t.cropHint;};
  async function page(){const g=++generation;renderTask?.cancel();selectedRegion=null;selection.style.display='none';texts=[];const p=await pdf.getPage(number);if(g!==generation)return;label.textContent=`${number} / ${pdf.numPages}`;text.replaceChildren();answer.textContent='';progress.textContent='';
    const viewport=p.getViewport({scale:Math.min(2,1800/p.getViewport({scale:1}).width)});canvas.width=viewport.width;canvas.height=viewport.height;renderTask=p.render({canvasContext:canvas.getContext('2d'),viewport});try{await renderTask.promise;}catch(e){if(e.name==='RenderingCancelledException')return;throw e;}
    const extracted=await p.getTextContent();if(g!==generation)return;let line='',lines=[];
    for(const item of extracted.items){if(typeof item.str!=='string')continue;for(const part of boundedParts(item.str)){if(line&&line.length+part.length+1>MAX_TEXT_PART){lines.push(line.trim());line='';}line+=part+(item.hasEOL?'\n':' ');if(line.length>=MAX_TEXT_PART||item.hasEOL){lines.push(line.trim());line='';}}}if(line.trim())lines.push(line.trim());texts=lines.filter(Boolean).flatMap(part=>boundedParts(part,4000));
    if(!texts.length)text.append(el('p',t.pdfOCR));
  }
  async function scanPage(crop=false){
    if(ocrBusy)throw Error('BUSY');const g=generation;ocrBusy=true;
    try{let input=canvas;
      if(crop){if(!selectedRegion||selectedRegion.w<5||selectedRegion.h<5)throw Error('SELECT_REGION');const r=selectedRegion;input=el('canvas');input.width=r.w;input.height=r.h;input.getContext('2d').drawImage(canvas,r.x,r.y,r.w,r.h,0,0,r.w,r.h);}
      const result=await ocr.recognize(input,language.value);if(g!==generation)return;translationRevision++;texts=result.match(/[\s\S]{1,1000}/g)||[];text.replaceChildren(el('p',result||t.ocrEmpty));progress.textContent='';
    }finally{ocrBusy=false;}
  }
  async function translate(){const g=generation,revision=++translationRevision,textParts=[...texts],batches=translationBatches(textParts),totalCharacters=textParts.reduce((sum,part)=>sum+part.length,0),language=target();if(batches.length>MAX_TRANSLATION_BATCHES||totalCharacters>MAX_TRANSLATION_CHARS)throw Error('IMPORT_TOO_LARGE');text.replaceChildren();for(const batch of batches){if(g!==generation||revision!==translationRevision)return;const r=await call({op:'translate',texts:batch,target:language});if(g!==generation||revision!==translationRevision)return;batch.forEach((original,j)=>{const section=el('section');section.className='card stack';section.append(el('p',original),el('p',r.translations[j]));text.append(section);});}}
  try{await page();}catch(e){ocr.close();await task.destroy();throw e;}
  return ()=>{generation++;renderTask?.cancel();ocr.close();task.destroy();};
}
