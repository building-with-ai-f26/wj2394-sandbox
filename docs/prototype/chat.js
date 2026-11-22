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
    return getPlaces().map(place => ({id: String(place.id), url:place.url, name: place.name, category: place.category,
      neighborhood: place.neighborhood, price: place.price, note: place.note, status: place.status,
      ...(place.website ? {publicDescription:place.description} : {}),
      googleAddress: place._google?.formattedAddress || '', googleCategory: place._google?.primaryTypeDisplayName?.text || '',
      googleDescription: place._google?.editorialSummary?.text || '', googlePriceRange: place._google?.priceRange || null,
      googleReviews: (place._google?.reviews || []).map(review => review.text?.text || ''),
      tags: place.tags, googleReviewTags: place.googleReviewTags || []}));
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
      if(!candidates.matches.length) {
        const reply = 'I couldn’t identify candidates for that change in your saved guide. Try describing the cuisine and area together, such as “casual Japanese food in NYC.”';
        messages.push(turn,{role:'assistant',content:reply});
        progress.remove();
        append('assistant',reply);
        onResults({reply,matches:[]});
        status.textContent = 'You can refine the plan below.';
        return;
      }
      progress.textContent = 'Checking available details for your plan…';
      transcript.scrollTop = transcript.scrollHeight;
      const coverage = await preparePlaces(candidates.matches.map(match => match.id));
      if(context !== revision)return;
      const details = guideSummary();
      const selected = details.filter(place => candidates.matches.some(match => match.id === place.id));
      progress.textContent = 'Finding the best fit from the available details…';
      transcript.scrollTop = transcript.scrollHeight;
      const result = await request('/api/plan', {messages:history, places:selected}, context);
      if (context !== revision) return;
      messages.push(turn, {role: 'assistant', content: result.reply});
      progress.remove();
      append('assistant', result.reply);
      onResults(result);
      status.textContent = (coverage.sample ? 'Suggestions use the public details in the NYC sample guide. ' : `${coverage.checked} of ${coverage.requested} candidates checked on Google Maps. `) + (coverage.error ? 'Google details are unavailable for some places. Suggestions use the saved notes and details currently available. ' : '') + 'Keep chatting to refine the shortlist.';
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
