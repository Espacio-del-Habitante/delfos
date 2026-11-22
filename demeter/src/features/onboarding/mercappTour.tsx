import type { TourStep } from '@wrack/react-native-tour-guide';
import { createTheme } from '@wrack/react-native-tour-guide';
import type { BottomNavId } from '../../shared/BottomNav';
import { colors } from '../../shared/theme';
import { MercappTooltip } from './MercappTooltip';

/** v2: nuevo visual + copys (fuerza un replay limpio). */
export const MERCAPP_TOUR_ID = 'mercapp-welcome-v2';

export const mercappTourTheme = createTheme({
  tooltipStyles: {
    backgroundColor: '#ffffff',
    titleColor: colors.text,
    descriptionColor: colors.muted,
    buttonTextColor: '#ffffff',
    primaryButtonColor: colors.primary,
    secondaryButtonColor: '#ffffff',
    skipButtonColor: colors.muted,
    borderRadius: 28,
  },
  spotlightStyles: {
    overlayColor: '#0c1a12',
    overlayOpacity: 0.78,
    enablePulse: true,
    pulseColor: '#86efac',
    pulseWidth: 2,
    pulseDuration: 1600,
  },
});

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const mercappTourConfig = {
  tourId: MERCAPP_TOUR_ID,
  ...mercappTourTheme,
  motion: 'morph' as const,
  showProgressDots: false,
  showStepCounter: false,
  tooltipWidth: 312,
  tooltipOffset: 18,
  nextButtonText: 'Siguiente',
  prevButtonText: 'Atrás',
  skipButtonText: 'Omitir',
  doneButtonText: 'Empezar',
  renderTooltip: (props: Parameters<typeof MercappTooltip>[0]) => (
    <MercappTooltip {...props} />
  ),
};

export function buildMercappTourSteps(go: (tab: BottomNavId) => void): TourStep[] {
  return [
    {
      id: 'welcome',
      targetId: 'tour-brand',
      title: '👋 Hola',
      description: 'Esto es MercApp. Te muestro lo esencial en menos de un minuto.',
      targetStyle: { borderRadius: 16 },
      tooltipPosition: 'bottom',
      before: async () => {
        go('mercado');
        await wait(320);
      },
    },
    {
      id: 'carrito',
      targetId: 'tour-start',
      title: '🛒 El carrito',
      description: 'Toca Empezar y suma con el mic o el teclado. El total se mueve solo.',
      targetStyle: { borderRadius: 999 },
      tooltipPosition: 'bottom',
    },
    {
      id: 'nav-historial',
      targetId: 'tour-nav-historial',
      title: '🕘 Historial',
      description: 'Cada mercado que cierras queda guardado aquí, listo para revisarlo.',
      targetStyle: { borderRadius: 22 },
      tooltipPosition: 'top',
      before: async () => {
        go('historial');
        await wait(360);
      },
    },
    {
      id: 'nav-stats',
      targetId: 'tour-nav-stats',
      title: '📊 Números',
      description: 'Mira en qué se te va la plata: proteína, harinas y lo demás, en gráficos claros.',
      targetStyle: { borderRadius: 22 },
      tooltipPosition: 'top',
      before: async () => {
        go('stats');
        await wait(360);
      },
    },
    {
      id: 'gadgets',
      targetId: 'tour-gadgets',
      title: '🎛️ Gadgets',
      description: 'Arma tu panel: donut, barras, ritmo mensual… solo lo que te importa.',
      targetStyle: { borderRadius: 999 },
      tooltipPosition: 'bottom',
    },
    {
      id: 'nav-ajustes',
      targetId: 'tour-nav-ajustes',
      title: '⚙️ Ajustes',
      description: 'Presupuesto, IA y sync con Delfos. Tus datos se quedan en el teléfono.',
      targetStyle: { borderRadius: 22 },
      tooltipPosition: 'top',
      before: async () => {
        go('ajustes');
        await wait(360);
      },
    },
    {
      id: 'done',
      targetId: 'tour-brand',
      title: '✨ Listo',
      description: 'Prueba dictar “pollo 25 mil”. Si te pasas del presupuesto, MercApp te avisa.',
      targetStyle: { borderRadius: 16 },
      tooltipPosition: 'bottom',
      before: async () => {
        go('mercado');
        await wait(360);
      },
    },
  ];
}
