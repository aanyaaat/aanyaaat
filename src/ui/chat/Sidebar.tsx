import { useState } from 'react';
import {
  MessageSquarePlus,
  Search,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  Download,
  X,
  Check,
} from 'lucide-react';
import { useApp } from '@/state/AppStore';
import type { Chat, ExportFormat } from '@/domain/types';

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const app = useApp();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Chat[] | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [exportId, setExportId] = useState<string | null>(null);

  const list = searchResults ?? app.chats;

  const onSearch = async (q: string) => {
    setQuery(q);
    if (q.trim()) {
      const results = await app.searchChats(q);
      setSearchResults(results);
    } else {
      setSearchResults(null);
    }
  };

  const startRename = (chat: Chat) => {
    setRenamingId(chat.id);
    setRenameValue(chat.title);
  };

  const commitRename = async () => {
    if (renamingId && renameValue.trim()) {
      await app.renameChat(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const doExport = async (chatId: string, format: ExportFormat) => {
    const content = await app.exportChat(chatId, format);
    const chat = app.chats.find((c) => c.id === chatId);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(chat?.title ?? 'chat').replace(/[^a-z0-9]+/gi, '_')}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    setExportId(null);
  };

  return (
    <aside className="flex h-full w-72 flex-col border-r border-line bg-surface-raised">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold text-ink">Conversations</span>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink md:hidden"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* New chat */}
      <div className="px-3 pb-2">
        <button
          onClick={() => app.createChat()}
          className="flex w-full items-center gap-2 rounded-xl bg-accent-600 px-3 py-2.5 text-sm font-medium text-white transition-all hover:bg-accent-700 active:scale-[0.98]"
        >
          <MessageSquarePlus size={18} />
          New chat
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search chats and messages"
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {list.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-ink-faint">
            {query ? 'No matches found.' : 'No conversations yet.'}
          </p>
        )}
        {list.map((chat) => (
          <div
            key={chat.id}
            className={`group mb-0.5 rounded-lg transition-colors ${
              app.activeChatId === chat.id ? 'bg-surface-subtle' : 'hover:bg-surface-subtle'
            }`}
          >
            <div className="flex items-center">
              <button
                onClick={() => {
                  app.selectChat(chat.id);
                  onClose?.();
                }}
                className="flex-1 truncate px-3 py-2.5 text-left text-sm text-ink"
              >
                {renamingId === chat.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onBlur={commitRename}
                    className="w-full rounded border border-accent-500 bg-surface px-1 py-0.5 text-sm text-ink focus:outline-none"
                  />
                ) : (
                  <span className="flex items-center gap-1.5">
                    {chat.pinned && <Pin size={11} className="shrink-0 text-accent-500" />}
                    <span className="truncate">{chat.title}</span>
                  </span>
                )}
              </button>
            </div>

            {/* Row actions */}
            <div className="flex items-center justify-end gap-0.5 px-2 pb-1 opacity-0 transition-opacity group-hover:opacity-100">
              <IconBtn label="Pin" onClick={() => app.togglePin(chat.id)}>
                {chat.pinned ? <PinOff size={14} /> : <Pin size={14} />}
              </IconBtn>
              <IconBtn label="Rename" onClick={() => startRename(chat)}>
                <Pencil size={14} />
              </IconBtn>
              <IconBtn label="Export" onClick={() => setExportId(exportId === chat.id ? null : chat.id)}>
                <Download size={14} />
              </IconBtn>
              <IconBtn label="Delete" onClick={() => app.removeChat(chat.id)}>
                <Trash2 size={14} />
              </IconBtn>
            </div>

            {exportId === chat.id && (
              <div className="flex items-center gap-1 px-3 pb-2 animate-slide-in">
                {(['txt', 'md', 'json'] as ExportFormat[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => doExport(chat.id, f)}
                    className="rounded-md border border-line px-2 py-1 text-xs uppercase text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-line px-4 py-3">
        <p className="text-xs text-ink-faint">
          {app.chats.length} conversation{app.chats.length !== 1 ? 's' : ''} · stored locally
        </p>
      </div>
    </aside>
  );
}

function IconBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-surface hover:text-ink"
    >
      {children}
    </button>
  );
}

export { Check };
