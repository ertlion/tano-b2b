// AI görsel üretim preset'leri (Epic G) — gorsel-motoru'ndan curated, sade set.
// Prompt İngilizce (Gemini görsel modeli İngilizce'de daha iyi); UI etiketleri Türkçe.

export interface Preset {
  id: string;
  label: string;
  prompt: string;
}

// Mekan / sahne (background)
export const SCENES: Preset[] = [
  { id: "studio_white", label: "Stüdyo (Beyaz)", prompt: "clean professional studio with seamless white background, soft even lighting" },
  { id: "studio_gray", label: "Stüdyo (Gri)", prompt: "professional studio with neutral light gray seamless backdrop, soft shadows" },
  { id: "street_city", label: "Sokak / Şehir", prompt: "urban city street, blurred background, natural daylight, lifestyle setting" },
  { id: "cafe", label: "Kafe", prompt: "cozy modern cafe interior, warm ambient light, shallow depth of field" },
  { id: "nature", label: "Doğa", prompt: "outdoor natural setting with greenery, soft golden hour sunlight" },
  { id: "beach", label: "Plaj", prompt: "sunny beach with sand and sea in soft focus background, bright natural light" },
  { id: "minimal_interior", label: "Minimal İç Mekan", prompt: "minimalist modern interior, neutral tones, large window natural light" },
  { id: "luxury", label: "Lüks Mekan", prompt: "elegant luxury interior, marble and warm tones, premium editorial mood" },
];

// Manken / model özellikleri (gender + body + ethnicity basic combos)
export const MODELS: Preset[] = [
  { id: "female_slim", label: "Kadın - İnce", prompt: "a slim adult female fashion model" },
  { id: "female_curvy", label: "Kadın - Dolgun", prompt: "a curvy plus-size adult female fashion model" },
  { id: "male_athletic", label: "Erkek - Atletik", prompt: "an athletic adult male fashion model" },
  { id: "male_regular", label: "Erkek - Normal", prompt: "a regular build adult male fashion model" },
  { id: "child_girl", label: "Çocuk - Kız", prompt: "a young girl child model" },
  { id: "child_boy", label: "Çocuk - Erkek", prompt: "a young boy child model" },
  { id: "none", label: "Mankensiz (Ürün)", prompt: "no model, product only flat lay / ghost mannequin style" },
];

// Açı / çekim (camera angle + lens)
export const ANGLES: Preset[] = [
  { id: "front_full", label: "Önden - Tam Boy", prompt: "front view, full body shot, eye-level camera, 50mm lens" },
  { id: "front_half", label: "Önden - Bel Üstü", prompt: "front view, waist-up shot, eye-level, 85mm portrait lens" },
  { id: "three_quarter", label: "3/4 Açı", prompt: "three-quarter angle, full body, dynamic editorial pose" },
  { id: "back", label: "Arkadan", prompt: "back view, full body, showing the back of the garment" },
  { id: "side", label: "Yandan", prompt: "side profile view, full body" },
  { id: "detail", label: "Detay / Yakın", prompt: "close-up detail shot of the garment fabric and texture" },
];

export function findPreset(list: Preset[], id: string): Preset | undefined {
  return list.find((p) => p.id === id);
}

/**
 * Seçimlerden Gemini için final prompt üret.
 */
export function buildPrompt(opts: {
  sceneId: string;
  modelId: string;
  angleId: string;
  productName?: string;
  extraNote?: string;
}): string {
  const scene = findPreset(SCENES, opts.sceneId);
  const model = findPreset(MODELS, opts.modelId);
  const angle = findPreset(ANGLES, opts.angleId);

  const parts: string[] = [
    "Professional e-commerce fashion product photograph.",
    "Use the provided product image(s) as the EXACT garment reference — keep the product's color, pattern, fabric and details identical.",
  ];
  if (model && model.id !== "none") {
    parts.push(`The garment is worn by ${model.prompt}.`);
  } else if (model) {
    parts.push(model.prompt + ".");
  }
  if (scene) parts.push(`Scene: ${scene.prompt}.`);
  if (angle) parts.push(`Composition: ${angle.prompt}.`);
  if (opts.productName) parts.push(`Product: ${opts.productName}.`);
  if (opts.extraNote) parts.push(opts.extraNote);
  parts.push(
    "High resolution, photorealistic, sharp focus on the garment, natural realistic skin and fabric, no text or watermark."
  );
  return parts.join(" ");
}
