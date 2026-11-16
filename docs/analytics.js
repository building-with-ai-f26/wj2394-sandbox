/* Analytics records fixed control names. Private app regions are blocked in replay. */
(async function () {
  const script = document.currentScript;
  const isPrototype = location.pathname.includes('/prototype/');
  const surface = isPrototype ? 'prototype' : 'report';
  const environment = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'local' : 'public';
  const controls = new Set(['plan-send', 'reset', 'show-add', 'confirm-import', 'cancel-import',
    'show-all-in-guide', 'export-places', 'friends-refresh', 'use-my-guide',
    'account-copy', 'account-use-cloud', 'account-use-device', 'account-sign-out']);
  const forms = new Set(['search-form', 'place-form', 'account-auth-form',
    'account-profile-form', 'friend-request-form']);
  const reportLinks = new Set(['showcase', 'prd', 'build-log', 'repository', 'prototype']);
  let posthog;

  function capture(name, properties = {}) {
    posthog?.capture(name, {surface, environment, ...properties});
  }

  document.addEventListener('click', event => {
    const control = event.target.closest('button, a');
    if (!control) return;
    if (controls.has(control.id)) capture('control_clicked', {control: control.id});
    const view = control.dataset.view;
    if (['discover', 'places', 'friends', 'account'].includes(view)) {
      capture('view_opened', {view});
    }
    if (!isPrototype && reportLinks.has(control.dataset.analyticsLink)) {
      capture('report_link_clicked', {link: control.dataset.analyticsLink});
    }
  });
  document.addEventListener('submit', event => {
    if (forms.has(event.target.id)) capture('form_submitted', {form: event.target.id});
  });

  try {
    if (/(?:access_token|refresh_token|error_description)=/.test(location.hash + location.search)) return;
    const response = await fetch(new URL('analytics-config.json', script.src));
    if (!response.ok) return;
    const config = await response.json();
    if (!config.token || !/^https:\/\/(us|eu)\.i\.posthog\.com$/.test(config.host)) return;
    const sdk = document.createElement('script');
    sdk.src = config.host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js';
    sdk.crossOrigin = 'anonymous';
    sdk.onload = () => {
      posthog = window.posthog;
      posthog.init(config.token, {
        api_host: config.host,
        person_profiles: 'never',
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_performance: false,
        capture_exceptions: false,
        enable_recording_console_log: false,
        disable_session_recording: false,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: '*',
          blockSelector: 'img, svg, canvas, #results, #my-places, #plan-messages, #import-preview, #place-editor, #google-match, #account-view, #friends-view, #guide-person, #account-sync, #friend-access-status, #plan-status, #result-summary, #import-status, #storage-status, #guide-storage-note',
          recordHeaders: false,
          recordBody: false,
          recordCrossOriginIframes: false
        },
        before_send: event => {
          // Confirmation fragments and URL query parameters can contain credentials.
          for (const key of Object.keys(event.properties || {})) {
            if (/url|referrer/i.test(key) && typeof event.properties[key] === 'string') {
              try {
                const url = new URL(event.properties[key]);
                event.properties[key] = url.origin + url.pathname;
              } catch { delete event.properties[key]; }
            }
          }
          return event;
        },
        loaded: () => capture('$pageview', {$current_url: location.origin + location.pathname})
      });
    };
    document.head.append(sdk);
  } catch {
    // Analytics availability must not interrupt the guide.
  }
})();
