import {
  estimateNutritionForItem,
  nutritionLabelPrompt,
  parseNutritionJson,
  type NutritionFacts,
} from '../domain/nutrition';
import { friendlyError } from '../shared/appError';
import { aiReady, completeJson, completeJsonVision } from './aiComplete';
import { compressImageDataUrl } from './compressImage';
import { getAiSettings } from './store';
import { pickProductPhoto } from './pickPhoto';

export type NutritionScanResult = {
  nutrition: NutritionFacts | null;
  photoDataUrl: string | null;
  notice?: string;
  noticeTone?: 'info' | 'warn' | 'error';
};

function estimatePrompt(name: string, category: string, qty: number, unit: string) {
  return `Estima la tabla nutricional de un producto de mercado en Colombia.
Producto: ${JSON.stringify(name)}
Categoría: ${category}
Cantidad comprada: ${qty} ${unit}
Responde SOLO JSON por el PAQUETE completo comprado (no por porción):
{"servingSize":"paquete","servingsPerPack":1,"kcal":450,"proteinG":20,"carbsG":40,"fatG":12,"fiberG":4,"sugarG":8,"sodiumMg":200,"source":"estimate"}
Sé realista; si no sabes, aproxima.`;
}

/** Cámara → OCR de tabla (visión). Si el modelo es solo texto, falla rápido con aviso. */
export async function scanNutritionLabel(): Promise<NutritionScanResult> {
  const rawPhoto = await pickProductPhoto({ camera: true });
  if (!rawPhoto) {
    return {
      nutrition: null,
      photoDataUrl: null,
      notice: 'No sacamos foto · revisa el permiso de cámara',
      noticeTone: 'warn',
    };
  }
  const photoDataUrl = await compressImageDataUrl(rawPhoto);

  const ai = getAiSettings();
  if (!aiReady(ai)) {
    return {
      nutrition: null,
      photoDataUrl,
      notice: 'Foto lista · enciende Gemini u OpenAI en Ajustes para leer la etiqueta',
      noticeTone: 'warn',
    };
  }

  try {
    const raw = await completeJsonVision(ai, nutritionLabelPrompt(), photoDataUrl);
    const nutrition = parseNutritionJson(raw);
    if (!nutrition) {
      return {
        nutrition: null,
        photoDataUrl,
        notice: 'No leímos bien la tabla · prueba “Estimar con IA” o más luz',
        noticeTone: 'warn',
      };
    }
    return {
      nutrition: { ...nutrition, source: 'label-photo' },
      photoDataUrl,
      notice: 'Etiqueta leída · quedó en el producto',
      noticeTone: 'info',
    };
  } catch (e) {
    return {
      nutrition: null,
      photoDataUrl,
      notice: friendlyError(
        e,
        'Ese modelo no leyó la foto (¿solo texto?). Usa “Estimar con IA” o un modelo con visión.',
      ),
      noticeTone: 'error',
    };
  }
}

/** Sin foto: IA de texto estima macros; si falla, heurística local por categoría. */
export async function estimateNutritionForProduct(item: {
  name: string;
  category: string;
  qty: number;
  unit: string;
}): Promise<NutritionScanResult> {
  const ai = getAiSettings();
  const local = estimateNutritionForItem(item);

  if (!aiReady(ai)) {
    return {
      nutrition: local,
      photoDataUrl: null,
      notice: 'Estimado local (sin IA) · enciende Gemini para afinar',
      noticeTone: 'warn',
    };
  }

  try {
    const raw = await completeJson(
      ai,
      estimatePrompt(item.name, item.category, item.qty, item.unit),
    );
    const nutrition = parseNutritionJson(raw);
    if (!nutrition) {
      return {
        nutrition: local,
        photoDataUrl: null,
        notice: 'La IA no armó números · usamos estimado local',
        noticeTone: 'warn',
      };
    }
    return {
      nutrition: { ...nutrition, source: 'estimate' },
      photoDataUrl: null,
      notice: 'Estimado con IA · sin foto de etiqueta',
      noticeTone: 'info',
    };
  } catch (e) {
    return {
      nutrition: local,
      photoDataUrl: null,
      notice: friendlyError(e, 'IA ocupada · usamos estimado local por categoría'),
      noticeTone: 'warn',
    };
  }
}
