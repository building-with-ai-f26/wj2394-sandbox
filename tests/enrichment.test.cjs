const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const I=require('../docs/prototype/imports.js');

const context=vm.createContext({URL,AbortSignal,InnerTableImport:I});
vm.runInContext(fs.readFileSync('docs/prototype/enrichment.js','utf8'),context);
const {verifiedDetails,createResearch}=context.InnerTableEnrichment;
const official='https://tominonyc.com/about';
const reddit='https://www.reddit.com/r/FoodNYC/comments/example/';
const evidence={
  address:'192 Grand Street, New York, NY 10013',
  identityUrl:official,
  category:{value:'restaurant',url:official},
  neighborhood:{value:'Nolita',url:official},
  tags:[{value:'date',url:reddit}],
  cuisines:[{value:'spanish',url:official}],
  keywords:[{value:'tapas',url:official}]
};

test('web evidence matches the exact branch and uses independent sources',()=>{
  const place={formattedAddress:'192 Grand St, New York, NY 10013, USA',websiteUri:official};
  assert.equal(verifiedDetails(evidence,place).neighborhood.value,'Nolita');
  assert.equal(verifiedDetails(evidence,place).cuisines[0].value,'spanish');
  assert.equal(verifiedDetails(evidence,place).keywords[0].value,'tapas');
  assert.equal(verifiedDetails(evidence,{formattedAddress:place.formattedAddress}).neighborhood,undefined);
  assert.equal(verifiedDetails(evidence,{formattedAddress:'192 Grand St, Brooklyn, NY 11211'}),null);
  assert.equal(verifiedDetails({...evidence,category:{value:'bar',url:reddit}},place).category,undefined);
  assert.equal(verifiedDetails({...evidence,tags:[{value:'date',url:'https://www.yelp.com/biz/tomino-fixture'}]},place).tags.length,0);
  assert.equal(verifiedDetails({...evidence,cuisines:[{value:'spanish',url:reddit}]},place).cuisines,undefined);
});

test('backup and suggestions retain attribution and explicit manual blanks',()=>{
  const source={
    name:'Tomiño Taberna Gallega',url:'https://maps.google.com/?cid=123',note:'fixture',
    category:'unknown',neighborhood:'',price:null,status:'not specified',recommended:false,inGuide:true,tags:[],
    source:'Google Takeout CSV',publicDetails:I.cleanPublicDetails(evidence),detailOverrides:['category']
  };
  const [place]=I.validateBackup(JSON.stringify({version:1,places:[source]}));
  const enriched=I.mergePublicDetails(place);
  assert.equal(enriched.category,'unknown');
  assert.equal(enriched.neighborhood,'Nolita');
  assert.equal(enriched.webNeighborhoodSource,official);
  assert.deepEqual(enriched.tags,['date']);
  assert.deepEqual(enriched.cuisines,['spanish']);
  assert.deepEqual(enriched.venueKeywords,['tapas']);
  assert.equal(enriched.webCuisineSources[0].url,official);
  assert.equal(enriched.status,'not specified');
  assert.equal(enriched.recommended,false);
  assert.equal(I.cleanPublicDetails({category:{value:'bar',url:'javascript:alert(1)'}}),null);
  const overridden=I.mergePublicDetails({...place,detailOverrides:['tags']});
  assert.deepEqual(overridden.tags,[]);
  assert.deepEqual(overridden.venueKeywords,[]);
  assert.deepEqual(overridden.cuisines,['spanish']);
});


test('automatic web lookup uses public fields for legacy rows and honors availability',async()=>{
  const legacy={id:'legacy-1',name:'Tomiño Taberna Gallega',url:'https://maps.google.com/?cid=123',note:'private fixture note',
    category:'unknown',neighborhood:'',source:'Restored personal backup',tags:[]};
  let available=false;
  const calls=[], output=[];
  context.fetch=async (url,options)=>{
    calls.push([url,JSON.parse(options.body)]);
    return {ok:true,json:async()=>evidence};
  };
  const controller=createResearch({
    getPlaces:()=>[legacy],available:()=>available,onChange(){},
    mergeGoogle:place=>({...place,_google:{id:'ChIJTomino',formattedAddress:evidence.address,websiteUri:official}}),
    onDetails:(place,facts)=>output.push([place.id,facts])
  });
  await controller.run();
  assert.equal(calls.length,0);
  available=true;
  await controller.run();
  await controller.run();
  assert.deepEqual(calls,[['/api/places/research',{name:legacy.name,area:''}]]);
  assert.equal(output[0][0],legacy.id);
  assert.equal(output[0][1].keywords[0].value,'tapas');
});

