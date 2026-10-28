// Source: https://ui.shadcn.com/r/styles/new-york-v4/dropdown-menu.json (MIT).
// Attribution and full license: THIRD-PARTY-LICENSES.txt.
import { forwardRef, useLayoutEffect, useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import * as Collapsible from '@radix-ui/react-collapsible';

export function Icon({ name, ...props }) {
  const paths = {
    chevron: 'm6 9 6 6 6-6',
    check: 'm5 12 4 4L19 6',
    plus: 'M12 5v14M5 12h14',
    copy: 'M9 9h11v11H9zM15 5V3H3v12h2',
    user: 'M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0M16 10a4 4 0 1 0-8 0 4 4 0 0 0 8 0M6 20a6 6 0 0 1 12 0',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
  };
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
export const Button = forwardRef(function Button(
  { className = '', variant = 'secondary', type = 'button', ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={`button button-${variant} ${className}`} {...props} />
  );
});
export const Input = forwardRef(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={`input ${className}`} {...props} />;
});
export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuRadioGroup = Menu.RadioGroup;
export const DropdownMenuItem = forwardRef(function DropdownMenuItem(
  { className = '', ...props },
  ref,
) {
  return <Menu.Item ref={ref} className={`menu-item ${className}`} {...props} />;
});
export function DropdownMenuRadioItem({ children, ...props }) {
  return (
    <Menu.RadioItem className="menu-item menu-radio" {...props}>
      <span className="selection">
        <Menu.ItemIndicator>
          <Icon name="check" />
        </Menu.ItemIndicator>
      </span>
      {children}
    </Menu.RadioItem>
  );
}
export function DropdownMenuSeparator() {
  return <Menu.Separator className="menu-divider" />;
}
export function DropdownMenuContent({ children, className = '', reserveSpace = false, ...props }) {
  const [node, setNode] = useState(null);
  useLayoutEffect(() => {
    if (!reserveSpace || !node) return;
    // A settings webview auto-sizes from flow content. Portal overlays alone
    // cannot grow it; reserve their measured height without a fixed iframe size.
    const root = document.getElementById('root');
    const update = () => {
      root.style.minHeight = `${node.getBoundingClientRect().bottom + window.scrollY + 8}px`;
    };
    const observer = new ResizeObserver(update);
    observer.observe(node);
    update();
    return () => {
      observer.disconnect();
      root.style.minHeight = '';
    };
  }, [reserveSpace, node]);
  return (
    <Menu.Portal>
      <Menu.Content
        ref={setNode}
        sideOffset={8}
        align="end"
        collisionPadding={8}
        avoidCollisions={!reserveSpace}
        className={`menu-content ${className}`}
        {...props}
      >
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}
export function Disclosure({
  id,
  title,
  description,
  open,
  onOpenChange,
  children,
  className = '',
}) {
  return (
    <Collapsible.Root id={id} className={className} open={open} onOpenChange={onOpenChange}>
      <Collapsible.Trigger className="disclosure-trigger">
        <span className="disclosure-label">{title}</span>
        {description && <span className="hint disclosure-description">{description}</span>}
        <Icon name="chevron" />
      </Collapsible.Trigger>
      <Collapsible.Content forceMount hidden={!open} className="disclosure-content">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
