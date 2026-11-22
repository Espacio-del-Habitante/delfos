import type { TourStep } from '@wrack/react-native-tour-guide';
import { createTheme } from '@wrack/react-native-tour-guide';
import type { BottomNavId } from '../../shared/BottomNav';
import { colors } from '../../shared/theme';

export const MERCAPP_TOUR_ID = 'mercapp-welcome-v1';

export const mercappTourTheme = createTheme({
  tooltipStyles: {
    backgroundColor: '#ffffff',
    titleColor: colors.text,
    descriptionColor: colors.muted,
    buttonTextColor: '#ffffff',
    primaryButtonColor: colors.primary,
    secondaryButtonColor: colors.primaryDark,
    skipButtonColor: colors.muted,
    borderRadius: 20,
  },
  spotlightStyles: {
    overlayColor: '#12241a',
    overlayOpacity: 0.72,
  },
});

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function buildMercappTourSteps(go: (tab: BottomNavId) => void): TourStep[] {
  return [
    {
      id: 'welcome',
      targetId: 'tour-brand',
      title: '🌿 Bienvenido a MercApp',
      description:
        'Tu mercado por voz, local en el teléfono. Vamos a dar una vuelta rápida por lo que puedes hacer.',
      targetStyle: { borderRadius: 16 },
      before: async () => {
        go('mercado');
        await wait(280);
      },
    },
    {
      id: 'carrito',
      targetId: 'tour-start',
      title: '🛒 Abre tu mercado',
      description:
        'Toca Empezar y suma productos con el mic o escribiendo. MercApp categoriza y lleva el total al instante.',
      targetStyle: { borderRadius: 999 },
    },
    {
      id: 'nav-historial',
      targetId: 'tour-nav-historial',
      title: '🕘 Historial de cosechas',
      description:
        'Aquí quedan los mercados cerrados. Entras, ves qué compraste y sincronizas pendientes con Delfos cuando quieras.',
      targetStyle: { borderRadius: 22 },
      before: async () => {
        go('historial');
        await wait(320);
      },
    },
    {
      id: 'nav-stats',
      targetId: 'tour-nav-stats',
      title: '📊 Estadísticas con gadgets',
      description:
        'Donuts, barras y tendencias. Elige qué gráficos ver con el botón Gadgets — tarjetas activas tipo radio.',
      targetStyle: { borderRadius: 22 },
      before: async () => {
        go('stats');
        await wait(320);
      },
    },
    {
      id: 'gadgets',
      targetId: 'tour-gadgets',
      title: '🎛️ Arma tu panel',
      description:
        'Activa o apaga 🍩 donut, 📊 barras, 📈 gasto mensual, 🧺 mercado ideal y más. Todo queda guardado en el teléfono.',
      targetStyle: { borderRadius: 999 },
    },
    {
      id: 'nav-ajustes',
      targetId: 'tour-nav-ajustes',
      title: '⚙️ Ajustes y sync',
      description:
        'Presupuesto, IA (Ollama / nube) y sync por lote a Delfos. También puedes repetir este tour cuando quieras.',
      targetStyle: { borderRadius: 22 },
      before: async () => {
        go('ajustes');
        await wait(320);
      },
    },
    {
      id: 'done',
      targetId: 'tour-brand',
      title: '🎉 Listo para comprar',
      description:
        'Vuelve al carrito, abre un mercado y dicta: “3 libras de papa 18 mil”. ¡A sumar sin pasarte del presupuesto!',
      targetStyle: { borderRadius: 16 },
      before: async () => {
        go('mercado');
        await wait(320);
      },
    },
  ];
}