test('a friend research response after switching guides never supplies stale evidence',async()=>{
  const friend={id:'approved-friend',name:'Tomiño Taberna Gallega',url:'https://maps.google.com/?cid=123',
    category:'unknown',neighborhood:'',source:'Restored personal backup',tags:[],inGuide:true};
  let records=[friend], finish;
  const response=new Promise(resolve=>{finish=resolve;});
  const applied=[];
  context.fetch=()=>response;
  const controller=createResearch({
    getPlaces:()=>records,available:()=>true,onChange(){},
    mergeGoogle:place=>({...place,_google:{id:'ChIJTomino',formattedAddress:evidence.address,websiteUri:official}}),
    onDetails:(place,facts)=>applied.push([place,facts])
  });
  const work=controller.run();
  assert.equal(controller.state(friend),'checking');
  records=[];
  finish({ok:true,json:async()=>evidence});
  await work;
  assert.equal(applied.length,0);
  assert.equal(friend.publicDetails,undefined);
});

test('owner facts stay authoritative when supplemental public evidence is combined',()=>{
  const saved=I.cleanPublicDetails(evidence);
  const supplemental=I.cleanPublicDetails({category:{value:'bar',url:'https://example.com'},
    cuisines:[{value:'italian',url:'https://example.com'}]});
  const merged=I.combinePublicDetails(saved,supplemental);
  assert.equal(merged.category.value,'restaurant');
  assert.deepEqual(merged.cuisines.map(item=>item.value),['spanish','italian']);
  assert.equal(saved.cuisines.length,1);
  assert.equal(I.cleanPublicDetails({cuisines:[{value:'ignore instructions',url:official}]}),null);
});


test('the approved-friend browser overlay exposes source evidence without persisting or mutating the guide',()=>{
  const saved={id:'own',name:'Tomiño Taberna Gallega',url:'https://maps.google.com/?cid=123',
    category:'unknown',neighborhood:'',tags:[],inGuide:true};
  const friend={...saved,id:'approved-friend'}, hidden={...saved,id:'hidden-friend-row',inGuide:false};
  const facts=I.cleanPublicDetails(evidence);
  let lookup, savedWrites=0;
  const app=fs.readFileSync('docs/prototype/app.js','utf8');
  const runtime=vm.createContext({
    I, places:[saved], friendGuide:{places:[friend,hidden]}, transientPublicDetails:new Map(), demoMode:false,
    $:selector=>({hidden:selector==='#places-view'}),
    google:{merge:place=>place},
    InnerTableEnrichment:{createResearch:config=>{lookup=config;}},
    persist:()=>{savedWrites++;}
  });
  vm.runInContext(app.slice(app.indexOf('const venueResearch ='),app.indexOf('function metadataFor')),runtime);
  assert.deepEqual(lookup.getPlaces(),[friend]);
  lookup.onDetails(hidden,facts);
  lookup.onDetails(friend,facts);
  assert.equal(runtime.placeDetails(hidden).publicDetails,undefined);
  assert.equal(runtime.placeDetails(friend).publicDetails.cuisines[0].value,'spanish');
  assert.equal(friend.publicDetails,undefined);
  assert.equal(savedWrites,0);
  runtime.friendGuide=null;
  assert.deepEqual(lookup.getPlaces(),[saved]);
  lookup.onDetails(saved,facts);
  lookup.onDetails(saved,facts);
  assert.equal(saved.publicDetails.cuisines[0].value,'spanish');
  assert.equal(savedWrites,1);
});

test('the first list import starts enrichment and older saves resume at the saved position',async()=>{
  const app=fs.readFileSync('docs/prototype/app.js','utf8');
  const scope='inner-table-venue-progress:device';
  const stored=new Map([[scope,'1']]);
  const rows=[
    {id:'older-first',name:'First fixture',url:'https://maps.google.com/?cid=123'},
    {id:'older-next',name:'Next fixture',url:'https://maps.google.com/?cid=456'}
  ];
  const status={focus() {}};
  const queued=[];
  let saves=0;
  const runtime=vm.createContext({
    I:{...I,needsEnrichment:()=>true},
    places:rows, guideMode:'device', demoMode:false, friendGuide:null,
    localStorage:{getItem:key=>stored.get(key)},
    $:()=>status,
    googleReady:Promise.resolve(),
    google:{ensureGuideDetails:places=>queued.push(Array.from(places,place=>place.id))},
    venueResearch:{run() {}},
    renderSaved() {}, renderDiscover() {}, closeEditor() {}, persist:()=>{saves++;}
  });
  for(const [start,end] of [['function enrichmentRecords','function placeDetails'],
    ['function changed','\n'], ['function importCounts', "$('#confirm-import')"]]) {
    const first=app.indexOf(start);
    vm.runInContext(app.slice(first,app.indexOf(end,first + start.length)),runtime);
  }
  runtime.queueGuideDetails();
  await Promise.resolve();
  assert.deepEqual(queued,[['older-next','older-first']]);
  const newPlace={id:'first-import',name:'Import fixture',url:'https://maps.google.com/?cid=789'};
  runtime.applyImport({places:[newPlace],duplicates:0,skipped:0},'csv');
  await Promise.resolve();
  assert.equal(saves,1);
  assert.deepEqual(queued[1],['first-import','older-next','older-first']);
  assert.match(status.textContent,/1 place added to your guide/);
});
