import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTourPersistence } from '@wrack/react-native-tour-guide';
import type { BottomNavId } from '../../shared/BottomNav';
import { buildMercappTourSteps, MERCAPP_TOUR_ID, mercappTourConfig } from './mercappTour';

type Props = {
  go: (tab: BottomNavId) => void;
  /** Incrementar desde Ajustes para forzar el tour otra vez. */
  forceToken?: number;
};

/**
 * Arranca el walkthrough una vez (o cuando forceToken cambia).
 */
export function TourBootstrap({ go, forceToken = 0 }: Props) {
  const { startTour, resetTour } = useTourPersistence(AsyncStorage);
  const goRef = useRef(go);
  goRef.current = go;
  const autoStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const steps = buildMercappTourSteps((tab) => goRef.current(tab));
      if (forceToken > 0) {
        await resetTour(MERCAPP_TOUR_ID);
        if (cancelled) return;
        await startTour(steps, mercappTourConfig, true);
        return;
      }
      if (autoStarted.current) return;
      autoStarted.current = true;
      await new Promise((r) => setTimeout(r, 700));
      if (cancelled) return;
      await startTour(steps, mercappTourConfig);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [forceToken, resetTour, startTour]);

  return null;
}
