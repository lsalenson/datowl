import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
  /** Extra content on the right of the header. */
  aside?: ReactNode;
  /** Off for dialogs holding typed input: a stray click must not lose it. */
  dismissOnBackdrop?: boolean;
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]';

// Modals stack (a confirmation over Data Sources): the page stays inert until the last one closes.
let openModals = 0;
function setPageInert(inert: boolean) {
  document.querySelectorAll<HTMLElement>('.topbar, .workspace, .statusbar').forEach((el) => {
    el.inert = inert;
  });
}

export function Modal({ title, onClose, width = 480, children, footer, aside, dismissOnBackdrop = true }: Props) {
  const backdrop = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);

  useEffect(() => {
    // Only the topmost modal answers Escape (a confirmation over the Data Sources dialog).
    const onKey = (e: globalThis.KeyboardEvent) => {
      const modals = document.querySelectorAll('.modal-backdrop');
      if (e.key === 'Escape' && modals[modals.length - 1] === backdrop.current) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const node = dialog.current!;
    openModals++;
    setPageInert(true);
    if (!node.contains(document.activeElement)) (node.querySelector<HTMLElement>(FOCUSABLE) ?? node).focus();
    return () => {
      openModals--;
      if (openModals === 0) setPageInert(false);
      // StrictMode re-runs this effect on a node that stays in the page.
      if (!node.isConnected && opener.current?.isConnected) opener.current.focus();
    };
  }, []);

  const trapTab = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const items = [...dialog.current!.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return e.preventDefault();
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialog.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={backdrop}
      className="overlay modal-backdrop"
      onMouseDown={(e) => dismissOnBackdrop && e.target === e.currentTarget && onClose()}
    >
      <div ref={dialog} className="modal" style={{ width }} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={trapTab}>
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
