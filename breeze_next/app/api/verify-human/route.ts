import { NextRequest } from "next/server";
import OpenAI from "openai"; // retained for potential future use but not used in request below

export const runtime = "nodejs"; // ensure Node runtime for Buffer

// Lazily create client to allow early env validation
const openaiApiKey = process.env ? process.env.OPENAI_API_KEY : null || null;
const openai = openaiApiKey
  ? new OpenAI({ apiKey: openaiApiKey })
  : null;

// Simple allow-list of content-types
const OCTET_STREAM = "application/octet-stream";

export async function POST(req: NextRequest) {
  try {
    if (!openai) {
      return json({ error: "OPENAI_API_KEY not configured" }, 500);
    }

    const ct = req.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes(OCTET_STREAM)) {
      return json({ error: `Content-Type must be ${OCTET_STREAM}` }, 415);
    }

    // 1) Read raw bytes
    const arrayBuf = await req.arrayBuffer();
    if (arrayBuf.byteLength === 0) {
      return json({ error: "Empty body" }, 400);
    }

    // Optional guardrail on size (e.g. 2MB)
    if (arrayBuf.byteLength > 2 * 1024 * 1024) {
      return json({ error: "Image too large (>2MB)" }, 413);
    }

    // 2) Convert to base64 data URL
    const b64 = Buffer.from(arrayBuf).toString("base64");
  // Must include the comma after 'base64,' per data URL spec
  const dataUrl = `data:image/jpeg;base64,${b64}`;

    // 3) Build messages for vision model
    const messages: any[] = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              'You are an image analyzer. Determine if at least one human is visibly present. Respond ONLY valid minified JSON with fields isHuman (boolean) and confidence (number 0-1).',
          },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ];

    // 4) Call OpenAI chat completions with vision (proven approach)
    const model = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
    let raw = "";
    let upstreamInfo: any = null;
    try {
      const body = {
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: 'Determine if at least one human is visibly present. Respond ONLY strict minified JSON {"isHuman": boolean, "confidence": number}.',
              },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 100,
      };

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        let errJson: any = null;
        try { errJson = await r.json(); } catch {}
        upstreamInfo = {
          phase: "chat.completions.rest",
          status: r.status,
          message: errJson?.error?.message || r.statusText,
          type: errJson?.error?.type,
          code: errJson?.error?.code,
          raw: errJson,
        };
        console.error("OpenAI REST chat completions error", upstreamInfo);
        return json({ error: "UpstreamOpenAIError", upstream: upstreamInfo }, 502);
      }
      const data: any = await r.json();
      raw = data.choices?.[0]?.message?.content || "";
    } catch (err: any) {
      upstreamInfo = {
        phase: "chat.completions.rest",
        message: err?.message,
      };
      console.error("OpenAI REST call failed", upstreamInfo);
      return json({ error: "UpstreamOpenAIError", upstream: upstreamInfo }, 502);
    }

    // 5) Extract JSON
    let result: { isHuman: boolean; confidence: number } = {
      isHuman: false,
      confidence: 0,
    };
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (typeof parsed.isHuman === "boolean" && typeof parsed.confidence === "number") {
          result = {
            isHuman: parsed.isHuman,
            confidence: Math.min(1, Math.max(0, parsed.confidence)),
          };
        }
      }
    } catch {
      // keep default
    }

  const debug = req.nextUrl.searchParams.get("debug");
  return json(debug ? { ...result, _raw: raw, _upstream: upstreamInfo } : result, 200);
  } catch (e: any) {
    console.error("verify-human error", e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}