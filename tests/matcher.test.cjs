const test = require('node:test');
const assert = require('node:assert/strict');
const places = require('../docs/prototype/data.js');
const {matchPlaces} = require('../docs/prototype/matcher.js');
test('catch-up keeps only conversation-friendly recommended restaurants', () => {
  const {matches} = matchPlaces(places,"Dinner with a friend I haven’t seen in months");
  assert.ok(matches.length > 0);
  assert.ok(matches.every(({place:p}) => p.tags.includes('conversation') && p.category === 'restaurant' && p.recommended));
});
test('fun and conversation must both match', () => {
  const {matches} = matchPlaces(places,'Somewhere fun where we can still hear each other');
  assert.deepEqual(matches.map(m => m.place.id),[2,6]);
});
test('special dinner under $100 excludes splurges and unknown prices', () => {
  const {matches,budget} = matchPlaces(places,'A special dinner under $100 each');
  assert.equal(budget,100);
  assert.deepEqual(matches.map(m => m.place.id),[1,4,5]);
});
test('strict budget boundary and narrower explicit filter are enforced', () => {
  const fixture = [{...places[0],price:75},{...places[0],id:99,price:74}];
  assert.deepEqual(matchPlaces(fixture,'under $100',{budget:75}).matches.map(m => m.place.id),[99]);
});
test('conflicting constraints produce an empty result rather than a fallback', () => {
  assert.equal(matchPlaces(places,'special dinner',{neighborhood:'Chelsea',budget:50}).matches.length,0);
});
test('recommended places of any category appear, while saved-only places stay out', () => {
  const fixture=['restaurant','cafe','bar','shop','nightclub','other','unknown'].map((category,id)=>({...places[0],id,category,recommended:true}));
  assert.equal(matchPlaces(fixture).matches.length,7);
  assert.equal(matchPlaces([{...fixture[0],recommended:false}]).matches.length,0);
});
test('explicit dinner and coffee requests respect categories without a global category restriction', () => {
  const fixture=[{...places[0],category:'restaurant'},{...places[0],id:99,category:'cafe'}];
  assert.deepEqual(matchPlaces(fixture,'dinner').matches.map(m=>m.place.id),[1]);
  assert.deepEqual(matchPlaces(fixture,'coffee').matches.map(m=>m.place.id),[99]);
});
test('unvisited recommendations with no note or neighborhood can appear without invented evidence', () => {
  const fixture = [{...places[0],recommended:true,status:'not specified',note:'',neighborhood:'',tags:[]}];
  const matches=matchPlaces(fixture).matches;
  assert.equal(matches.length,1);
  assert.ok(!matches[0].reasons.some(reason=>/visited|personal note/i.test(reason)));
  assert.equal(matchPlaces(fixture,'catch-up').matches.length,0);
  assert.equal(matchPlaces(fixture,'',{neighborhood:'Chelsea'}).matches.length,0);
  assert.equal(matchPlaces([{...fixture[0],recommended:false}]).matches.length,0);
});
test('unsupported needs and unrecognized occasions are disclosed through empty results', () => {
  for (const query of ['vegan dinner','wheelchair accessible dinner','dinner tonight','not fun','a place for stargazing']) {
    assert.equal(matchPlaces(places,query).matches.length,0,query);
  }
});
test('neighborhood in the query and dropdown both apply', () => {
  assert.deepEqual(matchPlaces(places,'fun dinner in West Village').matches.map(m => m.place.id),[6]);
  assert.equal(matchPlaces(places,'West Village',{neighborhood:'Chelsea'}).matches.length,0);
});
test('saved-list suggestions match without endorsement and exclusions override endorsement',()=>{
  const p={...places[0],inGuide:true,recommended:false,inferredTags:['conversation']};
  const matches=matchPlaces([p],'catch-up').matches;
  assert.equal(matches.length,1);assert.match(matches[0].reasons[0],/suggested/i);
  assert.equal(matchPlaces([{...p,inGuide:false,recommended:true}]).matches.length,0);
});
