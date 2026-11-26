import { PanelLeftOpen, SquarePen } from 'lucide-react';
import { IconButton } from '../editor/Toolbar.js';

/**
 * With the sidebar closed, the header beside it opens it, and can start a new chat. On a phone
 * (`compact`) it is the one button, so the document's title keeps its room; New chat is in the
 * sidebar.
 */
export function SidebarOpener({ onOpen, onNew, busy, compact }: { onOpen: () => void; onNew: () => void; busy?: boolean; compact?: boolean }) {
  return (
    <div className="flex flex-none items-center gap-px">
      <IconButton icon={PanelLeftOpen} label="Open sidebar" tipAlign="start" onClick={onOpen} />
      {!compact && <IconButton icon={SquarePen} label="New chat" tipAlign="start" disabled={busy} onClick={onNew} />}
    </div>
  );
}
