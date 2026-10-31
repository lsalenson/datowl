import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
  /** Extra content on the right of the header. */
  aside?: ReactNode;
}

export function Modal({ title, onClose, width = 480, children, footer, aside }: Props) {
  const backdrop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Only the topmost modal answers Escape (a confirmation over the Data Sources dialog).
    const onKey = (e: KeyboardEvent) => {
      const modals = document.querySelectorAll('.modal-backdrop');
      if (e.key === 'Escape' && modals[modals.length - 1] === backdrop.current) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div ref={backdrop} className="overlay modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }} role="dialog" aria-label={title}>
        <header className="modal-header">
          <h2>{title}</h2>
          {aside}
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}
