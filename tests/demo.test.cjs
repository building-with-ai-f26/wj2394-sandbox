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
    demoMode:false, places:personal, friendGuide:friend, tour:{hidden:true},
    I:{ready:place => place.inGuide}, placeDetails:place=>context.google.merge(place), queueGuideDetails(){},
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
    demoMode:true, discoverPlaces:()=>[{id:'friend-place'}], friends:{getOwner:() => ({id:'friend'})},
    friendGuide:{places:[{id:'friend-place'}]}, places:[],
    createPlanChat:input => {options=input;}, googleReady:Promise.resolve(),
    google:{prepareForPlan:async () => {lookups++;return {checked:1};}},
    venueResearch:{run:async () => ({checked:0,available:false})},
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

test('friend chat sends sourced cuisine through both stages without sending full reviews', async () => {
  const requests = [];
  const results = [];
  const input = {value:'Japanese spots?', addEventListener() {}};
  const nodes = new Map([['#occasion', input], ['#plan-messages', {append() {}}]]);
  const place = {
    id:'fixture-place', url:'https://www.google.com/maps/search/?api=1&query=Fixture',
    name:'Fixture Counter', category:'unknown', tags:[], googleCuisineTags:['japanese'],
    _google:{reviews:[{text:{text:'Fixture review must stay out of the request.'}}]}
  };
  const response = {reply:'Found a saved match.', matches:[{id:place.id,reason:'Japanese cuisine evidence.'}]};
  const context = vm.createContext({
    document:{
      querySelector:selector => nodes.get(selector) ?? {},
      createElement:() => ({remove() {}})
    },
    fetch:async (route, {body}) => {
      requests.push({route, body:JSON.parse(body)});
      const result = route.endsWith('/shortlist')
        ? {...response,matches:[{id:'outside-guide',reason:'Invalid candidate.'},...response.matches]}
        : response;
      return {ok:true, json:async () => result};
    }
  });
  vm.runInContext(fs.readFileSync('docs/prototype/chat.js','utf8'),context);
  const chat = context.createPlanChat({
    getPlaces:() => [place],
    getOwner:() => ({id:'fixture-owner'}),
    preparePlaces:async ids => {
      assert.deepEqual(Array.from(ids), [place.id]);
      place.webCuisineSources = [{value:'japanese',url:'https://example.com/menu'}];
      place.publicDetails = {cuisines:place.webCuisineSources};
      return {checked:1, requested:1};
    },
    onResults:result => results.push(result)
  });
  await chat.submit();
  assert.deepEqual(requests.map(({route}) => route), ['/api/account/plan/shortlist','/api/account/plan']);
  assert.ok(requests.every(({body}) => body.ownerId === 'fixture-owner'));
  assert.deepEqual(requests[0].body.places[0].googleCuisineTags,['japanese']);
  assert.deepEqual(requests[1].body.places[0].webCuisines,['japanese']);
  assert.deepEqual(requests[1].body.places[0].publicDetails,place.publicDetails);
  assert.ok(requests.every(({body}) => !('googleReviews' in body.places[0])));
  assert.deepEqual(results,[response]);
});
