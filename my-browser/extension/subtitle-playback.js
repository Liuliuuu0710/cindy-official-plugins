'use strict';
(function(root){
  // Own only pauses introduced by subtitle buffering. Never resume a video the user paused.
  function create(media,{state,waiting,ready,error}) {
    const source=media.currentSrc;let owned=false,expectedPause=false,wantsPlay=!media.paused,started=false,disposed=false;
    function update(){
      if(disposed)return;
      const buffer=state();
      if(buffer.blocked){
        // A failed translation must not strand a pause that Cindy introduced.
        if(owned){owned=false;if(wantsPlay)media.play().catch(e=>{wantsPlay=false;error?.(e);});}
        return;
      }
      if(owned&&buffer.ready){owned=false;started=true;ready?.(buffer);if(wantsPlay)media.play().catch(e=>{wantsPlay=false;error?.(e);});return;}
      if(!owned&&wantsPlay&&!buffer.ready&&(!started||buffer.ahead<3)){
        owned=true;waiting?.(buffer);
        if(!media.paused){expectedPause=true;media.pause();}
      }else if(buffer.ready&&!started){started=true;ready?.(buffer);}
    }
    const play=()=>{wantsPlay=true;if(owned){owned=false;started=false;}update();};
    const pause=()=>{if(expectedPause){expectedPause=false;return;}wantsPlay=false;owned=false;};
    const seek=()=>{started=false;update();};
    media.addEventListener('play',play);media.addEventListener('pause',pause);media.addEventListener('seeked',seek);media.addEventListener('ratechange',update);
    function dispose(){
      if(disposed)return;disposed=true;
      media.removeEventListener('play',play);media.removeEventListener('pause',pause);media.removeEventListener('seeked',seek);media.removeEventListener('ratechange',update);
      if(owned&&wantsPlay&&media.currentSrc===source)media.play().catch(()=>{});owned=false;
    }
    return {update,dispose,pauseByUser(){wantsPlay=false;owned=false;media.pause();},get buffering(){return owned;}};
  }
  const api={create};if(typeof module==='object'&&module.exports)module.exports=api;root.CindySubtitlePlayback=api;
})(globalThis);
