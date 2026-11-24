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


async function withRetry(label, operation) {
  const timeoutMs = Math.max(1000, Number(process.env.SEASON_PLAN_TIMEOUT_MS || 300000));
  const maxRetries = Math.max(0, Math.min(5, Number(process.env.SEASON_PLAN_MAX_RETRIES || 3)));
  const baseDelayMs = Math.max(250, Number(process.env.SEASON_PLAN_RETRY_DELAY_MS || 5000));
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let timeout;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error(label + " timeout setelah " + timeoutMs + " ms.");
          error.retryable = true;
          reject(error);
        }, timeoutMs);
      });
      return await Promise.race([Promise.resolve().then(operation), timeoutPromise]);
    } catch (error) {
      lastError = error;
      const details = errorDetails(error);
      const retryable = error?.retryable || error?.outputValidationError || details.retryable;
      if (!retryable || attempt >= maxRetries) throw error;
      const delay = baseDelayMs * (2 ** attempt);
      console.warn("[" + label + "] Percobaan " + (attempt + 1) + "/" +
        (maxRetries + 1) + " gagal: " + details.message +
        ". Retry dalam " + delay + " ms.");
      await new Promise(resolve => setTimeout(resolve, delay));
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  throw lastError;
}

function toOpenRouterMessages(contents) {
  if (typeof contents === "string") return [{ role: "user", content: contents }];
  if (Array.isArray(contents)) {
    const text = contents.map(item => {
      if (typeof item === "string") return item;
      if (typeof item?.text === "string") return item.text;
      if (Array.isArray(item?.parts)) return item.parts.map(part => part.text || "").join("\n");
      return "";
    }).filter(Boolean).join("\n");
    return [{ role: "user", content: text || JSON.stringify(contents) }];
  }
  return [{ role: "user", content: JSON.stringify(contents ?? "") }];
}

async function validateCandidate(response, validateResponse, provider) {
  if (typeof validateResponse !== "function") return response;
  try {
    await validateResponse(response);
    return response;
  } catch (error) {
    const validationError = new Error(
      "Output " + provider + " tidak memenuhi validasi: " +
      String(error?.message || error)
    );
    validationError.outputValidationError = true;
    throw validationError;
  }
}

export async function generateOpenRouterContent(request, previousError, validateResponse, options = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Semua model Gemini gagal dan OPENROUTER_API_KEY belum diatur. " +
      String(previousError?.message || previousError || "")
    );
  }

  const generationConfig = request.config || {};
  const body = {
    model: options.model || process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
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
  const result = await withRetry("openrouter:" + body.model, async () => {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/Mardianto25/remotion-v2",
        "X-Title": "Ruang Cerita Indonesia"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(1000, Number(process.env.SEASON_PLAN_TIMEOUT_MS || 300000)))
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error("OpenRouter gagal (HTTP " + response.status + "): " +
        (payload?.error?.message || JSON.stringify(payload) || response.statusText));
      error.status = response.status;
      throw error;
    }
    return payload;
  });

  const text = result?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("OpenRouter mengembalikan respons kosong atau format tidak dikenal.");
  }

  const normalized = { text, response: result };
  return validateCandidate(normalized, validateResponse, "OpenRouter");
}

export async function generateGeminiContent(ai, request, options = {}) {
  const models = [...new Set([config.geminiModel, ...config.geminiFallbackModels].filter(Boolean))];
  let lastError;

  if (ai) {
    for (const model of models) {
      try {
        console.log("[gemini] Menggunakan model: " + model);
        const response = await withRetry("gemini:" + model, () => ai.models.generateContent({ ...request, model }));
        return await validateCandidate(response, options.validateResponse, "Gemini " + model);
      } catch (error) {
        lastError = error;
        const details = errorDetails(error);
        console.error("[gemini] Model " + model + " gagal: " + details.message);
        if (!error?.outputValidationError && !details.retryable) break;
        console.warn("[gemini] Mencoba model Gemini berikutnya.");
      }
    }
  } else {
    lastError = new Error("Gemini API key tidak tersedia.");
  }

  console.warn("[ai] Seluruh jalur Gemini gagal. Beralih ke OpenRouter.");
  if (typeof options.openRouterFallback === "function") {
    return options.openRouterFallback(request, lastError);
  }

  const primaryModel = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  const fallbackModels = (process.env.OPENROUTER_FALLBACK_MODELS ||
    "qwen/qwen3-235b-a22b-2507,deepseek/deepseek-v3.2")
    .split(",").map(value => value.trim()).filter(Boolean);
  const openRouterModels = [...new Set([primaryModel, ...fallbackModels])];
  let lastOpenRouterError;
  for (const model of openRouterModels) {
    try {
      console.warn("[openrouter] Mencoba model: " + model);
      return await generateOpenRouterContent(
        request, lastError, options.validateResponse, { model }
      );
    } catch (error) {
      lastOpenRouterError = error;
      console.error("[openrouter] Model " + model + " gagal: " +
        String(error?.message || error));
    }
  }
  throw new Error("Semua model OpenRouter gagal. " +
    String(lastOpenRouterError?.message || lastOpenRouterError || ""));
}
