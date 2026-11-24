const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {categoryFromGoogle,mergePlace,reviewTags,placeIdFromURL,safeURL,automaticMatch}=require('../docs/prototype/google.js');
const {validateBackup}=require('../docs/prototype/imports.js');
const {matchPlaces}=require('../docs/prototype/matcher.js');

test('licensed photos attach to verified Maps identities and reject conflicting branches',()=>{
  const context = vm.createContext({
    URL,
    GooglePlaces: require('../docs/prototype/google.js'),
    InnerTableImport: require('../docs/prototype/imports.js')
  });
  for(const script of ['demo.js','venue-photos.js']) {
    vm.runInContext(fs.readFileSync('docs/prototype/'+script,'utf8'),context);
  }

  const find = context.InnerTableVenuePhotos.find;
  const mercado = {name:'Mercado Little Spain',url:'https://maps.google.com/?cid=5140990968716504887'};
  const credited = find(mercado);
  assert.equal(credited.author,'Kidfly182');
  assert.equal(credited.license,'CC BY 4.0');
  assert.ok(fs.existsSync('docs/prototype/artwork/'+credited.file));
  assert.equal(find({...mercado,url:'https://maps.app.goo.gl/fixture',googlePlaceId:'ChIJgx-LUDlZwokRN6_WQwx4WEc'}),credited);
  assert.equal(find({...mercado,url:'https://maps.google.com/?cid=999',neighborhood:'Hudson Yards'}),null);
  assert.equal(find({...mercado,url:'https://www.google.com/maps/place/Mercado+Little+Spain'}),null);
});

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
test('an explicit neighborhood is attributed and cannot override saved or cleared fields',()=>{
  const place={...personal,name:'Devoción Williamsburg'};
  const detail={primaryType:'coffee_shop',addressComponents:[
    {types:['sublocality_level_1','political'],longText:'Brooklyn'},
    {types:['neighborhood','political'],longText:'Williamsburg'}
  ]};
  const computed=mergePlace(place,detail);
  assert.equal(computed.category,'cafe');
  assert.equal(computed.neighborhood,'Williamsburg');
  assert.equal(computed.googleNeighborhoodUsed,true);
  assert.equal(place.neighborhood,'');
  const manuallyCleared=mergePlace({...place,detailOverrides:['category','neighborhood']},detail);
  assert.equal(manuallyCleared.category,'unknown');
  assert.equal(manuallyCleared.neighborhood,'');
  assert.equal(manuallyCleared.googleCategoryUsed,false);
  assert.equal(manuallyCleared.googleNeighborhoodUsed,false);
  const saved=mergePlace({...place,category:'shop',neighborhood:'Brooklyn'},detail);
  assert.equal(saved.category,'shop');
  assert.equal(saved.neighborhood,'Brooklyn');
  assert.equal(saved.googleCategoryUsed,false);
  assert.equal(saved.googleNeighborhoodUsed,false);
});

test('boroughs, missing components and conflicting neighborhoods stay unknown',()=>{
  const place={...personal,name:'Devoción Williamsburg'};
  const borough={types:['sublocality_level_1','political'],longText:'Brooklyn'};
  const first={types:['neighborhood'],longText:'Williamsburg'};
  const second={types:['neighborhood'],longText:'Greenpoint'};
  for(const addressComponents of [undefined,[borough],[borough,first,second]]) {
    const result=mergePlace(place,{primaryType:'park',addressComponents});
    assert.equal(result.neighborhood,'');
    assert.equal(result.googleNeighborhoodUsed,false);
    assert.equal(result.googleCategoryUsed,false);
  }
});

test('confirmed Google types yield explicit cuisine and venue keywords with no review inference',()=>{
  const data={primaryType:'japanese_restaurant',types:['restaurant','sushi_restaurant'],
    addressComponents:[{types:['neighborhood'],longText:'East Village'}],
    reviews:[{text:{text:'Quiet and a good place for a date.'}}]};
  const place={...personal,name:'Sake Bar Decibel'};
  const result=mergePlace(place,data);
  assert.deepEqual(result.googleCuisineTags,['japanese']);
  assert.deepEqual(result.venueKeywords,['sushi']);
  assert.equal(result.googleNeighborhood,'East Village');
  const manual=mergePlace({...place,detailOverrides:['neighborhood','tags']},data);
  assert.equal(manual.googleNeighborhood,'');
  assert.deepEqual(manual.googleCuisineTags,['japanese']);
  assert.deepEqual(manual.venueKeywords,[]);
  assert.deepEqual(mergePlace(place,{primaryType:'restaurant',reviews:[{text:{text:'Italian food'}}]}).googleCuisineTags,[]);
});

