import { config } from "../config.js";

function errorDetails(error) {
  const status = Number(error?.status || error?.statusCode || error?.code || 0);
  const message = String(error?.message || error || "");
  return { status, message, retryable: status === 429 || status >= 500 || /RESOURCE_EXHAUSTED|UNAVAILABLE|OVERLOADED|quota|rate.?limit|model.*not found|not found/i.test(message) };
}

export async function generateGeminiContent(ai, request) {
  const models = [...new Set([config.geminiModel, ...config.geminiFallbackModels].filter(Boolean))];
  let lastError;
  for (let index = 0; index < models.length; index++) {
    const model = models[index];
    try {
      console.log("[gemini] Menggunakan model: " + model);
      return await ai.models.generateContent({ ...request, model });
    } catch (error) {
      lastError = error;
      const details = errorDetails(error);
      console.error("[gemini] Model " + model + " gagal: " + details.message);
      if (!details.retryable || index === models.length - 1) throw error;
      console.warn("[gemini] Beralih ke model cadangan: " + models[index + 1]);
    }
  }
  throw lastError || new Error("Semua model Gemini gagal.");
}
