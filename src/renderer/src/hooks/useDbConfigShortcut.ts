/**
 * @file useDbConfigShortcut.ts
 * @description Detecta `Shift+F10` e controla a visibilidade do painel de configuração.
 */

import { useEffect, useState } from 'react';

export function useDbConfigShortcut() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.shiftKey && e.key === 'F10') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { isOpen, setIsOpen };
}