test('sushi and ramen types specify Japanese cuisine on a generic venue without overriding Korean evidence',()=>{
  const place={...personal,name:'Sake Bar Decibel'};
  for(const type of ['sushi_restaurant','ramen_restaurant']) {
    const japanese=mergePlace(place,{primaryType:'restaurant',types:['food',type]});
    assert.deepEqual(japanese.googleCuisineTags,['japanese']);
    for(const koreanType of ['korean_restaurant','korean_barbecue_restaurant']) {
      const korean=mergePlace(place,{primaryType:koreanType,types:[type]});
      assert.deepEqual(korean.googleCuisineTags,['korean']);
    }
  }
});

test('review hints do not turn conflicting or negated reviews into positive claims',()=>{
  assert.deepEqual(reviewTags({reviews:[{text:{text:'quiet and fun'}},{text:{text:'loud and not fun'}}]}),[]);
  assert.deepEqual(reviewTags({}),[]);
});
test('an explicit tag override prevents Google review suggestions from being added',()=>{
  const place={...personal,tags:['group'],detailOverrides:['tags']};
  const computed=mergePlace(place,google);
  assert.deepEqual(computed.tags,['group']);
  assert.deepEqual(computed.googleReviewTags,[]);
  assert.equal(computed.category,'cafe');
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
  id,name,url,googlePlaceId:'ChIJfixture'+index,category:'unknown',neighborhood:'',tags:[],source:'Google Takeout CSV'
}));

function controllerFixture(places, {
  limit=40, photoStatus=200, detailsStatus=200, photoStatuses=[], usageAfterRetry=0,
  reviewsEnabled=false, venueResearchConfigured=false, deferredDetails=null, searchCandidates=[], venueDetails={}
}={}) {
  const nodes=new Map(), calls=[], linked=[];
  const domNode=tag=>({
    tag,children:[],attributes:{},
    append(...children) {this.children.push(...children);},
    replaceChildren(...children) {this.children=children;},
    showModal() {this.open=true;},
    close() {this.open=false;},
    setAttribute(name,value) {this.attributes[name]=value;}
  });
  const callsFor=route=>calls.filter(call=>call.route===route);
  let active=places, statusCalls=0, updates=0;
  const fetch=async (route,options)=>{
    if(route==='/api/status') {
      const requestsUsed=statusCalls++ ? usageAfterRetry : 0;
      return {ok:true,json:async()=>({configured:true,reviewsEnabled,venueResearchConfigured,requestLimit:limit,requestsUsed})};
    }
    if(route.startsWith('/api/places/photo?')) {
      const source=new URL(route,'https://example.test').searchParams.get('name');
      calls.push({route:'photo',id:source.split('/')[1],source});
      const status=photoStatuses.shift() ?? photoStatus;
      if(status==='timeout') throw new DOMException('Timed out', 'TimeoutError');
      return {ok:status===200,status,headers:new Headers({'Content-Type':'image/jpeg'}),blob:async()=>new Blob(['photo'],{type:'image/jpeg'})};
    }
    if(route==='/api/places/search') {
      const body=JSON.parse(options.body);
      calls.push({route:'search',...body});
      return {ok:true,json:async()=>({result:{places:searchCandidates}})};
    }
    const {placeId:id,includeReviews,photosOnly,enrichmentOnly}=JSON.parse(options.body);
    const candidate=searchCandidates.find(item=>item.id===id);
    const place=places.find(item=>item.googlePlaceId===id) || candidate;
    assert.ok(place, 'lookup should use a confirmed public venue identity');
    calls.push({route:'details',id,includeReviews,photosOnly,enrichmentOnly});
    const version=callsFor('details').filter(call=>call.id===id).length;
    if(deferredDetails && version===1) await deferredDetails(id);
    if(detailsStatus!==200) return {ok:false,status:detailsStatus};
    const author={displayName:'Fixture contributor',uri:'https://www.google.com/maps/contrib/123'};
    return {ok:true,json:async()=>({
      usage:{requestLimit:limit,requestsUsed:calls.length},
      result:{id,...(photosOnly ? {} : {googleMapsUri:place.googleMapsUri || place.url,...venueDetails[id],...(enrichmentOnly ? {websiteUri:undefined} : {})}),photos:[{name:`places/${id}/photos/ref-${version}`,authorAttributions:[author]}]}
    })};
  };
  const context=vm.createContext({URL,URLSearchParams,AbortController,AbortSignal,setTimeout,clearTimeout,fetch,
    InnerTableImport:require('../docs/prototype/imports.js'),
    document:{
      createElement:domNode,createTextNode:text=>({textContent:text}),
      querySelector:selector=>{
        if(!nodes.has(selector)) nodes.set(selector,{...domNode('div'),checked:selector==='#google-reviews'});
        return nodes.get(selector);
      }
    }
  });
  vm.runInContext(fs.readFileSync('docs/prototype/google.js','utf8'),context);
  const controller=context.GooglePlaces.createController({
    getPlaces:()=>active,onLink:(place,id)=>linked.push([place,id]),onUpdate(){updates++;}
  });
  return {controller,calls,callsFor,linked,nodes,getStatusCalls:()=>statusCalls,getUpdates:()=>updates,setActive:places=>{active=places;}};
}

