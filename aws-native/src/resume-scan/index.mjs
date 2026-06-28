/*
  Created by GuntherCloudSolutions
  Last updated: 2026-06-28

  Lambda: resume scan via Amazon Bedrock (Claude). Replaces the browser's direct
  call to api.anthropic.com. Invoked by API Gateway POST /scan (Cognito-authed).
  Body: { resume: string, jobDescription?: string }
  The AWS SDK v3 Bedrock client is bundled in the Lambda Node.js runtime.
*/
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({});
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-haiku-20241022-v1:0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const resume = String(body.resume || '').slice(0, 60000).trim();
    const jd = String(body.jobDescription || '').slice(0, 30000).trim();

    if (!resume) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Resume text is required.' }) };
    }

    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4096,
      messages: [{ role: 'user', content: buildPrompt(resume, jd) }],
    };

    const out = await client.send(new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    }));

    const decoded = JSON.parse(new TextDecoder().decode(out.body));
    const text = decoded?.content?.[0]?.text || '';
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ analysis: text }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message || String(err) }) };
  }
};

function buildPrompt(resume, jd) {
  let p = `You are an expert resume reviewer and ATS (applicant tracking system) analyst.
Analyze the resume below and return:
1. An ATS readiness score out of 100 with the top issues to fix.
2. Strength of accomplishment statements (CAR: Challenge-Action-Result) with concrete rewrite suggestions.
3. Formatting / structure problems that hurt parsing.
Keep it specific and actionable.

RESUME:
"""
${resume}
"""`;
  if (jd) {
    p += `

TARGET JOB DESCRIPTION (do a keyword gap analysis — list required skills/keywords present vs. missing):
"""
${jd}
"""`;
  }
  return p;
}
