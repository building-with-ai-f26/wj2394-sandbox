/* Conversation stays in memory. Guide data is submitted only when sending a plan. */
function createPlanChat({getPlaces, preparePlaces, onResults, getOwner = () => null, onAccessDenied = () => {}}) {
  const messages = [];
  let revision = 0;
  let busy = false;
  const transcript = document.querySelector('#plan-messages');
  const input = document.querySelector('#occasion');
  const send = document.querySelector('#plan-send');
  const status = document.querySelector('#plan-status');
  function guideSummary() {
    const friendGuide = Boolean(getOwner());
    return getPlaces().map(place => ({id: String(place.id), url:place.url, name: place.name, category: place.category,
      neighborhood: place.neighborhood, price: place.price, note: place.note, status: place.status,
      ...(place.website ? {publicDescription:place.description,publicWebsite:place.website} : {}),
      ...(friendGuide && place.publicDetails ? {publicDetails:place.publicDetails} : {}),
      googleAddress: place._google?.formattedAddress || '', googleCategory: place._google?.primaryTypeDisplayName?.text || '',
      googleDescription: place._google?.editorialSummary?.text || '', googlePriceRange: place._google?.priceRange || null,
      googleEvidenceURL: place._google?.googleMapsUri || '',
      googleService: Object.fromEntries(['servesLunch','servesDinner','goodForGroups','liveMusic']
        .filter(field => typeof place._google?.[field] === 'boolean').map(field => [field,place._google[field]])),
      googleNeighborhood: place.googleNeighborhood || '',
      tags: place.tags, googleReviewTags: place.googleReviewTags || [],
      savedCuisineHints: place.savedCuisineHints || [],
      savedVenueKeywords: place.savedVenueKeywords || [],
      savedOccasionHints: place.savedOccasionHints || [],
      googleCuisineTags: place.googleCuisineTags || [],
      googleVenueKeywords: place.googleVenueKeywords || [],
      webCuisines: (place.webCuisineSources || []).map(tag => tag.value),
      webVenueKeywords: (place.webKeywordSources || []).map(tag => tag.value),
      webReviewTags: (place.webReviewTags || []).map(tag => tag.value),
      webEvidence: [
        ...(place.webCategorySource ? [{label:'Category',url:place.webCategorySource}] : []),
        ...(place.webNeighborhoodSource ? [{label:'Neighborhood',url:place.webNeighborhoodSource}] : []),
        ...[...(place.webCuisineSources || []),...(place.webKeywordSources || []),...(place.webReviewTags || [])]
          .map(fact => ({label:fact.value,url:fact.url}))
      ]}));
  }
  async function request(route, body, context) {
    const owner = getOwner();
    if(owner) {route = route.replace('/api/plan','/api/account/plan');body = {...body,ownerId:owner.id};}
    const response = await fetch(route, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
    const result = await response.json();
    if(!response.ok) {
      if(context === revision && owner && (response.status === 401 || response.status === 403))onAccessDenied();
      throw new Error(result.error || 'The conversation is temporarily unavailable.');
    }
    return result;
  }
  function append(role, content) {
    const bubble = document.createElement('p');
    bubble.className = 'plan-message ' + role;
    bubble.textContent = content;
    transcript.append(bubble);
    transcript.hidden = false;
    transcript.scrollTop = transcript.scrollHeight;
    return bubble;
  }
  function reset() {
    revision++;
    messages.length = 0;
    transcript.replaceChildren();
    transcript.hidden = true;
    status.textContent = '';
    onResults(null);
  }
  async function submit() {
    const text = input.value.trim();
    if (!text || busy) return;
    if (messages.length >= 20) {
      status.textContent = 'Start a new plan to continue chatting.';
      return;
    }
    const guide = guideSummary();
    if(!guide.length) {
      status.textContent = 'This guide is empty. Add saved places or choose another guide.';
      return;
    }
    const context = revision;
    busy = true;
    send.disabled = true;
    status.textContent = '';
    const turn = {role: 'user', content: text};
    const question = append('user', text);
    const progress = append('assistant', 'Thinking through your guide…');
    input.value = '';
    try {
      const history = [...messages, turn];
      const candidates = await request('/api/plan/shortlist', {messages:history, places:guide}, context);
      if(context !== revision)return;
      const guideIds = new Set(guide.map(place => place.id));
      const ids = [...new Set(candidates.matches.map(match => match.id))].filter(id => guideIds.has(id));
      if(!ids.length) {
        const reply = 'I couldn’t find a strong lead in this saved guide for that plan. Try adding a neighborhood or changing one preference.';
        messages.push(turn,{role:'assistant',content:reply});
        progress.remove();
        append('assistant',reply);
        onResults({reply,matches:[]});
        status.textContent = 'You can refine the plan below.';
        return;
      }
      progress.textContent = 'Researching places from your guide…';
      transcript.scrollTop = transcript.scrollHeight;
      const coverage = await preparePlaces(ids);
      if(context !== revision)return;
      const details = new Map(guideSummary().map(place => [place.id, place]));
      const selected = ids.map(id => details.get(id)).filter(Boolean);
      if(!selected.length) {
        status.textContent = 'Your guide changed during the search. Try again with the current guide.';
        input.value = text;
        question.remove();
        transcript.hidden = !messages.length;
        return;
      }
      progress.textContent = 'Finding the best fit from the available details…';
      transcript.scrollTop = transcript.scrollHeight;
      const result = await request('/api/plan', {messages:history, places:selected}, context);
      if (context !== revision) return;
      messages.push(turn, {role: 'assistant', content: result.reply});
      progress.remove();
      append('assistant', result.reply);
      onResults(result);
      if(coverage.sample) status.textContent = 'Suggestions use the public details in the NYC sample guide.';
      else {
        const checks = [];
        if(coverage.checked) checks.push(`${coverage.checked} checked on Google Maps`);
        if(coverage.webChecked) checks.push(`${coverage.webChecked} checked against public venue sources`);
        status.textContent = checks.length ? checks.join(' · ') + '.' : 'Suggestions use the available details in your guide.';
      }
    } catch (error) {
      if (context !== revision) return;
      status.textContent = error instanceof SyntaxError ? 'The conversation could not reach Inner Table. Please try again shortly.' : error.message;
      input.value = text;
      // Failed turns are excluded from subsequent model history.
      question.remove();
      transcript.hidden = !messages.length;
    } finally {
      progress.remove();
      busy = false;
      send.disabled = false;
    }
  }
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submit();
    }
  });
  return {submit, reset};
}