test('the visible photo queue checks beyond the first five places when allowance is available',async()=>{
  const {controller,callsFor}=controllerFixture(publicVenues);
  await controller.start();
  await controller.ensureSavedPhotos(publicVenues);
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
  await controller.ensureSavedPhotos(places);
  assert.equal(calls.length,4);
  assert.equal(controller.photoState(places[2].id),'retryable');
  await controller.checkShortlistPhotos([places[3].id]);
  assert.ok(controller.photo(places[3]));
  assert.equal(controller.photoState(places[2].id),'retryable');
  assert.equal(calls.length,6);
  places.forEach(place=>controller.forget(place.id));
});

test('the photo endpoint cap leaves the place pending and stops repeated fetches',async()=>{
  const place=publicVenues[0];
  const {controller,callsFor}=controllerFixture([place],{photoStatus:429});
  await controller.start();
  await controller.checkShortlistPhotos([place.id]);
  assert.equal(controller.photoState(place.id),'retryable');
  assert.equal(controller.photo(place),undefined);
  await controller.checkShortlistPhotos([place.id]);
  assert.equal(callsFor('photo').length,1);
});

test('the details endpoint cap also leaves the photo check pending',async()=>{
  const place=publicVenues[0];
  const {controller,callsFor}=controllerFixture([place],{detailsStatus:429});
  await controller.start();
  await controller.checkShortlistPhotos([place.id]);
  assert.equal(controller.photoState(place.id),'retryable');
  assert.equal(callsFor('photo').length,0);
});

test('only visible saved rows get photo checks, stopping abandoned rows and prioritizing a shortlist',async()=>{
  const [visible,abandoned,shortlisted,nextVisible]=publicVenues;
  let release;
  const firstDetails=new Promise(resolve=>{release=resolve;});
  const {controller,callsFor}=controllerFixture(publicVenues,{deferredDetails:id=>id===visible.googlePlaceId ? firstDetails : null});
  await controller.start();
  assert.equal(callsFor('details').length,0);
  const work=controller.ensureSavedPhotos([visible,abandoned]);
  controller.checkShortlistPhotos([shortlisted.id]);
  controller.ensureSavedPhotos([nextVisible]);
  release();
  await work;
  assert.deepEqual(callsFor('photo').map(call=>call.id),[shortlisted.googlePlaceId,nextVisible.googlePlaceId]);
  assert.equal(controller.photoState(abandoned.id),'idle');
});

test('an unchanged visible queue does not trigger repeated updates',async()=>{
  const tomino=publicVenues.at(-1);
  const {controller,callsFor,getUpdates}=controllerFixture([tomino],{limit:2});
  await controller.start();
  await controller.ensureSavedPhotos([tomino]);
  const lastUpdate=getUpdates();
  await controller.ensureSavedPhotos([{...tomino}]);
  assert.equal(getUpdates(),lastUpdate);
  assert.equal(callsFor('details').length,0);
  assert.equal(controller.photoState(tomino.id),'retryable');
});

test('expired photo reference refreshes once by confirmed place ID',async()=>{
  const [mercado]=publicVenues.slice(-2);
  const {controller,callsFor}=controllerFixture([mercado],{photoStatuses:[404,200]});
  await controller.start();
  await controller.checkShortlistPhotos([mercado.id]);
  assert.equal(controller.photoState(mercado.id),'ready');
  assert.deepEqual(callsFor('details').map(call=>call.id),[mercado.googlePlaceId,mercado.googlePlaceId]);
  assert.deepEqual(callsFor('photo').map(call=>call.source.split('/').at(-1)),['ref-1','ref-2']);
});

