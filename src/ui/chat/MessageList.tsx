import { useState } from 'react';
import {
  Copy,
  Check,
  Pencil,
  Trash2,
  RefreshCw,
  Heart,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { useApp } from '@/state/AppStore';
import { Markdown } from '@/ui/components/Markdown';
import { getGreeting } from '@/ui/utils/greetings';
import type { Message } from '@/domain/types';

export function MessageList() {
  const app = useApp();
  const { messages, streamingMessageId, streamingText, isGenerating } = app;

  if (messages.length === 0 && !isGenerating) {
    return <EmptyState />;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}

      {/* Streaming assistant message */}
      {isGenerating && streamingMessageId && (
        <div className="mb-6 flex justify-start animate-bubble-in">
          <div className="flex max-w-[65%] gap-2.5">
            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-200 text-accent-700">
              <Heart size={15} fill="currentColor" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 text-xs font-medium text-ink-faint">Aanyaa is thinking…</div>
              <div className="rounded-[28px] rounded-tl-lg bg-surface-raised px-5 py-3.5 shadow-card">
                <div className="md-content text-[15px] leading-relaxed text-ink">
                  {streamingText ? (
                    <>
                      {streamingText}
                      <span className="ml-0.5 inline-block h-4 w-1.5 animate-blink-caret bg-accent-400 align-middle" />
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5 py-1">
                      <span className="h-2 w-2 rounded-full bg-accent-300 aanyaa-dot" style={{ animationDelay: '0ms' }} />
                      <span className="h-2 w-2 rounded-full bg-accent-300 aanyaa-dot" style={{ animationDelay: '160ms' }} />
                      <span className="h-2 w-2 rounded-full bg-accent-300 aanyaa-dot" style={{ animationDelay: '320ms' }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const app = useApp();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);

  const isUser = message.role === 'user';
  const isError = message.content.startsWith('*Error:');

  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const commitEdit = async () => {
    setEditing(false);
    if (editText.trim() && editText !== message.content) {
      await app.editUserMessage(message.id, editText);
    }
  };

  if (isUser) {
    return (
      <div className="group mb-6 flex justify-end animate-bubble-in">
        <div className="flex max-w-[65%] flex-col items-end">
          {editing ? (
            <div className="w-full animate-scale-in">
              <textarea
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={4}
                className="w-full rounded-[20px] border border-accent-400 bg-surface-raised p-4 text-[15px] text-ink shadow-input focus:outline-none"
              />
              <div className="mt-2.5 flex justify-end gap-2">
                <button
                  onClick={commitEdit}
                  className="rounded-full bg-accent-400 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-accent-500 active:scale-95"
                >
                  Save &amp; resend
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="rounded-full border border-line px-4 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-subtle"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-[28px] rounded-tr-lg bg-accent-200 px-5 py-3 text-[15px] leading-relaxed text-white shadow-card">
                <div className="md-content md-content-user">
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100">
                <MsgBtn label={copied ? 'Copied' : 'Copy'} onClick={copy}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </MsgBtn>
                <MsgBtn label="Edit" onClick={() => setEditing(true)}>
                  <Pencil size={13} />
                </MsgBtn>
                <MsgBtn label="Delete" onClick={() => app.deleteMessage(message.id)}>
                  <Trash2 size={13} />
                </MsgBtn>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Assistant
  return (
    <div className="group mb-6 flex justify-start animate-bubble-in">
      <div className="flex max-w-[65%] gap-2.5">
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-200 text-accent-700">
          <Heart size={15} fill="currentColor" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-xs font-medium text-ink-faint">Aanyaa</span>
            {message.tokensPerSecond !== undefined && (
              <span className="text-[11px] text-ink-faint">
                {message.tokensPerSecond} tok/s · {message.generatedTokens} tokens
              </span>
            )}
          </div>

          {editing ? (
            <div className="animate-scale-in">
              <textarea
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={4}
                className="w-full rounded-[20px] border border-accent-400 bg-surface-raised p-4 text-[15px] text-ink shadow-input focus:outline-none"
              />
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={commitEdit}
                  className="rounded-full bg-accent-400 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-accent-500 active:scale-95"
                >
                  Save &amp; resend
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="rounded-full border border-line px-4 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-subtle"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`rounded-[28px] rounded-tl-lg px-5 py-3.5 shadow-card ${
                isError ? 'bg-error/5' : 'bg-surface-raised'
              }`}
            >
              {isError ? (
                <p className="flex items-start gap-2 text-[15px] leading-relaxed text-error">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>{message.content}</span>
                </p>
              ) : (
                <div className="text-[15px] leading-relaxed text-ink">
                  <Markdown content={message.content} />
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          {!editing && (
            <div className="mt-1.5 flex items-center gap-0.5 pl-1 opacity-0 transition-opacity group-hover:opacity-100">
              <MsgBtn label={copied ? 'Copied' : 'Copy'} onClick={copy}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </MsgBtn>
              {!isError && (
                <MsgBtn
                  label="Regenerate"
                  onClick={() => app.regenerate(message.id)}
                  disabled={app.isGenerating}
                >
                  <RefreshCw size={13} />
                </MsgBtn>
              )}
              <MsgBtn label="Delete" onClick={() => app.deleteMessage(message.id)}>
                <Trash2 size={13} />
              </MsgBtn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MsgBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-full p-1.5 text-ink-faint transition-colors hover:bg-surface-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function EmptyState() {
  const app = useApp();
  const hasModel = app.loadState.status === 'ready';
  const greeting = getGreeting();

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center animate-fade-in">
      <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-accent-100 text-accent-400 shadow-float aanyaa-breathe">
        <Heart size={44} fill="currentColor" />
      </div>

      <p className="text-2xl text-ink-muted">
        {greeting.text} <span className="text-accent-400">{greeting.emoji}</span>
      </p>

      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-faint">
        ♡ I'm here whenever you'd like to chat.
      </p>

      {!hasModel && (
        <div className="mt-8 max-w-sm rounded-3xl border border-line bg-surface-raised p-5 text-left shadow-card">
          <p className="text-sm leading-relaxed text-ink-muted">
            Let's get started — open the Model Manager up top, pick a model (it downloads once to your device), then we can chat. Everything runs locally after that.
          </p>
          <button
            onClick={() => {
              const btn = document.querySelector<HTMLButtonElement>('button[aria-label="Models"]');
              btn?.click();
            }}
            className="mt-4 flex items-center gap-2 rounded-full bg-accent-200 px-5 py-2.5 text-sm font-medium text-accent-700 transition-all hover:bg-accent-300 active:scale-95"
          >
            <Sparkles size={15} />
            Choose a model
          </button>
        </div>
      )}

      {hasModel && (
        <div className="mt-10 grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            'Tell me something nice about today',
            'Write a Kotlin coroutine example',
            'I need some gentle encouragement',
            'Explain quantization in simple terms',
          ].map((s) => (
            <button
              key={s}
              onClick={() => app.sendMessage(s)}
              className="rounded-2xl border border-line bg-surface-raised px-5 py-3.5 text-left text-sm text-ink-muted transition-all hover:border-accent-300 hover:shadow-card-hover hover:-translate-y-0.5 hover:text-ink active:scale-[0.98]"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
