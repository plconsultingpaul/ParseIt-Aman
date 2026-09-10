import { replaceVariables, getValueByPath } from "../utils/objectPaths.ts";

export async function executeGooglePlacesLookup(step: any, contextData: any, supabaseUrl: string, supabaseServiceKey: string): Promise<any> {
  console.log('\uD83D\uDCCD Executing Google Places Lookup step:', step.step_name);
  const config = step.config_json || {};

  const apiKeyResponse = await fetch(`${supabaseUrl}/rest/v1/api_settings?select=google_places_api_key&limit=1`, {
    headers: {
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey
    }
  });

  if (!apiKeyResponse.ok) {
    throw new Error('Failed to fetch Google Places API key configuration');
  }

  const apiSettings = await apiKeyResponse.json();
  if (!apiSettings?.length || !apiSettings[0].google_places_api_key) {
    throw new Error('Google Places API key not configured. Please configure it in Settings > API Settings > Google Places.');
  }

  const apiKey = apiSettings[0].google_places_api_key;
  const searchQuery = replaceVariables(config.placesSearchQuery || '', contextData);

  if (!searchQuery.trim()) {
    throw new Error('Search query is empty after variable substitution');
  }

  console.log('\uD83D\uDD0D Search query:', searchQuery);

  const fieldsToReturn = config.placesFieldsToReturn || { name: true, address: true };
  const fieldMask: string[] = ['places.id'];

  if (fieldsToReturn.name) fieldMask.push('places.displayName');
  if (fieldsToReturn.address) fieldMask.push('places.formattedAddress', 'places.addressComponents');
  if (fieldsToReturn.phone) fieldMask.push('places.nationalPhoneNumber', 'places.internationalPhoneNumber');
  if (fieldsToReturn.website) fieldMask.push('places.websiteUri');
  if (fieldsToReturn.rating) fieldMask.push('places.rating', 'places.userRatingCount');
  if (fieldsToReturn.hours) fieldMask.push('places.currentOpeningHours');
  if (fieldsToReturn.placeId) fieldMask.push('places.id');
  fieldMask.push('places.location');

  const placesResponse = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask.join(',')
    },
    body: JSON.stringify({
      textQuery: searchQuery
    })
  });

  if (!placesResponse.ok) {
    const errorText = await placesResponse.text();
    throw new Error(`Google Places API call failed: ${errorText}`);
  }

  const placesData = await placesResponse.json();
  console.log('\uD83D\uDCCD Places response:', JSON.stringify(placesData));

  if (!placesData.places || placesData.places.length === 0) {
    console.log('\u26A0\uFE0F No places found for query');
    return {
      success: false,
      message: 'No places found for the given query',
      query: searchQuery
    };
  }

  const place = placesData.places[0];
  const extractedData: Record<string, any> = {};

  extractedData.name = place.displayName?.text || place.displayName || null;
  extractedData.formattedAddress = place.formattedAddress || null;
  extractedData.placeId = place.id || null;

  if (place.addressComponents) {
    for (const component of place.addressComponents) {
      const types = component.types || [];
      if (types.includes('street_number') || types.includes('route')) {
        const streetNum = place.addressComponents.find((c: any) => c.types?.includes('street_number'))?.longText || '';
        const route = place.addressComponents.find((c: any) => c.types?.includes('route'))?.longText || '';
        extractedData.streetAddress = `${streetNum} ${route}`.trim();
      }
      if (types.includes('locality')) {
        extractedData.city = component.longText || null;
      }
      if (types.includes('administrative_area_level_1')) {
        extractedData.state = component.shortText || null;
      }
      if (types.includes('postal_code')) {
        extractedData.postalCode = component.longText || null;
      }
      if (types.includes('country')) {
        extractedData.country = component.longText || null;
      }
    }
  }

  extractedData.phone = place.nationalPhoneNumber || place.internationalPhoneNumber || null;
  extractedData.website = place.websiteUri || null;
  extractedData.rating = place.rating || null;
  extractedData.userRatingsTotal = place.userRatingCount || null;

  if (place.currentOpeningHours?.weekdayDescriptions) {
    extractedData.hours = place.currentOpeningHours.weekdayDescriptions.join('; ');
  }

  if (place.location) {
    extractedData.latitude = place.location.latitude || null;
    extractedData.longitude = place.location.longitude || null;
  }

  if (!contextData.execute) {
    contextData.execute = {};
  }
  if (!contextData.execute.places) {
    contextData.execute.places = {};
  }

  const responseMappings = config.placesResponseMappings || [];
  for (const mapping of responseMappings) {
    if (mapping.fieldName && mapping.placesField) {
      const value = extractedData[mapping.placesField];
      contextData.execute.places[mapping.fieldName] = value;
      console.log(`\uD83D\uDCDD Stored execute.places.${mapping.fieldName} =`, value);
    }
  }

  console.log('\u2705 Google Places Lookup results stored in execute.places:', contextData.execute.places);

  return {
    success: true,
    results: contextData.execute.places,
    rawData: extractedData,
    query: searchQuery
  };
}
