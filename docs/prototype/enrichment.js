(function (root) {
  function streetAddress(value) {
    return typeof value === 'string' ? value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
      .replace(/\b(?:united states|usa)\b/g,'')
      .replace(/\bnew york city\b/g,'new york')
      .replace(/\b(?:street|avenue|road|east|west|north|south|place|boulevard)\b/g,
        word=>({street:'st',avenue:'ave',road:'rd',east:'e',west:'w',north:'n',south:'s',place:'pl',boulevard:'blvd'})[word])
      .replace(/[^a-z0-9]+/g,' ').trim() : '';
  }
  function sameAddress(first, second) {
    function comparable(value) {
      const text=streetAddress(value);
      const zip=/\s(\d{5})(?:\s\d{4})?$/.exec(text);
      const stem=zip ? text.slice(0,zip.index) : text;
      return {street:stem.replace(/\sny$/,''),zip:zip?.[1] || ''};
    }
    const a=comparable(first), b=comparable(second);
    return /^\d+\s/.test(a.street) && a.street===b.street && (!a.zip || !b.zip || a.zip===b.zip);
  }
  function host(value) {
    const url = root.InnerTableImport.sourceURL(value);
    return url ? new URL(url).hostname.replace(/^www\./,'') : '';
  }
  function sourceLabel(url) {
    const domain = host(url);
    if(domain === 'yelp.com' || domain.endsWith('.yelp.com')) return 'Yelp';
    if(domain === 'reddit.com' || domain.endsWith('.reddit.com')) return 'Reddit';
    return domain;
  }
  function verifiedDetails(result, google) {
    if(!result || !/^\d+\s/.test(streetAddress(result.address))) return null;
    const expected=google?.formattedAddress;
    const identityUrls=(Array.isArray(result.identityUrls) ? result.identityUrls : [])
      .map(root.InnerTableImport.sourceURL).filter(Boolean);
    if(expected ? !sameAddress(result.address,expected)
      : result.identityVerified!==true || new Set(identityUrls.map(host)).size<2) return null;
    const site=host(google?.websiteUri);
    const official=fact=>site && host(fact?.url)===site;
    const independentFact=fact=>{
      const label=sourceLabel(fact?.url);
      return label && !['Yelp','Reddit','google.com','maps.google.com','maps.app.goo.gl'].includes(label);
    };
    const trustedFact=fact=>{
      const domain=host(fact?.url);
      return official(fact) || ['nyc.gov','nycgo.com','nyctourism.com'].some(name=>domain===name || domain.endsWith('.'+name)) ||
        (result.identityVerified===true && independentFact(fact) && identityUrls.includes(root.InnerTableImport.sourceURL(fact.url)));
    };
    const tags=(Array.isArray(result.tags) ? result.tags : []).filter(fact=>
      independentFact(fact) || (sourceLabel(fact?.url)==='Reddit' && /^\/r\/[^/]+\/comments\//.test(new URL(fact.url).pathname)));
    return root.InnerTableImport.cleanPublicDetails({
      category:trustedFact(result.category) ? result.category : undefined,
      neighborhood:trustedFact(result.neighborhood) ? result.neighborhood : undefined,
      tags,
      cuisines:(Array.isArray(result.cuisines) ? result.cuisines : []).filter(independentFact),
      keywords:(Array.isArray(result.keywords) ? result.keywords : []).filter(independentFact),
    });
  }
  function createResearch({getPlaces, mergeGoogle, available, onChange, onDetails}) {
    let running=false, paused=false, automatic=false, dayResetAt=Infinity;
    const attempts=new Map(), checkedVenues=new Map(), waiting=new Set();
    const key=place=>place.id + '|' + place.url + '|' + place.name;
    function state(place) {return attempts.get(key(place)) || 'idle';}
    function eligible(place,prioritized=false) {
      return state(place)==='idle' && (prioritized || root.InnerTableImport.needsEnrichment(mergeGoogle(place)));
    }
    function settle() {
      const places=new Map(getPlaces().map(place=>[key(place),place]));
      for(const request of waiting) {
        const active=request.keys.map(id=>places.get(id)).filter(Boolean);
        if(!paused && available() && active.some(place=>state(place)==='checking' || eligible(place,true))) continue;
        waiting.delete(request);
        request.finish({checked:active.filter(place=>state(place)==='completed').length,
          requested:request.keys.length,available:available()});
      }
    }
    function nextPlace() {
      const places=getPlaces();
      const byKey=new Map(places.map(place=>[key(place),place]));
      for(const request of waiting) {
        for(const id of request.keys) {
          const place=byKey.get(id);
          if(place && eligible(place,true)) return place;
        }
      }
      return automatic ? places.find(place=>eligible(place)) : null;
    }
    async function check(place) {
      const id=key(place), google=mergeGoogle(place)._google;
      const venueId=google?.id || place.googlePlaceId || root.InnerTableImport.mapsURL(place.url);
      const venueKey=venueId ? venueId + '|' + place.name.toLowerCase() : '';
      const cached=checkedVenues.get(venueKey);
      if(cached && (!google?.formattedAddress || sameAddress(cached.address,google.formattedAddress))) {
        attempts.set(id,cached.evidence ? 'completed' : 'unavailable');
        if(cached.evidence) onDetails(place,cached.evidence);
        onChange();
        return;
      }
      attempts.set(id,'checking');
      onChange();
      try {
        const area=typeof place.neighborhood==='string' && /^[\p{L}][\p{L} .’'&-]{1,79}$/u.test(place.neighborhood) ? place.neighborhood : '';
        const address=google?.formattedAddress;
        const response=await fetch('/api/places/research',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({name:place.name,area,...(address && {address})}),
          signal:AbortSignal.timeout(45_000),
        });
        if(response.status===429 || response.status===503) {
          paused=true;
          const seconds=Number(response.headers?.get('Retry-After'));
          dayResetAt=seconds>0 ? Date.now()+seconds*1000 : Infinity;
        }
        if(!response.ok) {
          attempts.set(id,paused ? 'paused' : 'unavailable');
          return;
        }
        const result=await response.json(), evidence=verifiedDetails(result,google);
        if(venueKey) checkedVenues.set(venueKey,{address:result?.address || '',evidence});
        attempts.set(id,evidence ? 'completed' : 'unavailable');
        const current=getPlaces().find(item=>key(item)===id);
        if(!current || !evidence) return;
        const currentAddress=mergeGoogle(current)._google?.formattedAddress;
        if(!currentAddress || sameAddress(result.address,currentAddress)) onDetails(current,evidence);
      } catch {
        attempts.set(id,'unavailable');
      } finally {
        onChange();
      }
    }
    async function drain() {
      if(running || paused || !available()) return;
      running=true;
      try {
        let place;
        while(!paused && available() && (place=nextPlace())) {
          await check(place);
          settle();
        }
      } finally {
        running=false;
        settle();
      }
    }
    function resume() {
      paused=false;
      dayResetAt=Infinity;
      for(const [id,status] of attempts) if(status==='paused') attempts.delete(id);
    }
    function run(ids) {
      if(paused && Date.now()>=dayResetAt) resume();
      if(!Array.isArray(ids)) {
        automatic=true;
        settle();
        return drain();
      }
      const byId=new Map(getPlaces().map(place=>[String(place.id),place]));
      const keys=[...new Set(ids.map(id=>byId.get(String(id))).filter(Boolean).map(key))];
      return new Promise(finish=>{
        waiting.add({keys,finish});
        settle();
        drain();
      });
    }
    return {run,state,resume};
  }
  root.InnerTableEnrichment = {createResearch, sourceLabel, verifiedDetails};
})(globalThis);
