import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createLearningService} from '../my-browser/learning-service.js';
const core=createRequire(import.meta.url)('../my-browser/extension/learning-core.js');

test('full JSON3 transcript retains word offsets instead of just event timing',()=>{
 const raw=core.youtubeSubtitles({events:[{tStartMs:1000,dDurationMs:3000,segs:[{utf8:'I '},{utf8:'think ',tOffsetMs:200},{utf8:'you understand.',tOffsetMs:1000}]}]});
 const words=core.subtitleWords(raw);assert.equal(words[1].start,1.2);assert.equal(words[2].start,2);assert.equal(core.joinWords(words),'I think you understand.');
});
test('rolling-caption prefixes are deduplicated but spoken repetitions are preserved',()=>{
 const words=core.subtitleWords([{start:0,end:3,text:'hello world'},{start:2,end:5,text:'hello world again'},{start:6,end:8,text:'hello world again'}]);
 assert.equal(core.joinWords(words),'hello world again hello world again');
 assert.ok(words.every((w,i)=>w.end>w.start&&(!i||w.start>=words[i-1].end)));
});
test('semantic groups cross original cue cuts and create nonoverlapping readable durations',()=>{
 const words=core.subtitleWords([{start:0,end:.5,text:'and I think'},{start:.5,end:1.4,text:'you can relate'},{start:1.4,end:2.2,text:'to this,'},{start:3.5,end:4.5,text:'I agree.'}]);
 const split=words.findIndex(w=>w.start>=3.5);
 const cues=core.subtitleSegments(words,[{end:split-1,translation:'而且我觉得你也能对此产生共鸣，'},{end:words.length-1,translation:'我同意。'}]);
 assert.equal(cues.length,2);assert.equal(cues[0].text,'and I think you can relate to this,');assert.equal(cues[0].start,0);assert.ok(cues[0].end>2.2&&cues[0].end<=3.5);
 assert.throws(()=>core.subtitleSegments(words,[{end:words.length-1,translation:'不能跨停顿合并'}]),/SUBTITLE_PAUSE/);
});
test('long unpunctuated transcripts retain every word across bounded context windows',()=>{
 const raw=Array.from({length:500},(_,i)=>({start:i*.4,end:(i+1)*.4,text:'word'+i})),words=core.subtitleWords(raw),chunks=core.subtitleChunks(words);
 assert.equal(chunks.flatMap(c=>c.words).length,500);assert.ok(chunks.every(c=>c.words.length<=180));
 assert.equal(chunks[0].nextStart,chunks[1].words[0].start);
});
test('CJK does not gain spaces, and grouping cannot skip words or exceed duration limits',()=>{
 const words=core.subtitleWords([{start:0,end:3,text:'这是一个完整的句子。接着说。'}]);assert.equal(core.joinWords(words),'这是一个完整的句子。接着说。');
 assert.throws(()=>core.subtitleSegments(words,[{end:2,translation:'漏字'}]),/SUBTITLE_COVERAGE/);
 const long=core.subtitleWords([{start:0,end:20,text:'one two three four five'}]);assert.throws(()=>core.subtitleSegments(long,[{end:4,translation:'太长'}]),/SUBTITLE_DURATION/);
});
test('subtitle model grouping is validated, repaired once, cached and cancelled',async()=>{
 const words=core.subtitleWords([{start:0,end:2,text:'one complete sentence'}]);let calls=0;
 const s=createLearningService({core,model:async r=>{calls++;assert.match(r.prompt,/Do not return text rewrites or invented timestamps/);return {ok:true,text:JSON.stringify({segments:[{end:calls===1?0:2,translation:'一个完整句子'}]})};}});
 const client=crypto.randomUUID(),req={op:'subtitles',words,context:'full nearby transcript'};
 const result=await s.handle(client,req);assert.equal(calls,2);assert.equal(result.cues[0].text,'one complete sentence');
 assert.equal((await s.handle(client,req)).cached,true);assert.equal(calls,2);
 await assert.rejects(s.handle(client,req,async()=>false),/REQUEST_CANCELLED/);
 assert.throws(()=>core.validate({...req,words:[{text:'bad',start:2,end:1}]}),/INVALID_TIME/);
});

 test('speaker changes remain separate and long held captions cannot block the transcript',()=>{
  const words=core.subtitleWords([{start:0,end:1,text:'Hello.'},{start:1,end:2,text:'>> Hi.'}]);
  assert.throws(()=>core.subtitleSegments(words,[{end:words.length-1,translation:'跨说话人'}]),/SUBTITLE_PAUSE/);
  const held=core.subtitleWords([{start:3,end:30,text:'[Music]'}]);
  const cue=core.subtitleSegments(held,[{end:0,translation:'[音乐]'}])[0];
  assert.equal(cue.text,'[Music]');assert.ok(cue.end-cue.start<=8.5);
 });