test('server photo failure or browser timeout fetches one fresh reference',async()=>{
  const tomino=publicVenues.at(-1);
  for(const status of [502,'timeout']) {
    const {controller,callsFor}=controllerFixture([tomino],{photoStatuses:[status,200]});
    await controller.start();
    await controller.checkShortlistPhotos([tomino.id]);
    assert.equal(controller.photoState(tomino.id),'ready');
    assert.equal(callsFor('details').length,2);
    assert.deepEqual(callsFor('photo').map(call=>call.source.split('/').at(-1)),['ref-1','ref-2']);
    controller.forget(tomino.id);
  }
});

test('a second expired reference stops and exposes a retry',async()=>{
  const [mercado]=publicVenues.slice(-2);
  const {controller,callsFor}=controllerFixture([mercado],{photoStatuses:[400,404,200]});
  await controller.start();
  await controller.checkShortlistPhotos([mercado.id]);
  assert.equal(controller.photoState(mercado.id),'retryable');
  await controller.checkShortlistPhotos([mercado.id]);
  assert.equal(callsFor('photo').length,2);
  await controller.retryPhoto(mercado);
  assert.equal(controller.photoState(mercado.id),'ready');
  assert.equal(callsFor('photo').length,3);
});

test('a manual photo retry rechecks temporary and exhausted allowances',async()=>{
  const tomino=publicVenues.at(-1);
  for(const usageAfterRetry of [0,8]) {
    const {controller,callsFor,getStatusCalls}=controllerFixture([tomino],{limit:8,usageAfterRetry,photoStatuses:[429,200]});
    await controller.start();
    await controller.checkShortlistPhotos([tomino.id]);
    assert.equal(controller.photoState(tomino.id),'retryable');
    assert.equal(getStatusCalls(),1);
    await controller.retryPhoto(tomino);
    assert.equal(getStatusCalls(),2);
    if(usageAfterRetry) {
      assert.equal(controller.photoState(tomino.id),'retryable');
      assert.equal(callsFor('photo').length,1);
    } else {
      assert.equal(controller.photoState(tomino.id),'ready');
      assert.equal(callsFor('photo').length,2);
    }
  }
});



test('an exact photo search supplies the venue image without redundant details',async()=>{
  const [fixture]=publicVenues.slice(-2);
  const place={...fixture,googlePlaceId:undefined};
  const candidate={id:fixture.googlePlaceId,displayName:{text:place.name},
    formattedAddress:'New York, NY',googleMapsUri:place.url,
    photos:[{name:`places/${fixture.googlePlaceId}/photos/search-ref`,
      authorAttributions:[{displayName:'Fixture contributor',uri:'https://www.google.com/maps/contrib/123'}]}]};
  const {controller,callsFor}=controllerFixture([place],{limit:4,searchCandidates:[candidate]});
  await controller.start();
  await controller.ensureSavedPhotos([place]);
  assert.equal(controller.photoState(place.id),'ready');
  assert.equal(callsFor('search')[0].includePhotos,true);
  assert.equal(callsFor('details').length,0);
  assert.equal(callsFor('photo').length,1);
  assert.equal(controller.placeURL(place),candidate.googleMapsUri);
  const creditLinks=controller.photoCredit(place).children.filter(node=>node.tag==='a');
  assert.deepEqual(creditLinks.map(link=>link.href),[place.url,'https://www.google.com/maps/contrib/123']);
});

test('photo search neither loads an ambiguous branch nor saves its place ID',async()=>{
  const original=publicVenues.at(-1), place={...original,googlePlaceId:undefined};
  const candidate={id:original.googlePlaceId,displayName:{text:place.name},
    formattedAddress:'New York, NY',photos:[{name:`places/${original.googlePlaceId}/photos/search-ref`}]};
  const {controller,callsFor,linked}=controllerFixture([place],{
    searchCandidates:[candidate,{...candidate,id:'ChIJOtherTomino',formattedAddress:'Queens, NY'}]
  });
  await controller.start();
  await controller.ensureSavedPhotos([place]);
  assert.equal(controller.photoState(place.id),'unavailable');
  assert.equal(callsFor('photo').length,0);
  assert.equal(callsFor('details').length,0);
  assert.equal(linked.length,0);
});

