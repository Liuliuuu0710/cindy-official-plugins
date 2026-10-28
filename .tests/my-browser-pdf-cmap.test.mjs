import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCMapTar} from '../my-browser/extension/pdf-cmap-bundle.js';

function tarEntry(name, content) {
  const data=Buffer.from(content);
  const header=Buffer.alloc(512);
  header.write(name,0,100,'utf8');
  header.write(data.length.toString(8).padStart(11,'0')+'\0',124,12,'ascii');
  header[156]=48;
  const padded=Buffer.alloc(Math.ceil(data.length/512)*512);
  data.copy(padded);
  return Buffer.concat([header,padded]);
}

test('PDF CMap bundle exposes every selected map by basename',()=>{
  const archive=Buffer.concat([
    tarEntry('package/cmaps/78-EUC-H.bcmap','legacy'),
    tarEntry('package/cmaps/WP-Symbol.bcmap','symbol'),
    Buffer.alloc(1024)
  ]);
  const maps=parseCMapTar(archive);
  assert.equal(maps.size,2);
  assert.equal(new TextDecoder().decode(maps.get('78-EUC-H.bcmap')),'legacy');
  assert.equal(new TextDecoder().decode(maps.get('WP-Symbol.bcmap')),'symbol');
});

test('PDF CMap bundle ignores unrelated archive members',()=>{
  const archive=Buffer.concat([
    tarEntry('package/README.md','ignored'),
    tarEntry('package/cmaps/90ms-RKSJ-H.bcmap','map'),
    Buffer.alloc(1024)
  ]);
  assert.deepEqual([...parseCMapTar(archive).keys()],['90ms-RKSJ-H.bcmap']);
});
