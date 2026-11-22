const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
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
  assert.equal(automaticMatch('Other Branch',[other],saved),null);
});

const publicVenues = [
  ['decibel','Sake Bar Decibel','https://www.google.com/maps/place/Sake+Bar+Decibel'],
  ['via-carota','Via Carota','https://www.google.com/maps/place/Via+Carota'],
  ['dante','Caffè Dante','https://www.google.com/maps/place/Caffe+Dante'],
  ['devocion','Devoción Williamsburg','https://www.google.com/maps/place/Devocion'],
  ['pier-one','Brooklyn Bridge Park, Pier 1','https://www.google.com/maps/place/Brooklyn+Bridge+Park+Pier+1'],
  ['mercado','Mercado Little Spain','https://www.google.com/maps/place/Mercado+Little+Spain'],
  ['tomino','Tomiño Taberna Gallega','https://www.google.com/maps/place/Tomino+Taberna+Gallega']
].map(([id,name,url],index)=>({
  id,name,url,googlePlaceId:'ChIJfixture'+index,neighborhood:'',source:'Google Takeout CSV'
}));

function controllerFixture(places, {limit=40, photoStatus=200, detailsStatus=200, storage=new Map()}={}) {
  const nodes=new Map(), calls=[], linked=[];
  const domNode=tag=>({
    tag,children:[],attributes:{},
    append(...children) {this.children.push(...children);},
    setAttribute(name,value) {this.attributes[name]=value;}
  });
  const callsFor=route=>calls.filter(call=>call.route===route);
  let active=places;
  const fetch=async (route,options)=>{
    if(route==='/api/status') return {ok:true,json:async()=>({configured:true,requestLimit:limit,requestsUsed:0})};
    if(route.startsWith('/api/places/photo?')) {
      const source=new URL(route,'https://example.test').searchParams.get('name');
      calls.push({route:'photo',id:source.split('/')[1]});
      return {ok:photoStatus===200,status:photoStatus,headers:new Headers({'Content-Type':'image/jpeg'}),blob:async()=>new Blob(['photo'],{type:'image/jpeg'})};
    }
    const {placeId:id}=JSON.parse(options.body);
    const place=places.find(item=>item.googlePlaceId===id);
    assert.ok(place, 'lookup should use a confirmed public venue identity');
    calls.push({route:'details',id});
    if(detailsStatus!==200) return {ok:false,status:detailsStatus};
    const author={displayName:'Fixture contributor',uri:'https://www.google.com/maps/contrib/123'};
    return {ok:true,json:async()=>({
      usage:{requestLimit:limit,requestsUsed:calls.length},
      result:{id,googleMapsUri:place.url,photos:[{name:`places/${id}/photos/ref`,authorAttributions:[author]}]}
    })};
  };
  const context=vm.createContext({URL,URLSearchParams,AbortController,AbortSignal,setTimeout,clearTimeout,fetch,
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
    InnerTableImport:require('../docs/prototype/imports.js'),
    document:{
      createElement:domNode,createTextNode:text=>({textContent:text}),
      querySelector:selector=>{
        if(!nodes.has(selector)) nodes.set(selector,domNode('div'));
        return nodes.get(selector);
      }
    }
  });
  vm.runInContext(fs.readFileSync('docs/prototype/google.js','utf8'),context);
  const controller=context.GooglePlaces.createController({
    getPlaces:()=>active,onLink:(place,id)=>linked.push([place,id]),onUpdate(){}
  });
  return {controller,calls,callsFor,linked,setActive:places=>{active=places;}};
}

test('the import photo queue checks beyond the first five places when allowance is available',async()=>{
  const {controller,callsFor}=controllerFixture(publicVenues);
  await controller.start();
  await controller.enrichImported(publicVenues);
  assert.equal(callsFor('photo').length,7);
  for(const place of publicVenues) {
    assert.ok(controller.photo(place));
    controller.forget(place.id);
  }
});

test('friend-guide results get photos and link to the venue before the contributor',async()=>{
  const [mercado,tomino]=publicVenues.slice(-2).map(place=>({...place,id:'approved-friend-'+place.id}));
  const originallySaved=structuredClone([mercado,tomino]);
  const {controller,callsFor}=controllerFixture([mercado,tomino]);
  await controller.start();
  const coverage=await controller.prepareForPlan([mercado.id,tomino.id]);
  assert.equal(coverage.checked,2);
  assert.equal(callsFor('photo').length,0,'candidate lookup should leave photo requests for the actual results');
  await controller.checkShortlistPhotos([tomino.id]);
  assert.deepEqual(callsFor('photo').map(call=>call.id),[tomino.googlePlaceId]);
  assert.equal(controller.placeURL(tomino),tomino.url);
  const creditLinks=controller.photoCredit(tomino).children.filter(node=>node.tag==='a');
  assert.deepEqual(creditLinks.map(link=>link.href),[tomino.url,'https://www.google.com/maps/contrib/123']);
  const detailLinks=controller.extras(tomino).children[0].children.filter(node=>node.tag==='a');
  assert.equal(detailLinks[0].href,tomino.url);
  assert.deepEqual([mercado,tomino],originallySaved);
  controller.forget(tomino.id);
  assert.equal(controller.photo(tomino),undefined);
});

test('a later shortlist can promote an imported photo check held in reserve',async()=>{
  const places=publicVenues.slice(0,4);
  const {controller,calls}=controllerFixture(places,{limit:8});
  await controller.start();
  await controller.enrichImported(places);
  assert.equal(calls.length,4);
  assert.equal(controller.photoStatus(places[2]),'Photo check pending');
  await controller.checkShortlistPhotos([places[3].id]);
  assert.ok(controller.photo(places[3]));
  assert.equal(controller.photoStatus(places[2]),'Photo check pending');
  assert.equal(calls.length,6);
  places.forEach(place=>controller.forget(place.id));
});

test('the photo endpoint cap leaves the place pending and stops repeated fetches',async()=>{
  const place=publicVenues[0];
  const {controller,callsFor}=controllerFixture([place],{photoStatus:429});
  await controller.start();
  await controller.checkShortlistPhotos([place.id]);
  assert.equal(controller.photoStatus(place),'Photo check pending');
  assert.equal(controller.photo(place),undefined);
  await controller.checkShortlistPhotos([place.id]);
  assert.equal(callsFor('photo').length,1);
});

test('the details endpoint cap also leaves the photo check pending',async()=>{
  const place=publicVenues[0];
  const {controller,callsFor}=controllerFixture([place],{detailsStatus:429});
  await controller.start();
  await controller.checkShortlistPhotos([place.id]);
  assert.equal(controller.photoStatus(place),'Photo check pending');
  assert.equal(callsFor('photo').length,0);
});

test('a fresh request allowance resumes an import scan without starting at the first row',async()=>{
  const places=publicVenues.slice(0,4), storage=new Map();
  const first=controllerFixture(places,{limit:8,storage});
  await first.controller.start();
  await first.controller.enrichImported(places,'scan-position');
  assert.equal(storage.get('scan-position'),'2');
  const next=controllerFixture(places,{limit:8,storage});
  await next.controller.start();
  await next.controller.enrichImported(places,'scan-position');
  assert.deepEqual(next.callsFor('photo').map(call=>call.id),places.slice(2).map(place=>place.googlePlaceId));
  for(const place of places) {
    first.controller.forget(place.id);
    next.controller.forget(place.id);
  }
});
