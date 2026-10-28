import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createLearningService} from '../my-browser/learning-service.js';
const core=createRequire(import.meta.url)('../my-browser/extension/learning-core.js');

// Anonymized structure observed in a real JSON3 interview: display holds overlap,
// newline append events are presentation only, and speaker flags are explicit.
test('JSON3 speaker markers do not shift speech, deduplicate replies or turn laughter into a new speaker',()=>{
 const cues=core.youtubeSubtitles({events:[
  {tStartMs:0,dDurationMs:20000,id:1},
  {tStartMs:1000,dDurationMs:4000,segs:[{utf8:'>> I agree.',isSpeakerChange:1},{utf8:' [laughter]',tOffsetMs:800}]},
  {tStartMs:1990,dDurationMs:3000,aAppend:1,segs:[{utf8:'\n'}]},
  {tStartMs:2000,dDurationMs:4000,segs:[{utf8:'I agree.'},{utf8:' And it works.',tOffsetMs:500}]},
  {tStartMs:3500,dDurationMs:4000,segs:[{utf8:'Yes.',isSpeakerChange:1}]}
 ]});
 const words=core.subtitleWords(cues,true),turns=core.subtitleTurns(words);
 assert.equal(cues.length,3);assert.equal(words[0].text,'I');assert.equal(words[0].start,1);
 assert.equal(turns.length,2);assert.equal(turns[1].words[0].start,3.5);
 assert.equal(core.joinWords(turns[0].words),'I agree. [laughter] I agree. And it works.');
 assert.ok(words.every((w,i)=>w.end>w.start&&(!i||w.start>=words[i-1].end)));
});

test('polished clauses align to source word anchors while removed fillers retain coverage',()=>{
 const words=core.subtitleWords([{start:0,end:5,text:'Um I I think this works. And it is useful.'}],true);
 const cues=core.alignSubtitleTurn(words,[{text:'I think this works.',translation:'我觉得这可行。'},{text:'And it is useful.',translation:'而且很有用。',paragraphEnd:true}]);
 assert.equal(cues[0].start,words[0].start);assert.equal(cues[1].start,words[6].start);
 assert.equal(cues.map(c=>c.sourceText).join(' '),core.joinWords(words));
 assert.equal(cues[1].paragraphEnd,true);
 assert.throws(()=>core.alignSubtitleTurn(words,[{text:'Entirely unrelated invented speech.',translation:'捏造'}]),/SUBTITLE_COVERAGE/);
});

test('many real speaker turns stay in one model batch; a bad turn alone is repaired and good turns survive retry',async()=>{
 const words=core.subtitleWords(Array.from({length:28},(_,i)=>({start:i*2,end:i*2+1.5,text:'>> Speaker '+i+' replies.'})),true);
 const calls=[];let fail=true;
 const service=createLearningService({core,model:async r=>{const input=JSON.parse(r.prompt.split('\n').at(-1));calls.push(input);
  return {ok:true,text:JSON.stringify({turns:input.turns.filter(t=>!fail||t.id!==13).map(t=>({id:t.id,captions:[{text:t.text,translation:'回应 '+t.id}]}))})};}});
 const client=crypto.randomUUID(),request={op:'subtitles',editorial:true,words,context:'Complete conversation context.'};
 await assert.rejects(service.handle(client,request),/SUBTITLE_COVERAGE/);
 assert.equal(calls[0].turns.length,28);assert.deepEqual(calls[1].turns.map(t=>t.id),[13]);
 fail=false;const result=await service.handle(client,request);
 assert.deepEqual(calls[2].turns.map(t=>t.id),[13]);assert.equal(result.cues.length,28);
 assert.ok(result.cues.every((c,i)=>c.start===i*2&&c.end<=i*2+2));
});
