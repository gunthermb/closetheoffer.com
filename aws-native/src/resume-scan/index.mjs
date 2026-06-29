/*
  Created by GuntherCloudSolutions
  Last updated: 2026-06-28

  Lambda: thin Anthropic-compatible proxy to Amazon Bedrock (Claude). Replaces the
  browser's direct call to api.anthropic.com/v1/messages, so no API key sits in the
  client. Accepts the same body the app already sends ({ messages, max_tokens, system })
  and returns Bedrock's response, which is already in Anthropic format ({ content:[{text}] }).
  Invoked by API Gateway POST /scan (Cognito-authed). The AWS SDK is bundled in the runtime.
*/
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({});
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const messages = Array.isArray(body.messages) ? body.messages : null;
    if (!messages || messages.length === 0) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'messages[] is required.' }) };
    }

    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: Math.min(Number(body.max_tokens) || 4096, 8192),
      messages,
    };
    if (body.system) payload.system = body.system;
    if (body.temperature != null) payload.temperature = body.temperature;

    const out = await client.send(new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    }));

    // Bedrock returns Anthropic-format JSON already ({ content:[{type:'text',text}], ... }).
    const decoded = JSON.parse(new TextDecoder().decode(out.body));
    return { statusCode: 200, headers: CORS, body: JSON.stringify(decoded) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message || String(err) }) };
  }
};
