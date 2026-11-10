/* Conversation stays in memory. Guide data is submitted only when sending a plan. */
function createPlanChat({getPlaces, preparePlaces, onResults}) {
  const messages = [];
  let revision = 0;
  let busy = false;
  const transcript = document.querySelector('#plan-messages');
  const input = document.querySelector('#occasion');
  const send = document.querySelector('#plan-send');
  const status = document.querySelector('#plan-status');
  function guideSummary() {
    return getPlaces().map(place => ({id: String(place.id), name: place.name, category: place.category,
      neighborhood: place.neighborhood, price: place.price, note: place.note, status: place.status,
      googleAddress: place._google?.formattedAddress || '', googleCategory: place._google?.primaryTypeDisplayName?.text || '',
      googleDescription: place._google?.editorialSummary?.text || '', googlePriceRange: place._google?.priceRange || null,
      googleReviews: (place._google?.reviews || []).map(review => review.text?.text || ''),
      tags: place.tags, googleReviewTags: place.googleReviewTags || []}));
  }
  async function request(route, body) {
    const response = await fetch(route, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
    const result = await response.json();
    if(!response.ok) throw new Error(result.error || 'The conversation is temporarily unavailable.');
    return result;
  }
  function append(role, content) {
    const bubble = document.createElement('p');
    bubble.className = 'plan-message ' + role;
    bubble.textContent = content;
    transcript.append(bubble);
    transcript.hidden = false;
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
    const context = revision;
    busy = true;
    send.disabled = true;
    status.textContent = 'Thinking through your guide…';
    const turn = {role: 'user', content: text};
    append('user', text);
    input.value = '';
    try {
      const history = [...messages, turn];
      const candidates = await request('/api/plan/shortlist', {messages:history, places:guideSummary()});
      if(context !== revision)return;
      if(!candidates.matches.length) {
        const reply = 'I couldn’t identify candidates for that change in your saved guide. Try describing the cuisine and area together, such as “casual Japanese food in NYC.”';
        messages.push(turn,{role:'assistant',content:reply});
        append('assistant',reply);
        onResults({reply,matches:[]});
        status.textContent = 'You can refine the plan below.';
        return;
      }
      status.textContent = 'Checking Google Maps details for your plan…';
      const coverage = await preparePlaces(candidates.matches.map(match => match.id));
      if(context !== revision)return;
      if(coverage.requested && !coverage.checked) throw new Error(coverage.error || 'Google details could not be matched for these places. Try matching them in My places.');
      const details = guideSummary();
      const selected = details.filter(place => candidates.matches.some(match => match.id === place.id));
      status.textContent = 'Finding the best fit from the available details…';
      const result = await request('/api/plan', {messages:history, places:selected});
      if (context !== revision) return;
      messages.push(turn, {role: 'assistant', content: result.reply});
      append('assistant', result.reply);
      onResults(result);
      status.textContent = `${coverage.checked} of ${coverage.requested} candidates checked on Google Maps. ` + (coverage.error ? 'Some details could not load. ' : '') + 'Keep chatting to refine the shortlist.';
    } catch (error) {
      if (context !== revision) return;
      status.textContent = error instanceof SyntaxError ? 'The conversation needs the local Inner Table server.' : error.message;
      input.value = text;
      // Failed turns are excluded from subsequent model history.
      transcript.lastElementChild?.remove();
    } finally {
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