test('a short subtitle recovers from valid JSON with invalid grouping using direct translation',async()=>{
 const words=core.subtitleWords([{start:0,end:2,text:'A complete thought.'}]);const calls=[];
 const s=createLearningService({core,model:async r=>{calls.push(r);return {ok:true,text:r.expectJson?'{"segments":[{"end":99,"translation":"错误编号"}]}':'一个完整的想法。'};}});
 const result=await s.handle(crypto.randomUUID(),{op:'subtitles',words});
 assert.equal(result.cues[0].translation,'一个完整的想法。');assert.equal(calls.length,3);
 assert.match(calls[1].prompt,/SUBTITLE_COVERAGE/);assert.equal(calls[2].expectJson,false);
});
test('layout errors are precise and splitting preserves full source coverage and boundaries',async()=>{
 const words=core.subtitleWords([{start:0,end:2,text:'First complete sentence.'},{start:3,end:5,text:'Second complete sentence.'}]);let calls=0;
 const s=createLearningService({core,model:async()=>{calls++;return {ok:true,text:JSON.stringify({segments:[{end:words.length-1,translation:'越过了停顿'}]})};}});
 await assert.rejects(s.handle(crypto.randomUUID(),{op:'subtitles',words}),/SUBTITLE_PAUSE/);assert.equal(calls,1);
 const parts=core.splitSubtitleChunk({start:40,end:40+words.length,words,nextStart:6});
 assert.deepEqual(parts.flatMap(p=>p.words),words);assert.equal(parts[0].start,40);assert.equal(parts[0].nextStart,parts[1].words[0].start);assert.equal(parts[1].nextStart,6);assert.equal(parts[1].end,40+words.length);
 assert.throws(()=>core.subtitleSegments(words.slice(0,3),[{end:2,translation:'译'.repeat(111)}]),/SUBTITLE_LENGTH/);
});
test('unreadable direct translation is not cached, and cancellation prevents fallback',async()=>{
 const words=core.subtitleWords([{start:0,end:2,text:'Hello'}]);let calls=0;
 const s=createLearningService({core,model:async()=>{calls++;return {ok:true,text:'{"segments":[]}'};}});
 await assert.rejects(s.handle(crypto.randomUUID(),{op:'subtitles',words}),/SUBTITLE_TRANSLATION/);assert.equal(calls,3);
 calls=0;await assert.rejects(s.handle(crypto.randomUUID(),{op:'subtitles',words},async()=>calls<2),/REQUEST_CANCELLED/);assert.equal(calls,2);
});

test('direct translation preserves bracketed sound captions as text',async()=>{
 const words=core.subtitleWords([{start:0,end:2,text:'[Music]'}]);
 const s=createLearningService({core,model:async r=>({ok:true,text:r.expectJson?'{"segments":[]}':'[音乐]'})});
 assert.equal((await s.handle(crypto.randomUUID(),{op:'subtitles',words})).cues[0].translation,'[音乐]');
});
