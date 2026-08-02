import { useRef, useState, useEffect } from 'react';
import { ArrowUp, Square, Loader2 } from 'lucide-react';
import { useApp } from '@/state/AppStore';
import { getInitialPlaceholder, getPlaceholder } from '@/ui/utils/greetings';

export function Composer() {
  const app = useApp();
  const [text, setText] = useState('');
  const [placeholder, setPlaceholder] = useState(getInitialPlaceholder());
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [text]);

  // Rotate placeholder periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (!text) setPlaceholder(getPlaceholder());
    }, 5000);
    return () => clearInterval(interval);
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
  const currentPlaceholder = ready
    ? placeholder
    : 'Load a model up top and we can start chatting…';

  return (
    <div className="bg-gradient-to-t from-surface via-surface to-surface/0 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-end gap-2.5 rounded-full border border-line bg-surface-raised p-2 pl-5 shadow-input transition-all focus-within:border-accent-300 focus-within:shadow-float">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={currentPlaceholder}
            rows={1}
            disabled={!ready}
            className="flex-1 resize-none bg-transparent py-2 text-[15px] text-ink placeholder:text-ink-faint focus:outline-none disabled:cursor-not-allowed"
          />
          {app.isGenerating ? (
            <button
              onClick={app.stopGeneration}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error text-white transition-all hover:brightness-105 active:scale-95"
              aria-label="Stop generation"
            >
              <Square size={15} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!text.trim() || !ready}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-300 text-white transition-all hover:bg-accent-400 active:scale-95 disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-faint disabled:shadow-none"
              aria-label="Send message"
            >
              {app.isGenerating ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} />}
            </button>
          )}
        </div>
        <p className="mt-2.5 text-center text-[11px] text-ink-faint">
          Always here, even offline. Press Enter to send, Shift+Enter for a new line.
        </p>
      </div>
    </div>
  );
}
