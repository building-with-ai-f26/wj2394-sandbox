(function (root) {
  const venues = [
    {
      demo: 'demo-1', names: ['via carota'], placeId: 'ChIJr7FOf5NZwokRu3CDYtzVmuQ',
      address: /\b51 grove (?:street|st) (?:new york(?: city)?|nyc|manhattan)(?: ny)?(?: \d{5})?(?: usa)?$/,
      neighborhoods: ['west village']
    },
    {
      demo: 'demo-2', names: ['caffe dante', 'dante', 'dante nyc'], cid: '4339773443060882983',
      address: /\b(?:79(?: 81)?|81) macdougal (?:street|st) (?:greenwich village )?(?:new york(?: city)?|nyc|manhattan)(?: ny)?(?: \d{5})?(?: usa)?$/,
      neighborhoods: ['greenwich village']
    },
    {
      demo: 'demo-4', names: ['brooklyn bridge park pier 1', 'pier 1 brooklyn bridge park'],
      address: /\bold fulton (?:street|st)(?: at furman (?:street|st))? brooklyn(?: ny)?(?: \d{5})?(?: usa)?$/,
      neighborhoods: ['dumbo', 'brooklyn heights']
    },
    {
      names: ['mercado little spain'], cid: '5140990968716504887', placeId: 'ChIJgx-LUDlZwokRN6_WQwx4WEc',
      address: /\b10 hudson yards (?:new york(?: city)?|nyc|manhattan)(?: ny)?(?: \d{5})?(?: usa)?$/,
      neighborhoods: ['hudson yards'],
      photo: {
        file: 'mercado-little-spain.jpg', author: 'Kidfly182', license: 'CC BY 4.0',
        source: 'https://commons.wikimedia.org/wiki/File:Little_Spain_Hudson_Yards_001.jpg',
        licenseURL: 'https://creativecommons.org/licenses/by/4.0/'
      }
    }
  ];

  function normalize(value) {
    return typeof value === 'string' ? value.normalize('NFKD').replace(/\p{M}/gu, '')
      .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() : '';
  }

  function mapsText(url) {
    const query = url.searchParams.get('query') || url.searchParams.get('q');
    if (query) return query;
    const encoded = url.pathname.match(/^\/maps\/(?:place|search)\/([^/]+)/)?.[1];
    if (!encoded) return '';
    try { return decodeURIComponent(encoded); } catch { return ''; }
  }

  function find(place) {
    const venue = venues.find(entry => entry.names.includes(normalize(place?.name)));
    if (!venue) return null;

    const savedURL = root.InnerTableImport.mapsURL(place.url);
    if (!savedURL) return null;
    const details = place._google;
    const cid = root.GooglePlaces.mapsFeatureId(savedURL) || root.GooglePlaces.mapsFeatureId(details?.googleMapsUri);
    const placeId = root.GooglePlaces.placeIdFromURL(savedURL) || place.googlePlaceId || details?.id;
    const idMatches = venue.cid && cid ? venue.cid === cid : venue.placeId && placeId ? venue.placeId === placeId : null;
    if (idMatches === false) return null;

    if (idMatches === null) {
      const address = details?.formattedAddress || place.address;
      const addressMatches = venue.address.test(normalize(address || mapsText(new URL(savedURL))));
      const neighborhoodMatches = !address && venue.neighborhoods.includes(normalize(place.neighborhood));
      if (!addressMatches && !neighborhoodMatches) return null;
    }

    return venue.photo || InnerTableDemo.find(entry => entry.id === venue.demo)?.photo || null;
  }

  root.InnerTableVenuePhotos = {find};
})(globalThis);
