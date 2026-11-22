const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function demoFixture() {
  const controls = new Map();
  const source = fs.readFileSync('docs/prototype/app.js', 'utf8');
  const personal = [{id:'private-place', inGuide:true}];
  const friend = {places:[{id:'friend-place', inGuide:true}]};
  let resets = 0, merges = 0, focused = null;
  const context = vm.createContext({
    URL,
    demoMode:false, places:personal, friendGuide:friend,
    I:{ready:place => place.inGuide},
    google:{merge:place => {merges++;return place;}},
    planChat:{reset:() => {resets++;}}, renderDiscover() {},
    $:selector => ({addEventListener:(_,handler) => controls.set(selector,handler),focus:() => {focused = selector;}})
  });
  vm.runInContext(fs.readFileSync('docs/prototype/demo.js','utf8'), context);
  vm.runInContext(source.slice(source.indexOf('function discoverPlaces()'),source.indexOf('let planResults')),context);
  return {context,personal,friend,controls,resets:() => resets,merges:() => merges,focused:() => focused};
}

test('sample mode leaves personal and approved-friend guides intact and resets chat on both switches', () => {
  const fixture = demoFixture();
  assert.equal(fixture.context.discoverPlaces()[0].id,'friend-place');
  fixture.controls.get('#try-demo')();
  assert.equal(fixture.focused(),'#shortlist-heading');
  const samples = fixture.context.discoverPlaces();
  assert.deepEqual(Array.from(samples, place => place.name), [
    'Via Carota', 'Caffè Dante', 'Devoción Williamsburg', 'Brooklyn Bridge Park, Pier 1'
  ]);
  assert.ok(samples.every(place => !place.recommended && place.status === 'not specified' && place.price === null && !place.note));
  assert.ok(samples.every(place => place.website.startsWith('https://') && new URL(place.url).searchParams.get('query').startsWith(place.name)));
  assert.equal(samples.filter(place => place.photo).length,3);
  for(const {photo} of samples.filter(place => place.photo)) {
    assert.ok(fs.existsSync('docs/prototype/artwork/' + photo.file));
    assert.ok(photo.author && photo.source.startsWith('https://') && photo.licenseURL.startsWith('https://'));
  }
  assert.equal(fixture.merges(),1);
  assert.equal(fixture.context.places,fixture.personal);
  assert.equal(fixture.context.friendGuide,fixture.friend);
  fixture.controls.get('#leave-demo')();
  assert.equal(fixture.context.discoverPlaces()[0].id,'friend-place');
  fixture.context.friendGuide = null;
  assert.equal(fixture.context.discoverPlaces()[0].id,'private-place');
  assert.equal(fixture.resets(),2);
});

test('sample plans bypass Google lookup and friend-guide API ownership', async () => {
  const source = fs.readFileSync('docs/prototype/app.js','utf8');
  let options, lookups=0;
  const context = vm.createContext({
    demoMode:true, discoverPlaces(){}, friends:{getOwner:() => ({id:'friend'})},
    createPlanChat:input => {options=input;}, googleReady:Promise.resolve(),
    google:{prepareForPlan:async () => {lookups++;return {checked:1};}},
    renderDiscover(){}, $:() => ({})
  });
  vm.runInContext(source.slice(source.indexOf('const planChat ='),source.indexOf("for(const id of ['feedback-helpful'")),context);
  assert.equal(options.getOwner(),null);
  assert.equal((await options.preparePlaces(['demo-1'])).sample,true);
  assert.equal(lookups,0);
  context.demoMode=false;
  assert.equal(options.getOwner().id,'friend');
  await options.preparePlaces(['friend-place']);
  assert.equal(lookups,1);
});
