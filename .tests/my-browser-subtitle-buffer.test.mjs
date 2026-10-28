import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createLearningService} from '../my-browser/learning-service.js';
const require=createRequire(import.meta.url),core=require('../my-browser/extension/learning-core.js'),playback=require('../my-browser/extension/subtitle-playback.js');
class Media extends EventTarget {
 constructor(paused=false){super();this.paused=paused;this.plays=0;}
 pause(){if(this.paused)return;this.paused=true;this.dispatchEvent(new Event('pause'));}
 async play(){if(!this.paused)return;this.paused=false;this.plays++;this.dispatchEvent(new Event('play'));}
}
const chunk=(start,end,done)=>({start,end,words:[{text:'speech',start,end}],nextStart:end,done});
test('coverage measures prepared passages, includes silence and stops at the first unfinished passage',()=>{
 const chunks=[chunk(0,60,true),chunk(60,120,false),chunk(120,180,true)];
 assert.deepEqual(core.subtitleBuffer(chunks,10),{ahead:50,ready:true,complete:false});
 assert.equal(core.subtitleBuffer(chunks,35,2).ready,false);
 assert.equal(core.subtitleBuffer(chunks,55).ahead,5);
 assert.equal(core.subtitleBuffer(chunks,130).complete,true);
 chunks[0].done=false;assert.equal(core.subtitleBuffer(chunks,0).ahead,0);
});
test('playback waits for a long initial buffer, resumes owned pauses and buffers before exhaustion',()=>{
 const media=new Media();let buffer={ahead:0,ready:false};const controller=playback.create(media,{state:()=>buffer});
 controller.update();assert.equal(media.paused,true);
 media.play();assert.equal(media.paused,true,'trying play cannot run past an empty subtitle buffer');
 buffer={ahead:50,ready:true};controller.update();assert.equal(media.paused,false);
 buffer={ahead:10,ready:false};controller.update();assert.equal(media.paused,false);
 buffer={ahead:2,ready:false};controller.update();assert.equal(media.paused,true);
 controller.pauseByUser();buffer={ahead:100,ready:true};controller.update();assert.equal(media.paused,true,'explicit pause is never auto-resumed');controller.dispose();assert.equal(media.paused,true);
});
test('seeking rechecks the buffer, closing restores only playback stopped by buffering',()=>{
 const media=new Media();let buffer={ahead:80,ready:true};const controller=playback.create(media,{state:()=>buffer});controller.update();
 buffer={ahead:20,ready:false};media.dispatchEvent(new Event('seeked'));assert.equal(media.paused,true);controller.dispose();assert.equal(media.paused,false);
 const paused=new Media(true),other=playback.create(paused,{state:()=>({ahead:0,ready:false})});other.update();other.dispose();assert.equal(paused.paused,true);
});
test('incremental windows cover the transcript without translating it all upfront',()=>{
 const words=core.subtitleWords(Array.from({length:1200},(_,i)=>({start:i*.5,end:(i+1)*.5,text:'sourceword'+i})),true);
 const windows=core.subtitleChunks(words,true);assert.ok(windows.every(c=>c.words.length<=180&&c.words.at(-1).start-c.words[0].start<45));assert.deepEqual(windows.flatMap(c=>c.words),words);
 assert.doesNotThrow(()=>core.validate({op:'subtitles',editorial:true,words:windows[0].words}));
});
test('editorial captions clean source prose, retain timing anchors and join short display gaps',()=>{
 const words=core.subtitleWords([{start:0,end:1,text:'>> Um, I I agree.'},{start:1.4,end:2.4,text:'It works.'}],true);
 const split=words.findIndex(w=>w.start===1.4);
 const cues=core.subtitleSegments(words,[{end:split-1,text:'I agree.',translation:'我同意。'},{end:words.length-1,text:'It works.',translation:'这可行。',paragraphEnd:true}],undefined,true);
 assert.equal(cues[0].text,'I agree.');assert.ok(words.every(w=>w.text!=='>>'));assert.match(cues[0].sourceText,/Um, I I/);assert.equal(cues[0].end,1.4);
 assert.deepEqual(core.subtitleDocument(cues),[{text:'I agree. It works.',translation:'我同意。这可行。'}]);
});
test('document brief and editorial requests use bounded prompts and keep separate cache entries',async()=>{
 const calls=[];const service=createLearningService({core,model:async r=>{calls.push(r);assert.ok(r.prompt.length<=32768);const input=JSON.parse(r.prompt.split('\n').at(-1));if(input.transcript)return {ok:true,text:'Consistent names and argument flow.'};return {ok:true,text:JSON.stringify({turns:input.turns.map(t=>({id:t.id,captions:t.text.split(' ').map(text=>({text,translation:'译文'}))}))})};}});
 const client=crypto.randomUUID();const guide=await service.handle(client,{op:'subtitle-document',text:'Entire source transcript.'});assert.match(guide.guide,/Consistent/);
 const words=Array.from({length:360},(_,i)=>({text:'fairlylongsourceword',start:i,end:i+.5}));
 const result=await service.handle(client,{op:'subtitles',editorial:true,words,context:'context '.repeat(1000)});assert.equal(result.cues.length,360);assert.match(calls[1].prompt,/Reconstruct polished, faithful prose first/);assert.match(calls[1].prompt,/not English fragment boundaries/);
});

