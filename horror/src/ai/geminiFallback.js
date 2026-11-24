import { config } from "../config.js";

function errorDetails(error) {
  const status = Number(error?.status || error?.statusCode || error?.code || 0);
  const message = String(error?.message || error || "");
  return {
    status,
    message,
    retryable: status === 429 || status >= 500 ||
      /RESOURCE_EXHAUSTED|UNAVAILABLE|OVERLOADED|quota|rate.?limit|too many requests|429|model.*not found|not found/i.test(message)
  };
}

function toOpenRouterMessages(contents) {
  if (typeof contents === "string") return [{ role: "user", content: contents }];
  if (Array.isArray(contents)) {
    const text = contents.map(item => {
      if (typeof item === "string") return item;
      if (typeof item?.text === "string") return item.text;
      if (Array.isArray(item?.parts)) return item.parts.map(part => part.text || "").join("\\n");
      return "";
    }).filter(Boolean).join("\\n");
    return [{ role: "user", content: text || JSON.stringify(contents) }];
  }
  return [{ role: "user", content: JSON.stringify(contents ?? "") }];
}

async function generateOpenRouterContent(request, previousError) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Semua model Gemini gagal dan OPENROUTER_API_KEY belum diatur. " +
      String(previousError?.message || previousError || "")
    );
  }

  const generationConfig = request.config || {};
  const body = {
    model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
    messages: toOpenRouterMessages(request.contents),
    ...(generationConfig.responseMimeType === "application/json"
      ? { response_format: { type: "json_object" } }
      : {}),
    ...(generationConfig.maxOutputTokens
      ? { max_tokens: generationConfig.maxOutputTokens }
      : {}),
    ...(Number.isFinite(generationConfig.temperature)
      ? { temperature: generationConfig.temperature }
      : {}),
    ...(Number.isFinite(generationConfig.topP)
      ? { top_p: generationConfig.topP }
      : {})
  };

  console.warn("[openrouter] Semua model Gemini gagal. Menggunakan model: " + body.model);
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/Mardianto25/remotion-v2",
      "X-Title": "Ruang Cerita Indonesia"
    },
    body: JSON.stringify(body)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result?.error?.message || JSON.stringify(result) || response.statusText;
    throw new Error("OpenRouter gagal (HTTP " + response.status + "): " + message);
  }

  const text = result?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("OpenRouter mengembalikan respons kosong atau format tidak dikenal.");
  }

  return { text, response: result };
}

export async function generateGeminiContent(ai, request) {
  const models = [...new Set([config.geminiModel, ...config.geminiFallbackModels].filter(Boolean))];
  let lastError;

  if (ai) {
    for (const model of models) {
      try {
        console.log("[gemini] Menggunakan model: " + model);
        return await ai.models.generateContent({ ...request, model });
      } catch (error) {
        lastError = error;
        const details = errorDetails(error);
        console.error("[gemini] Model " + model + " gagal: " + details.message);
        if (!details.retryable) break;
        console.warn("[gemini] Mencoba model Gemini berikutnya.");
      }
    }
  } else {
    lastError = new Error("Gemini API key tidak tersedia.");
  }

  console.warn("[ai] Seluruh jalur Gemini gagal. Beralih ke OpenRouter.");
  return generateOpenRouterContent(request, lastError);
}
