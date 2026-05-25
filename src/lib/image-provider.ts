// ─── AI Görsel Sağlayıcı (Epic G) ──────────────────────────
// Soyut arayüz + Gemini implementasyonu (gemini-3-pro-image-preview).
// gorsel-motoru'nun çekirdek çağrısı temel alındı; key SUNUCUDA (env), asla istemciye gitmez.

import { getConfigValue } from "./app-config";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface GenerateInput {
  prompt: string;
  sourceImages: Array<{ mimeType: string; base64: string }>; // ürün referans görselleri
  aspectRatio?: string; // "1:1" | "3:4" | "4:3" ...
}

export interface GeneratedImage {
  mimeType: string;
  base64: string;
}

export interface ImageProvider {
  readonly name: string;
  configured(): Promise<boolean>;
  generate(input: GenerateInput): Promise<GeneratedImage>;
}

class GeminiImageProvider implements ImageProvider {
  readonly name = "gemini";

  async configured(): Promise<boolean> {
    return Boolean(await getConfigValue("gemini_api_key"));
  }

  async generate(input: GenerateInput): Promise<GeneratedImage> {
    const key = await getConfigValue("gemini_api_key");
    if (!key) throw new Error("Gemini API key tanımlı değil");
    const IMAGE_MODEL = (await getConfigValue("gemini_image_model")) || "gemini-3-pro-image-preview";

    const parts: Array<Record<string, unknown>> = [{ text: input.prompt }];
    for (const img of input.sourceImages) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
    }

    const body = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio: input.aspectRatio || "3:4" },
      },
    };

    const res = await fetch(`${GEMINI_BASE}/models/${IMAGE_MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini ${res.status}: ${err.slice(0, 300)}`);
    }

    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imgPart = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (!imgPart?.inlineData?.data) {
      throw new Error("Gemini görsel döndürmedi");
    }
    return {
      mimeType: imgPart.inlineData.mimeType || "image/png",
      base64: imgPart.inlineData.data,
    };
  }
}

export const imageProvider: ImageProvider = new GeminiImageProvider();