test('incremental scheduling skips the past and distant future, and reprioritizes after seeking',()=>{
 const chunks=Array.from({length:20},(_,i)=>chunk(i*30,(i+1)*30,false));
 assert.deepEqual(core.pendingSubtitleChunks(chunks,65).map(c=>c.start),[60,90,120,150]);
 chunks[2].done=true;chunks[3].busy=true;
 assert.deepEqual(core.pendingSubtitleChunks(chunks,65).map(c=>c.start),[120,150]);
 assert.deepEqual(core.pendingSubtitleChunks(chunks,400).map(c=>c.start),[390,420,450,480]);
 assert.equal(core.pendingSubtitleChunks(chunks,400,2).at(-1).start,570);
 assert.equal(core.subtitleBuffer([chunk(0,25,true),chunk(25,60,false)],0).ready,true);
});

test('failed subtitle preparation releases only a buffering-owned pause',()=>{
 const media=new Media();let buffer={ahead:0,ready:false};const controller=playback.create(media,{state:()=>buffer});
 controller.update();assert.equal(media.paused,true);
 buffer={blocked:true};controller.update();assert.equal(media.paused,false);assert.equal(controller.buffering,false);
 controller.update();assert.equal(media.plays,1,'a persistent failure does not repeatedly play');
 media.pause();controller.update();assert.equal(media.paused,true);controller.dispose();
 const paused=new Media(true),other=playback.create(paused,{state:()=>({blocked:true})});other.update();other.dispose();assert.equal(paused.paused,true);
});
test('transient retry backoff leaves other preparation windows available',()=>{
 const chunks=[chunk(0,30,false),chunk(30,60,false)];chunks[0].retryAt=3000;
 assert.deepEqual(core.pendingSubtitleChunks(chunks,0,1,1000),[chunks[1]]);
 assert.deepEqual(core.pendingSubtitleChunks(chunks,0,1,3000),chunks);
 chunks[1].done=true;chunks[0].error='TIMEOUT';assert.deepEqual(core.pendingSubtitleChunks(chunks,0,1,4000),[]);
});

test('progress reports completed source coverage and real stage time without counting in-flight work',()=>{
 const chunks=[chunk(0,30,true),chunk(30,60,false)];chunks[0].cache={state:'hit'};chunks[1].busy=true;chunks[1].progress={stage:'model',updatedAt:1000,attempt:2};
 let p=core.subtitlePreparation(chunks,10,43000);assert.equal(p.percent,50);assert.equal(p.stage,'model');assert.equal(p.elapsed,42);assert.equal(p.cached,1);assert.equal(p.saved,1);assert.equal(p.ahead,20);
 p=core.subtitlePreparation(chunks,10,58000);assert.equal(p.percent,50);assert.equal(p.elapsed,57,'time advances but completion does not');
 chunks[1].error='TIMEOUT';assert.equal(core.subtitlePreparation(chunks,40).stage,'failed');
 chunks[1].done=true;chunks[1].cache={state:'unavailable',error:'DISK_FULL'};p=core.subtitlePreparation(chunks,40);assert.equal(p.percent,100);assert.equal(p.cacheError,'DISK_FULL');
});