test('disabled reviews still allow complete planner lookup after photos-only details',async()=>{
  const tomino=publicVenues.at(-1);
  const {controller,callsFor}=controllerFixture([tomino]);
  await controller.start();
  await controller.ensureSavedPhotos([tomino]);
  assert.equal(controller.placeURL(tomino).includes('query_place_id='+tomino.googlePlaceId),true);
  assert.equal(controller.extras(tomino),null);
  assert.equal((await controller.prepareForPlan([tomino.id])).checked,1);
  assert.deepEqual(callsFor('details').map(call=>Boolean(call.photosOnly)),[true,false]);
  assert.equal(controller.placeURL(tomino),tomino.url);
  assert.ok(controller.extras(tomino));
});

test('saved photo details do not request reviews and the planner can still retrieve them',async()=>{
  const tomino=publicVenues.at(-1);
  const {controller,callsFor}=controllerFixture([tomino],{reviewsEnabled:true});
  await controller.start();
  await controller.ensureSavedPhotos([tomino]);
  await controller.prepareForPlan([tomino.id]);
  await controller.ensureSavedPhotos([tomino]);
  assert.deepEqual(callsFor('details').map(call=>Boolean(call.includeReviews)),[false,true]);
  assert.equal(callsFor('photo').length,1);
});

test('exact name fallback accepts an accent variant while rejecting ambiguity',()=>{
  const tomino={id:'ChIJTomino',displayName:{text:'Tomiño Taberna Gallega'},formattedAddress:'New York, NY'};
  const invalidEscape='https://www.google.com/maps/place/Tomino%ZZ';
  assert.equal(automaticMatch('Tomino Taberna Gallega',[tomino],invalidEscape),tomino);
  assert.equal(automaticMatch('Tomino Taberna Gallega',[tomino,{...tomino,id:'ChIJBranch'}]),null);
});


test('web research is available only when the server advertises it',async()=>{
  const {controller}=controllerFixture(publicVenues,{venueResearchConfigured:true});
  assert.equal(controller.researchAvailable(),false);
  await controller.start();
  assert.equal(controller.researchAvailable(),true);
  const unconfigured=controllerFixture(publicVenues).controller;
  await unconfigured.start();
  assert.equal(unconfigured.researchAvailable(),false);
});

test('automatic import enrichment is transient and keeps full planner details available',async()=>{
  const devocion=publicVenues.find(place=>place.id==='devocion');
  const personal={...publicVenues.at(-1),source:'Personal entry'};
  const details={primaryType:'coffee_shop',formattedAddress:'148 Grand St, Brooklyn, NY',
    websiteUri:'https://www.devocion.com/pages/new-york-coffee-shop-williamsburg-brooklyn',
    addressComponents:[{types:['neighborhood'],longText:'Williamsburg'}]};
  const {controller,callsFor,linked}=controllerFixture([devocion,personal],{
    reviewsEnabled:true,venueDetails:{[devocion.googlePlaceId]:details}
  });
  await controller.start();
  await controller.ensureImportedDetails([devocion,personal]);
  assert.equal(controller.enrichmentState(devocion),'completed');
  assert.equal(controller.enrichmentState(personal),'idle');
  assert.equal(controller.merge(devocion).neighborhood,'Williamsburg');
  assert.equal(controller.merge(devocion)._google.formattedAddress,details.formattedAddress);
  assert.equal(controller.merge(devocion)._google.websiteUri,undefined);
  assert.equal(devocion.category,'unknown');
  assert.equal(devocion.neighborhood,'');
  assert.equal(callsFor('photo').length,0);
  assert.deepEqual(linked.map(([,id])=>id),[devocion.googlePlaceId]);
  await controller.prepareForPlan([devocion.id]);
  assert.equal(controller.merge(devocion)._google.websiteUri,details.websiteUri);
  const detailsCalls=callsFor('details');
  assert.deepEqual(detailsCalls.map(call=>Boolean(call.enrichmentOnly)),[true,false]);
  assert.deepEqual(detailsCalls.map(call=>Boolean(call.includeReviews)),[false,true]);
});

