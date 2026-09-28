import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Al cambiar de ruta: vuelve al inicio y entrega el foco al contenido.
 *
 * Sin mover el foco, quien navega con teclado o con lector de pantalla se
 * queda en el footer de la página anterior y no se entera de que cambió el
 * contenido. `main` lleva tabIndex={-1} justamente para recibirlo.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.getElementById('contenido')?.focus({ preventScroll: true });
  }, [pathname]);

  return null;
}
