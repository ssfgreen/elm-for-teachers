import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Check, Copy, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, buttonVariants } from '../components/ui/button';
import { cn } from '../lib/utils';

/**
 * The admin list's small icon buttons: 24px, the ghost look, `label` read out (it names the
 * action and the workspace), `title` shown as the tooltip. `danger` draws it in red.
 */
interface IconProps {
  icon: LucideIcon;
  label: string;
  title: string;
  danger?: boolean;
}

const dangerClass = 'text-destructive hover:enabled:bg-destructive-soft hover:enabled:text-destructive';
/** The ghost look's hover is `hover:enabled:`, which a link never matches, so links get it plainly. */
const linkClass = cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'hover:bg-hover hover:text-foreground');

export function IconButton({ icon: Icon, label, title, danger, className, ...rest }: IconProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'>) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} title={title} className={cn(danger && dangerClass, className)} {...rest}>
      <Icon className="size-4" aria-hidden />
    </Button>
  );
}

/** The same look on a link: `to` stays in the app, `href` opens a new tab. */
export function IconLink({ icon: Icon, label, title, to, href }: IconProps & ({ to: string; href?: never } | { href: string; to?: never })) {
  const inner: ReactNode = <Icon className="size-4" aria-hidden />;
  if (to !== undefined) {
    return (
      <Link className={linkClass} to={to} aria-label={label} title={title}>
        {inner}
      </Link>
    );
  }
  return (
    <a className={linkClass} href={href} target="_blank" rel="noreferrer" aria-label={label} title={title}>
      {inner}
    </a>
  );
}

/** Copies `text`; a tick shows for a moment, and "Copied" is read out. */
export function CopyIcon({ text, label, title }: { text: string; label: string; title: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <>
      <IconButton
        icon={copied ? Check : Copy}
        label={label}
        title={title}
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => setCopied(true));
        }}
      />
      <span className="sr-only" role="status">
        {copied ? 'Copied' : ''}
      </span>
    </>
  );
}
