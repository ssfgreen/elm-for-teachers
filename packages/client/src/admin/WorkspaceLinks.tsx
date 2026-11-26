import { useState } from 'react';
import { Button } from '../components/ui/button';

const linkClass = 'text-primary hover:text-primary-hover';

export function CopyLink({ url, label = 'Copy link' }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="link"
      onClick={() => {
        void navigator.clipboard?.writeText(url).then(() => setCopied(true));
      }}
    >
      {copied ? 'Copied' : label}
    </Button>
  );
}

/**
 * A workspace's links in the admin list: open and copy its link. An account workspace has no
 * link (`url` null): it is reached by signing in.
 */
export function WorkspaceLinks({ url }: { url: string | null }) {
  if (!url) return <span title="An account workspace is reached by signing in">Signs in</span>;
  return (
    <>
      <a className={linkClass} href={url} target="_blank" rel="noreferrer">
        Open
      </a>
      <CopyLink url={url} />
    </>
  );
}
