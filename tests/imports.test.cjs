const test = require('node:test');
const assert = require('node:assert/strict');
const {mapsURL,parseCSV,importCSV,ready,validateBackup} = require('../docs/prototype/imports.js');
const url = 'https://www.google.com/maps/place/Example';
test('quoted commas, escaped quotes, multiline notes and BOM are preserved',()=>{
  const csv='\uFEFFTitle,Note,URL\r\n"Example, NYC","Say ""hello""\nand linger",'+url;
  const {places}=importCSV(csv);
  assert.equal(places[0].name,'Example, NYC');assert.equal(places[0].note,'Say "hello"\nand linger');
});
test('Google schema header after description is recognized; other saved links are skipped',()=>{
  const result=importCSV('My favorite spots\n\ntitle,note,item_content_url,tags\nExample,Nice,'+url+',date\nBook,Read,https://example.com,');
  assert.equal(result.places.length,1);assert.equal(result.skipped,1);
  assert.equal(result.places[0].category,'unknown');assert.equal(result.places[0].recommended,false);
  assert.equal(ready(result.places[0]),true);assert.deepEqual(result.places[0].tags,['date']);
  assert.deepEqual(result.places[0].inferredTags,['date']);
});
test('duplicate links within CSV and existing places are skipped without overwriting notes',()=>{
  const result=importCSV('Title,URL,Note\nExample,'+url+',New note\nOther,'+url+',Again',[{url,note:'Original'}]);
  assert.equal(result.duplicates,2);assert.equal(result.places.length,0);
});
test('only known HTTPS Google Maps URL hosts and paths are allowed',()=>{
  for(const value of ['javascript:alert(1)','https://google.com.evil.test/maps/x','https://example.com','http://maps.google.com/a','https://www.google.com/search?q=x','https://user:pass@maps.google.com/x']) assert.equal(mapsURL(value),null,value);
  for(const value of [url,'https://maps.app.goo.gl/abc','https://goo.gl/maps/abc','https://maps.google.com/?q=NYC']) assert.ok(mapsURL(value),value);
});
test('malformed CSV, unsupported headers and oversized input produce actionable errors',()=>{
  for(const text of ['Title,URL\n"Broken,'+url,'foo,bar\na,b','x'.repeat(2_000_001)]) assert.throws(()=>importCSV(text));
  assert.throws(()=>parseCSV('Title,URL\n"Name"oops,'+url));
});
test('recommendations allow optional visit status, note, and neighborhood',()=>{
  for (const status of ['been there','want to try','not specified']) {
    assert.equal(ready({recommended:true,category:'restaurant',status,note:'',neighborhood:''}),true,status);
  }
  assert.equal(ready({recommended:false,category:'restaurant'}),false);
  for (const category of ['restaurant','cafe','bar','shop','nightclub','other','unknown']) {
    assert.equal(ready({recommended:true,category}),true,category);
  }
});
test('new imports leave visit status unspecified and backups preserve that choice',()=>{
  const place=importCSV('Title,URL\nExample,'+url).places[0];
  assert.equal(place.status,'not specified');
  const restored=validateBackup(JSON.stringify({version:1,places:[{...place,category:'restaurant',recommended:true}]}));
  assert.equal(restored[0].status,'not specified');
  assert.equal(ready(restored[0]),true);
});
test('backup validates all records before restoring and round-trips notes and tags',()=>{
  const p=importCSV('Title,URL,Note\nExample,'+url+',Good')["places"][0];
  Object.assign(p,{category:'restaurant',status:'been there',recommended:true,neighborhood:'Chelsea',tags:['special'],price:90});
  const restored=validateBackup(JSON.stringify({version:1,places:[p]}));
  assert.equal(restored[0].note,'Good');assert.equal(ready(restored[0]),true);assert.deepEqual(restored[0].tags,['special']);
  assert.throws(()=>validateBackup(JSON.stringify({version:1,places:[p,{...p,url:'javascript:alert(1)'}]})));
  assert.throws(()=>validateBackup(JSON.stringify({version:2,places:[p]})));
});
test('imports enter the guide automatically without endorsement; visibility can change later',()=>{
  const p=importCSV('Title,URL\nExample,'+url).places[0];
  assert.equal(p.inGuide,true);assert.equal(p.recommended,false);assert.equal(ready(p),true);
  assert.equal(ready({...p,inGuide:false}),false);
  assert.equal(ready({...p,inGuide:false,recommended:true}),false);
  const restored=validateBackup(JSON.stringify({version:1,places:[{...p,inGuide:false}]}))[0];
  assert.equal(restored.inGuide,false);
});
test('suggested tags use notes and list names, disclose inference, and avoid negative claims',()=>{
  const p=importCSV('Title,Note,URL\nExample,Quiet catch-up,'+url,[],'Date night.csv').places[0];
  assert.deepEqual(p.tags,['conversation','date']);assert.deepEqual(p.inferredTags,p.tags);
  assert.equal(p.listName,'Date night');assert.equal(p.price,null);assert.equal(p.category,'unknown');
  const negative=importCSV('Title,Note,URL\nExample,"Not quiet and not fun",'+url).places[0];
  assert.deepEqual(negative.tags,[]);
  const restored=validateBackup(JSON.stringify({version:1,places:[p]}))[0];
  assert.deepEqual(restored.inferredTags,p.tags);assert.equal(restored.listName,p.listName);
});
