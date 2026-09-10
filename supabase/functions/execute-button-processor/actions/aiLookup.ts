import { replaceVariables, getValueByPath } from "../utils/objectPaths.ts";

export async function executeAiLookup(step: any, contextData: any, supabaseUrl: string, supabaseServiceKey: string): Promise<any> {
  console.log('\uD83E\uDD16 Executing AI Lookup step:', step.step_name);
  const config = step.config_json || {};

  const apiKeyResponse = await fetch(`${supabaseUrl}/rest/v1/gemini_api_keys?is_active=eq.true&limit=1`, {
    headers: {
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey
    }
  });

  if (!apiKeyResponse.ok) {
    throw new Error('Failed to fetch Gemini API key configuration');
  }

  const apiKeys = await apiKeyResponse.json();
  if (!apiKeys?.length) {
    throw new Error('No active Gemini API key found. Please configure Gemini API in Settings > API Settings > Gemini AI.');
  }

  const activeApiKey = apiKeys[0];
  const apiKey = activeApiKey.api_key;

  const modelResponse = await fetch(`${supabaseUrl}/rest/v1/gemini_models?is_active=eq.true&limit=1`, {
    headers: {
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey
    }
  });

  if (!modelResponse.ok) {
    throw new Error('Failed to fetch Gemini model configuration');
  }

  const models = await modelResponse.json();
  const modelName = models?.[0]?.model_name || 'gemini-1.5-flash';

  const basePrompt = replaceVariables(config.aiPrompt || '', contextData);
  const responseMappings = config.aiResponseMappings || [];

  const fieldInstructions = responseMappings.map((m: any) =>
    `- "${m.fieldName}": ${m.aiInstruction}`
  ).join('\n');

  const fullPrompt = `${basePrompt}

You must respond with a valid JSON object containing the following fields:
${fieldInstructions}

IMPORTANT:
- Return ONLY a valid JSON object, no markdown or other formatting
- If you cannot find information for a field, use null
- Keep values concise and accurate`;

  console.log('\uD83D\uDCDD AI Prompt:', fullPrompt);

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
        }
      })
    }
  );

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    throw new Error(`Gemini API call failed: ${errorText}`);
  }

  const geminiData = await geminiResponse.json();
  const responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  console.log('\uD83E\uDD16 AI Response:', responseText);

  let aiResults: Record<string, any> = {};
  try {
    let jsonStr = responseText.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    }
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    aiResults = JSON.parse(jsonStr);
  } catch (parseError) {
    console.error('Failed to parse AI response as JSON:', parseError);
    for (const mapping of responseMappings) {
      const regex = new RegExp(`"${mapping.fieldName}"\\s*:\\s*"([^"]*)"`, 'i');
      const match = responseText.match(regex);
      if (match) {
        aiResults[mapping.fieldName] = match[1];
      }
    }
  }

  if (!contextData.execute) {
    contextData.execute = {};
  }
  if (!contextData.execute.ai) {
    contextData.execute.ai = {};
  }

  for (const [key, value] of Object.entries(aiResults)) {
    contextData.execute.ai[key] = value;
  }

  console.log('\u2705 AI Lookup results stored in execute.ai:', aiResults);

  return {
    success: true,
    results: aiResults,
    rawResponse: responseText
  };
}
