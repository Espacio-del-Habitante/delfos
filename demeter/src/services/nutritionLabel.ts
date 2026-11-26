import {
  nutritionLabelPrompt,
  parseNutritionJson,
  type NutritionFacts,
} from '../domain/nutrition';
import { friendlyError } from '../shared/appError';
import { aiReady, completeJsonVision } from './aiComplete';
import { getAiSettings } from './store';
import { pickProductPhoto } from './pickPhoto';

export type NutritionScanResult = {
  nutrition: NutritionFacts | null;
  photoDataUrl: string | null;
  notice?: string;
  noticeTone?: 'info' | 'warn' | 'error';
};

/** Cámara → OCR de tabla nutricional (si hay IA de visión). */
export async function scanNutritionLabel(): Promise<NutritionScanResult> {
  const photoDataUrl = await pickProductPhoto({ camera: true });
  if (!photoDataUrl) {
    return {
      nutrition: null,
      photoDataUrl: null,
      notice: 'No sacamos foto · revisa el permiso de cámara',
      noticeTone: 'warn',
    };
  }

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
        notice: 'No leímos bien la tabla · prueba con más luz o de frente',
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
      notice: friendlyError(e, 'No pudimos leer la etiqueta ahora'),
      noticeTone: 'error',
    };
  }
}