test('an ambiguous imported branch reports no match without linking',async()=>{
  const place={...publicVenues.find(place=>place.id==='devocion'),name:'Devoción',googlePlaceId:undefined};
  const first={id:'ChIJDevocionBrooklyn',displayName:{text:place.name},formattedAddress:'Brooklyn, NY'};
  const second={id:'ChIJDevocionManhattan',displayName:{text:place.name},formattedAddress:'New York, NY'};
  const {controller,callsFor,linked}=controllerFixture([place],{searchCandidates:[first,second]});
  await controller.start();
  await controller.ensureImportedDetails([place]);
  await controller.ensureImportedDetails([place]);
  assert.equal(controller.enrichmentState(place),'no-match');
  assert.equal(callsFor('search').length,1);
  assert.equal(callsFor('details').length,0);
  assert.equal(linked.length,0);
});

test('new shortlist photos run ahead of the next import enrichment job',async()=>{
  const [first,second,shortlisted]=publicVenues;
  let release;
  const firstDetails=new Promise(resolve=>{release=resolve;});
  const {controller,calls}=controllerFixture(publicVenues,{
    deferredDetails:id=>id===first.googlePlaceId ? firstDetails : null
  });
  await controller.start();
  const work=controller.ensureImportedDetails([first,second]);
  assert.equal(controller.enrichmentState(first),'checking');
  assert.equal(controller.enrichmentState(second),'queued');
  controller.checkShortlistPhotos([shortlisted.id]);
  release();
  await work;
  assert.deepEqual(calls.map(call=>[call.route,call.id]),[
    ['details',first.googlePlaceId],['details',shortlisted.googlePlaceId],
    ['photo',shortlisted.googlePlaceId],['details',second.googlePlaceId]
  ]);
});

test('automatic enrichment preserves the remaining shortlist reserve',async()=>{
  const [first,second,third]=publicVenues;
  const {controller,callsFor}=controllerFixture(publicVenues,{limit:4});
  await controller.start();
  await controller.ensureImportedDetails([first,second,third]);
  assert.equal(controller.enrichmentState(first),'completed');
  assert.equal(controller.enrichmentState(second),'completed');
  assert.equal(controller.enrichmentState(third),'paused');
  assert.equal(callsFor('details').length,2);
});


test('manual rematch offers candidates and applies the selected branch without removing an override',async()=>{
  const place={...publicVenues.find(item=>item.id==='devocion'),name:'Devoción',category:'shop',
    detailOverrides:['category']};
  const brooklyn={id:place.googlePlaceId,displayName:{text:'Devoción'},formattedAddress:'Brooklyn, NY',
    googleMapsUri:'https://www.google.com/maps/search/?query_place_id='+place.googlePlaceId};
  const manhattan={id:'ChIJDevocionManhattan',displayName:{text:'Devoción Flatiron'},formattedAddress:'New York, NY',
    googleMapsUri:'https://www.google.com/maps/search/?query_place_id=ChIJDevocionManhattan'};
  const lookup=controllerFixture([place],{searchCandidates:[brooklyn,manhattan],venueDetails:{
    [brooklyn.id]:{primaryType:'coffee_shop',addressComponents:[{types:['neighborhood'],longText:'Williamsburg'}]},
    [manhattan.id]:{primaryType:'coffee_shop',addressComponents:[{types:['neighborhood'],longText:'Flatiron District'}]}
  }});
  await lookup.controller.start();
  await lookup.controller.ensureImportedDetails([place]);
  assert.equal(lookup.controller.merge(place).neighborhood,'Williamsburg');
  await lookup.controller.rematch(place);
  assert.equal(lookup.nodes.get('#google-match').open,true);
  const otherBranch=lookup.nodes.get('#google-candidates').children[1].children.at(-1);
  await otherBranch.onclick();
  assert.equal(lookup.controller.merge(place).neighborhood,'Flatiron District');
  assert.equal(lookup.controller.merge(place).category,'shop');
  assert.equal(lookup.controller.merge(place).googleCategoryUsed,false);
  assert.equal(lookup.controller.placeURL(place),manhattan.googleMapsUri);
  assert.equal(lookup.linked.at(-1)[1],manhattan.id);
});

test('selected guide enrichment includes legacy and approved visible saves supplied by the app',async()=>{
  const rows=publicVenues.slice(-2).map((place,index)=>({...place,source:index ? 'Personal entry' : 'Restored personal backup'}));
  const {controller,callsFor}=controllerFixture(rows);
  await controller.start();
  await controller.ensureGuideDetails(rows);
  assert.deepEqual(callsFor('details').map(item=>item.id),rows.map(place=>place.googlePlaceId));
  assert.equal(callsFor('photo').length,0);
  for(const place of rows) assert.equal(controller.enrichmentState(place),'completed');
});
