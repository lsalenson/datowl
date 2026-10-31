import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  tone?: 'default' | 'run' | 'stop' | 'accent';
  active?: boolean;
  size?: number;
}

export function IconButton({ icon: Icon, label, shortcut, tone = 'default', active, size = 16, className, ...rest }: Props) {
  return (
    <button
      type="button"
      className={`icon-btn tone-${tone}${active ? ' active' : ''}${className ? ` ${className}` : ''}`}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      {...rest}
    >
      <Icon size={size} strokeWidth={1.75} />
    </button>
  );
}
