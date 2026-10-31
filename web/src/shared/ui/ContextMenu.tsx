import { ChevronRight, Pin } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useUi, type MenuItem } from '../model/ui';

/** Single global context menu, opened through `useUi().openMenu`. */
export function ContextMenu() {
  const menu = useUi((s) => s.menu);
  const close = useUi((s) => s.closeMenu);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    setPosition({
      x: Math.min(menu.x, window.innerWidth - width - 6),
      y: Math.min(menu.y, window.innerHeight - height - 6),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', close);
    };
  }, [menu, close]);

  if (!menu) return null;
  return (
    <div className="context-menu" ref={ref} style={{ left: position.x, top: position.y }} role="menu">
      <MenuItems items={menu.items} close={close} />
    </div>
  );
}

function MenuItems({ items, close }: { items: MenuItem[]; close: () => void }) {
  const [openSub, setOpenSub] = useState<number | null>(null);
  const withIcons = items.some((item) => item.icon);
  const withPins = items.some((item) => item.onPin);

  return items.map((item, i) =>
    item.separator ? (
      <div key={i} className="menu-separator" />
    ) : item.header ? (
      <div key={i} className="menu-header">
        {item.header}
      </div>
    ) : (
      <div key={i} className="menu-row" onMouseEnter={() => setOpenSub(item.submenu ? i : null)}>
        <button
          type="button"
          role="menuitem"
          className={`menu-item${item.danger ? ' danger' : ''}${openSub === i ? ' open' : ''}${item.detail ? ' with-detail' : ''}`}
          disabled={item.disabled}
          aria-haspopup={item.submenu ? 'menu' : undefined}
          onClick={() => {
            if (item.submenu) return setOpenSub(i);
            close();
            item.onSelect?.();
          }}
        >
          {withIcons && <span className="menu-icon">{item.icon}</span>}
          {item.detail ? (
            <span className="menu-label">
              {item.label}
              <span className="menu-detail">{item.detail}</span>
            </span>
          ) : (
            <span className="menu-label">{item.label}</span>
          )}
          {item.badge && <span className="menu-badge">{item.badge}</span>}
          {item.shortcut && <kbd>{item.shortcut}</kbd>}
          {item.submenu && <ChevronRight size={12} className="menu-chevron" />}
        </button>
        {withPins && (
          <button
            type="button"
            className={`menu-pin${item.pinned ? ' pinned' : ''}`}
            disabled={!item.onPin}
            aria-label={item.pinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
            title={item.onPin ? (item.pinned ? 'Unpin from Toolbar' : 'Pin to Toolbar') : undefined}
            onClick={item.onPin}
          >
            {item.onPin && <Pin size={12} />}
          </button>
        )}
        {item.submenu && openSub === i && !item.disabled && (
          <div className="context-menu submenu" role="menu">
            <MenuItems items={item.submenu} close={close} />
          </div>
        )}
      </div>
    ),
  );
}
