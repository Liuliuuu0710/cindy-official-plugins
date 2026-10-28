import Tesseract from './vendor/tesseract/tesseract.esm.min.js';
const {createWorker}=Tesseract;
export const ocrLanguages={eng:'English',chi_sim:'简体中文',jpn:'日本語',kor:'한국어',fra:'Français',deu:'Deutsch',spa:'Español',ita:'Italiano',por:'Português',rus:'Русский'};
// All executable code and language data are bundled. No CDN or uploaded images.
export function createOCR(progress=()=>{}) {
  let worker,loading,current,closed=false;
  async function recognize(image,language='eng') {
    if(closed)throw Error('REQUEST_CANCELLED');
    if(!Object.hasOwn(ocrLanguages,language))throw Error('INVALID_LANGUAGE');
    if(loading)await loading;
    if(current!==language){
      await worker?.terminate();worker=null;
      loading=createWorker(language,1,{
        workerPath:new URL('./vendor/tesseract/worker.min.js',import.meta.url).href,
        corePath:new URL('./vendor/tesseract/tesseract-core-lstm.wasm.js',import.meta.url).href,
        langPath:new URL('./vendor/tesseract/lang/',import.meta.url).href,
        workerBlobURL:false,cacheMethod:'none',logger:m=>progress(m.progress||0)
      });
      try{worker=await loading;current=language;}finally{loading=null;}
      if(closed){await worker.terminate();throw Error('REQUEST_CANCELLED');}
    }
    const result=await worker.recognize(image);
    if(closed)throw Error('REQUEST_CANCELLED');
    return result.data.text.trim();
  }
  return {recognize,close(){closed=true;worker?.terminate();}};
}
