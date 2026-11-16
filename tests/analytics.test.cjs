const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

async function loadAnalytics(hash = '', pathname = '/prototype/') {
  const listeners = {};
  const captures = [];
  let options;
  const posthog = {
    init(token, config) { options = config; config.loaded(); },
    capture(name, properties) { captures.push({name, properties}); }
  };
  const document = {
    currentScript: {src: 'http://localhost:8001/analytics.js'},
    addEventListener(name, listener) { listeners[name] = listener; },
    createElement() { return {}; },
    head: {append(script) { script.onload(); }}
  };
  const pending = vm.runInNewContext(fs.readFileSync('docs/analytics.js', 'utf8'), {
    document, window: {posthog}, URL,
    location: {pathname, hostname:'localhost', origin:'http://localhost:8001', hash, search:''},
    fetch: async () => ({ok:true, json:async () => ({token:'fixture',host:'https://us.i.posthog.com'})})
  });
  await pending;
  return {options, captures, listeners};
}

test('analytics blocks private regions and strips callback credentials from event URLs', async () => {
  const {options} = await loadAnalytics();
  assert.equal(options.autocapture, false);
  assert.equal(options.session_recording.maskAllInputs, true);
  assert.equal(options.session_recording.maskTextSelector, '*');
  for (const selector of ['#results', '#my-places', '#plan-messages', '#account-view', '#friends-view']) {
    assert.ok(options.session_recording.blockSelector.includes(selector));
  }
  const event = {properties:{$current_url:'http://localhost:8001/prototype/?code=private#access_token=private'}};
  options.before_send(event);
  assert.equal(event.properties.$current_url, 'http://localhost:8001/prototype/');
});

test('form events contain only a fixed identifier and confirmation callbacks skip analytics', async () => {
  const {listeners, captures} = await loadAnalytics();
  listeners.submit({target:{id:'account-auth-form',email:'private@example.com',password:'private'}});
  assert.equal(JSON.stringify(captures).includes('private'), false);
  assert.equal(captures.at(-1).properties.form, 'account-auth-form');
  const callback = await loadAnalytics('#access_token=private');
  assert.equal(callback.options, undefined);
  assert.equal(callback.captures.length, 0);
});

test('report demo clicks use a fixed label and exclude link contents', async () => {
  const {listeners, captures} = await loadAnalytics('', '/');
  const control = {id:'', dataset:{analyticsLink:'prototype'}, href:'https://example.com/private', textContent:'private'};
  listeners.click({target:{closest:() => control}});
  assert.equal(captures.at(-1).name, 'report_link_clicked');
  assert.equal(captures.at(-1).properties.link, 'prototype');
  assert.equal(captures.at(-1).properties.surface, 'report');
  assert.equal(JSON.stringify(captures).includes('private'), false);

  control.dataset.analyticsLink = 'private';
  const count = captures.length;
  listeners.click({target:{closest:() => control}});
  assert.equal(captures.length, count);
});
