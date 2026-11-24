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
    const a = streetAddress(first), b = streetAddress(second);
    if(!/^\d+\s/.test(a) || !/^\d+\s/.test(b)) return false;
    if(a === b) return true;
    const suffix = /\s+\d{5}$/;
    return (suffix.test(a) !== suffix.test(b)) && a.replace(suffix,'') === b.replace(suffix,'');
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
    if(!result || !sameAddress(result.address, google?.formattedAddress)) return null;
    const site=host(google.websiteUri);
    const official=fact=>site && host(fact?.url)===site;
    const trustedFact=fact=>{
      const domain=host(fact?.url);
      return official(fact) || ['nyc.gov','nycgo.com','nyctourism.com'].some(name=>domain===name || domain.endsWith('.'+name));
    };
    const independentFact=fact=>{
      const label=sourceLabel(fact?.url);
      return label && !['Yelp','Reddit','google.com','maps.google.com'].includes(label);
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
    let running = false, paused = false;
    const attempts = new Map(), checkedVenues = new Map();
    const key = place=>place.id + '|' + place.url + '|' + place.name;
    function state(place) {return attempts.get(key(place)) || 'idle';}
    function eligible(place) {
      if(state(place)!=='idle') return false;
      const details=mergeGoogle(place);
      return Boolean(details._google?.formattedAddress) && root.InnerTableImport.needsEnrichment(details);
    }
    async function run() {
      if(running || paused || !available()) return;
      running = true;
      try {
        let place;
        while((place=getPlaces().find(eligible)) && !paused) {
          const id=key(place), google=mergeGoogle(place)._google;
          if(google.id && checkedVenues.has(google.id)) {
            const checked=checkedVenues.get(google.id);
            attempts.set(id,checked.evidence ? 'completed' : 'unavailable');
            if(checked.evidence && sameAddress(checked.address,google.formattedAddress)) onDetails(place,checked.evidence);
            onChange();
            continue;
          }
          attempts.set(id,'checking');
          onChange();
          try {
            const response = await fetch('/api/places/research',{
              method:'POST', headers:{'Content-Type':'application/json'},
              body:JSON.stringify({name:place.name,
                area:typeof place.neighborhood==='string' && /^[\p{L}][\p{L} .’'&-]{1,79}$/u.test(place.neighborhood) ? place.neighborhood : ''}),
              signal:AbortSignal.timeout(45_000),
            });
            if(response.status === 429 || response.status === 503) paused = true;
            if(!response.ok) {
              attempts.set(id,paused ? 'paused' : 'unavailable');
              continue;
            }
            const result=await response.json();
            const evidence=verifiedDetails(result,google);
            if(google.id) checkedVenues.set(google.id,{address:evidence ? result.address : '',evidence});
            attempts.set(id,evidence ? 'completed' : 'unavailable');
            const current = getPlaces().find(item=>key(item)===id);
            if(current && evidence && sameAddress(mergeGoogle(current)._google?.formattedAddress,google.formattedAddress)) {
              onDetails(current,evidence);
            }
          } catch {
            attempts.set(id,'unavailable');
          } finally {
            onChange();
          }
        }
      } finally {
        running = false;
      }
    }
    return {run,state};
  }
  root.InnerTableEnrichment = {createResearch, sourceLabel, verifiedDetails};
})(globalThis);
