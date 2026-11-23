import type { TourStep } from '@wrack/react-native-tour-guide';
import { createTheme } from '@wrack/react-native-tour-guide';
import type { BottomNavId } from '../../shared/BottomNav';
import { colors } from '../../shared/theme';
import { MercappTooltip } from './MercappTooltip';

/** v3: flecha del tooltip + card centrada en el logo. */
export const MERCAPP_TOUR_ID = 'mercapp-welcome-v3';

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
  doneButtonText: '¡Vamos!',
  renderTooltip: (props: Parameters<typeof MercappTooltip>[0]) => (
    <MercappTooltip {...props} />
  ),
};

export function buildMercappTourSteps(go: (tab: BottomNavId) => void): TourStep[] {
  return [
    {
      id: 'welcome',
      targetId: 'tour-brand',
      title: 'Hola',
      description: 'Esto es MercApp: tu asistente de mercado. Te muestro lo esencial en un minutito.',
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
      title: 'El carrito',
      description: 'Dale a Empezar y suma con el mic o el teclado. El total se mueve solito.',
      targetStyle: { borderRadius: 999 },
      tooltipPosition: 'bottom',
    },
    {
      id: 'nav-recetas',
      targetId: 'tour-nav-recetas',
      title: 'Recetas',
      description: 'Con lo del carrito te sugerimos qué cocinar — cuando tú digas, con o sin IA.',
      targetStyle: { borderRadius: 22 },
      tooltipPosition: 'top',
      before: async () => {
        go('recetas');
        await wait(360);
      },
    },
    {
      id: 'nav-historial',
      targetId: 'tour-nav-historial',
      title: 'Historial',
      description: 'Cada compra que cierras queda aquí, lista para revisarla cuando quieras.',
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
      title: 'Números',
      description: 'Mira en qué se te va la plata: proteína, harinas y compañía, clarito.',
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
      title: 'Gadgets',
      description: 'Arma tu panel: donut, barras, ritmo mensual… solo lo que te importa.',
      targetStyle: { borderRadius: 999 },
      tooltipPosition: 'bottom',
    },
    {
      id: 'nav-ajustes',
      targetId: 'tour-nav-ajustes',
      title: 'Ajustes',
      description: 'Presupuesto, perfil, IA, backup y sync con Delfos. Tus datos se quedan en el teléfono.',
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
      title: 'Listo',
      description: 'Prueba dictar “pollo 25 mil”. Si te pasas del presupuesto, te avisamos sin juicio.',
      targetStyle: { borderRadius: 16 },
      tooltipPosition: 'bottom',
      before: async () => {
        go('mercado');
        await wait(360);
      },
    },
  ];
}
