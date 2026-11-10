const test=require('node:test');
const assert=require('node:assert/strict');
const {categoryFromGoogle,mergePlace,reviewTags,placeIdFromURL,safeURL,automaticMatch}=require('../docs/prototype/google.js');
const {validateBackup}=require('../docs/prototype/imports.js');
const {matchPlaces}=require('../docs/prototype/matcher.js');
const personal={id:'test',name:'My saved place',url:'https://www.google.com/maps/place/Test',category:'unknown',status:'not specified',note:'My own note',neighborhood:'',price:null,tags:[],inferredTags:[],inGuide:true,recommended:false};
const google={id:'ChIJtest123',primaryType:'coffee_shop',primaryTypeDisplayName:{text:'Coffee shop'},types:['coffee_shop','food'],photos:[{name:'places/ChIJtest123/photos/test'}],reviews:[{text:{text:'A quiet spot for a catch-up with friends.'}}]};
test('Google type mapping uses specific primary types and leaves unsupported places unknown',()=>{
  assert.equal(categoryFromGoogle(google),'cafe');
  assert.equal(categoryFromGoogle({primaryType:'wine_bar',types:['restaurant']}),'bar');
  assert.equal(categoryFromGoogle({primaryType:'thai_restaurant'}),'restaurant');
  assert.equal(categoryFromGoogle({primaryType:'clothing_store'}),'shop');
  assert.equal(categoryFromGoogle({primaryType:'night_club'}),'nightclub');
  assert.equal(categoryFromGoogle({primaryType:'park'}),'unknown');
});
test('enrichment fills an unknown category and adds sourced hints without mutating personal fields',()=>{
  const result=mergePlace(personal,google);
  assert.equal(result.category,'cafe');assert.equal(personal.category,'unknown');
  assert.equal(result.note,personal.note);assert.equal(result.status,'not specified');assert.equal(result.recommended,false);assert.equal(result.price,null);
  assert.deepEqual(result.googleReviewTags,['conversation','group']);assert.equal(result.googleCategoryUsed,true);
  const match=matchPlaces([result],'coffee catch-up').matches;
  assert.equal(match.length,1);assert.match(match[0].reasons[0],/Google review sample/);
  assert.equal(mergePlace({...personal,category:'bar'},google).category,'bar');
});
test('review hints do not turn conflicting or negated reviews into positive claims',()=>{
  assert.deepEqual(reviewTags({reviews:[{text:{text:'quiet and fun'}},{text:{text:'loud and not fun'}}]}),[]);
  assert.deepEqual(reviewTags({}),[]);
});
test('persistent backups retain only a Google ID, stripping transient content and preserving notes',()=>{
  const merged={...mergePlace(personal,google),googlePlaceId:google.id};
  // App exports the personal record, never the merged rendering object.
  const restored=validateBackup(JSON.stringify({version:1,places:[{...personal,googlePlaceId:google.id,_google:google}]}))[0];
  assert.equal(restored.googlePlaceId,google.id);assert.equal(restored._google,undefined);assert.equal(restored.category,'unknown');assert.deepEqual(restored.tags,[]);
  assert.equal(restored.note,merged.note);
});
test('only explicit IDs from known Maps links are accepted; author URLs cannot execute code',()=>{
  assert.equal(placeIdFromURL('https://www.google.com/maps/search/?api=1&query_place_id=ChIJtest123'),'ChIJtest123');
  assert.equal(placeIdFromURL('https://example.com/?place_id=ChIJtest123'),null);
  assert.equal(placeIdFromURL('https://maps.app.goo.gl/SomeShortLink'),null);
  assert.equal(safeURL('javascript:alert(1)'),null);assert.equal(safeURL('//maps.google.com/maps/contrib/123'),'https://maps.google.com/maps/contrib/123');
});
test('unique exact NYC name can match automatically; duplicate branches and other cities require a choice',()=>{
  const exact={id:'ChIJtest1',displayName:{text:'Test Café'},formattedAddress:'New York, NY'};
  const approximate={...exact,id:'ChIJtest2',displayName:{text:'Test Cafe Express'}};
  assert.equal(automaticMatch('Test Café',[exact,approximate]),exact);
  assert.equal(automaticMatch('Test Café',[exact,{...exact,id:'ChIJbranch'}]),null);
  assert.equal(automaticMatch('Test Café',[{...exact,formattedAddress:'London, UK'}]),null);
});

test('saved Maps feature identity matches renamed venues without selecting a different branch',()=>{
  const saved='https://www.google.com/maps/place/Old+Name/data=!4m2!3m1!1s0x123:0xabc';
  const linked={id:'ChIJlinked',displayName:{text:'New Japanese Name'},googleMapsUri:'https://maps.google.com/?cid=2748'};
  const other={id:'ChIJother',displayName:{text:'Other Branch'},googleMapsUri:'https://maps.google.com/?cid=2749'};
  assert.equal(automaticMatch('Old Name',[other,linked],saved),linked);
  assert.equal(automaticMatch('Old Name',[other],saved),null);
});
