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
  assert.deepEqual(calls,[['/api/places/research',{name:legacy.name,area:'',address:evidence.address}]]);
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
    places:rows, guideMode:'device', demoMode:false, friendGuide:null, enrichmentReady:true,
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


const independent={...evidence,identityVerified:true,
  identityUrls:[official,'https://www.nyctourism.com/restaurants/tomino']};

test('an independently verified branch can enrich a saved place when Google is unavailable',()=>{
  assert.equal(verifiedDetails(independent).neighborhood.value,'Nolita');
  assert.equal(verifiedDetails(independent).cuisines[0].value,'spanish');
  assert.equal(verifiedDetails(evidence),null);
  assert.equal(verifiedDetails({...independent,identityUrls:[official]}),null);
  assert.equal(verifiedDetails(independent,{formattedAddress:'192 Grand St, New York 10013-1234'}).neighborhood.value,'Nolita');
  assert.equal(verifiedDetails(independent,{formattedAddress:'192 Grand St, New York 10014'}),null);
  assert.equal(verifiedDetails(independent,{formattedAddress:'12 Grand St, Brooklyn, NY'}),null);
});

test('query-only research verifies active candidate IDs and never sends private fields',async()=>{
  const legacy={id:'legacy',name:'Tomiño Taberna Gallega',url:'https://maps.google.com/?cid=123',
    neighborhood:'Nolita',category:'unknown',source:'Restored personal backup',tags:[],note:'Private fixture note'};
  const other={...legacy,id:'not-a-target',name:'Via Carota'};
  const calls=[], applied=[];
  context.fetch=async (route,options)=>{
    calls.push([route,JSON.parse(options.body)]);
    return {ok:true,json:async()=>independent};
  };
  const controller=createResearch({
    getPlaces:()=>[legacy,other],available:()=>true,onChange(){},mergeGoogle:place=>place,
    onDetails:(place,facts)=>applied.push([place.id,facts])
  });
  const coverage=await controller.run(['outside-guide',legacy.id,legacy.id]);
  assert.deepEqual({...coverage},{checked:1,requested:1,available:true});
  assert.deepEqual(calls,[['/api/places/research',{name:legacy.name,area:'Nolita'}]]);
  assert.equal(applied[0][0],legacy.id);
  await controller.run([legacy.id]);
  assert.equal(calls.length,1);
});

test('a pending query is checked before the next automatic background venue',async()=>{
  const [first,next,selected]=['Via Carota','Devoción Williamsburg','Tomiño Taberna Gallega']
    .map((name,index)=>({id:String(index),name,category:'unknown',neighborhood:'',tags:[],
      url:'https://maps.google.com/?cid='+String(index+1)}));
  const calls=[];
  let unblock;
  const block=new Promise(resolve=>{unblock=resolve;});
  context.fetch=async (route,options)=>{
    const {name}=JSON.parse(options.body);
    calls.push(name);
    if(name===first.name) await block;
    return {ok:true,json:async()=>name===selected.name ? independent : {}};
  };
  const controller=createResearch({
    getPlaces:()=>[first,next,selected],available:()=>true,mergeGoogle:place=>place,onChange(){},onDetails(){}
  });
  const background=controller.run();
  const prioritized=controller.run([selected.id]);
  unblock();
  assert.equal((await prioritized).checked,1);
  await background;
  assert.deepEqual(calls,[first.name,selected.name,next.name]);
});

test('Why it fits shows safe distinct cited source links',()=>{
  const app=fs.readFileSync('docs/prototype/app.js','utf8');
  const entries=[];
  const runtime=vm.createContext({
    I,externalLink:(label,url)=>({label,url}), element:()=>({append(link){this.link=link;}})
  });
  vm.runInContext(app.slice(app.indexOf('function appendMatchSources'),app.indexOf('function element(')),runtime);
  runtime.appendMatchSources({append(item){entries.push(item.link);}},[
    {label:'Official menu',url:official},{label:'Duplicate',url:official},
    {label:'Malicious URL',url:'javascript:alert(1)'}
  ]);
  assert.deepEqual(entries,[{label:'Official menu',url:official}]);
});


test('planner probes do not cross into a guide selected while providers initialize',async()=>{
  const original={places:[{id:'approved-friend'}]};
  let release, options, calls=0;
  const googleReady=new Promise(resolve=>{release=resolve;});
  const app=fs.readFileSync('docs/prototype/app.js','utf8');
  const runtime=vm.createContext({
    demoMode:false,friendGuide:original,places:[],googleReady,
    $:()=>({hidden:false}),
    discoverPlaces:()=>original.places,createPlanChat:funcs=>{options=funcs;},
    google:{prepareForPlan:async()=>{calls++;}},
    venueResearch:{run:async()=>{calls++;}}
  });
  vm.runInContext(app.slice(app.indexOf('const planChat ='),app.indexOf("for(const id of ['feedback-helpful'")),runtime);
  const research=options.preparePlaces(['approved-friend']);
  runtime.friendGuide={places:[{id:'different-friend'}]};
  release();
  const coverage=await research;
  assert.equal(coverage.checked,0);
  assert.equal(coverage.webChecked,0);
  assert.equal(calls,0);
});
