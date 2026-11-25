const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function selectionFixture() {
  const controls = new Map();
  const control = selector => {
    if(!controls.has(selector)) controls.set(selector, {
      disabled: false,
      textContent: '',
      addEventListener(type, handler) { this[type] = handler; }
    });
    return controls.get(selector);
  };
  const places = [
    {id: 'first', inGuide: false, recommended: true, status: 'want to try', note: 'Personal note'},
    {id: 'second', inGuide: true, recommended: false, status: 'not specified', note: ''}
  ];
  let saves = 0;
  const context = vm.createContext({
    $: control, places, selectedPlaces: new Set(),
    document: {querySelectorAll: () => []},
    changed: () => { saves++; },
    guideMode: 'device', window: {confirm: () => true},
    google: {forget() {}}, closeEditor() {}
  });
  const source = fs.readFileSync('docs/prototype/app.js', 'utf8');
  vm.runInContext(source.slice(source.indexOf('function updateSelection()'), source.indexOf('function renderSaved()')), context);
  return {control, places, context, saves: () => saves};
}

test('select all and clear selection update controls without saving guide data', () => {
  const fixture = selectionFixture();
  fixture.control('#select-all-places').click();
  assert.equal(fixture.control('#selection-count').textContent, '2 selected');
  assert.equal(fixture.control('#select-all-places').disabled, true);
  assert.equal(fixture.control('#hide-selected-places').disabled, false);
  fixture.control('#clear-place-selection').click();
  assert.equal(fixture.control('#selection-count').textContent, '0 selected');
  assert.equal(fixture.control('#hide-selected-places').disabled, true);
  assert.equal(fixture.saves(), 0);
});

test('bulk visibility changes only selected records and preserves personal details', () => {
  const fixture = selectionFixture();
  const original = structuredClone(fixture.places);
  fixture.context.selectedPlaces.add('first');
  fixture.control('#show-selected-places').click();
  assert.deepEqual(fixture.places[0], {...original[0], inGuide: true});
  assert.deepEqual(fixture.places[1], original[1]);
  fixture.control('#hide-selected-places').click();
  assert.deepEqual(fixture.places[0], original[0]);
  assert.equal(fixture.saves(), 2);
});

test('remove selected requires confirmation and leaves other places intact', () => {
  const fixture = selectionFixture();
  fixture.context.selectedPlaces.add('first');
  fixture.context.window.confirm = () => false;
  fixture.control('#remove-selected-places').click();
  assert.equal(fixture.context.places.length, 2);
  assert.equal(fixture.saves(), 0);
  fixture.context.window.confirm = () => true;
  fixture.control('#remove-selected-places').click();
  assert.equal(fixture.context.places.length, 1);
  assert.equal(fixture.context.places[0].id, 'second');
  assert.equal(fixture.context.selectedPlaces.size, 0);
  assert.equal(fixture.saves(), 1);
});

test('shortlist share text includes venue links and excludes guide-only content', () => {
  const maps = 'https://www.google.com/maps/place/Via+Carota/';
  const context = vm.createContext({
    URL, demoMode:false,
    I:{sourceURL:value=>value?.startsWith('https://') ? value : null,categoryLabel:()=>'Restaurant'},
    google:{placeURL:place=>place.url}
  });
  const app = fs.readFileSync('docs/prototype/app.js', 'utf8');
  vm.runInContext(app.slice(app.indexOf('function reservationLink'),app.indexOf("$('#shortlist-share').addEventListener")),context);
  const venue = {name:'Via Carota',url:maps,category:'restaurant',neighborhood:'West Village',
    note:'A private guide note.', description:'Guide-only copy.', reason:'Based on a private note.'};
  assert.equal(context.formatSharedPlaces([{...venue,_google:{websiteUri:'https://example.com/menu'}}]),
    `Via Carota\nRestaurant · West Village\nGoogle Maps: ${maps}`);
  assert.equal(context.formatSharedPlaces([{...venue,_google:{websiteUri:'https://example.com/reservations/'}}]),
    `Via Carota\nRestaurant · West Village\nGoogle Maps: ${maps}\nReservations: https://example.com/reservations/`);
});
