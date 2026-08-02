import { useRef, useState, useEffect } from 'react';
import { ArrowUp, Square, Loader2 } from 'lucide-react';
import { useApp } from '@/state/AppStore';

export function Composer() {
  const app = useApp();
  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [text]);

  const send = async () => {
    if (!text.trim() || app.isGenerating) return;
    const t = text;
    setText('');
    await app.sendMessage(t);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const ready = app.loadState.status === 'ready';
  const placeholder = ready
    ? 'Message your offline model…'
    : 'Load a model in the Model Manager to start chatting…';

  return (
    <div className="border-t border-line bg-surface px-4 pb-4 pt-3">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface-raised p-2 shadow-soft transition-colors focus-within:border-accent-500">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={!ready}
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] text-ink placeholder:text-ink-faint focus:outline-none disabled:cursor-not-allowed"
          />
          {app.isGenerating ? (
            <button
              onClick={app.stopGeneration}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-error text-white transition-all hover:brightness-110 active:scale-95"
              aria-label="Stop generation"
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!text.trim() || !ready}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-600 text-white transition-all hover:bg-accent-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint"
              aria-label="Send message"
            >
              {app.isGenerating ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} />}
            </button>
          )}
        </div>
        <p className="mt-1.5 text-center text-[11px] text-ink-faint">
          Runs fully offline. Press Enter to send, Shift+Enter for a new line.
        </p>
      </div>
    </div>
  );
}
