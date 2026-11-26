/** The chats started for a class or a year group, newest first. */
import type { Thread } from '@edw/shared';
import { shortDate } from './styles';

export function ChatList({ chats, onOpenChat, empty }: { chats: Thread[]; onOpenChat: (threadId: string) => void; empty: string }) {
  const newest = [...chats].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  return (
    <section aria-label="Chats">
      <h2 className="mx-0 mt-4 mb-0 text-base font-semibold">Chats</h2>
      {newest.length === 0 ? (
        <p className="m-0 text-md text-muted-foreground">{empty}</p>
      ) : (
        <ul className="m-0 list-none border-t border-border p-0">
          {newest.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="flex w-full items-baseline justify-between gap-4 rounded-none border-0 border-b border-border bg-transparent px-1.5 py-3 text-left hover:enabled:bg-hover"
                onClick={() => onOpenChat(t.id)}
              >
                <span className="min-w-0 truncate">{t.title}</span>
                <span className="flex-none text-sm text-muted-foreground">{shortDate(t.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
