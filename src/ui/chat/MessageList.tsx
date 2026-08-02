import { useState } from 'react';
import {
  Copy,
  Check,
  Pencil,
  Trash2,
  RefreshCw,
  User,
  Bot,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '@/state/AppStore';
import { Markdown } from '@/ui/components/Markdown';
import type { Message } from '@/domain/types';

export function MessageList() {
  const app = useApp();
  const { messages, streamingMessageId, streamingText, isGenerating } = app;

  if (messages.length === 0 && !isGenerating) {
    return <EmptyState />;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}

      {/* Streaming assistant message */}
      {isGenerating && streamingMessageId && (
        <div className="mb-6 animate-fade-in">
          <div className="flex gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-600 text-white">
              <Bot size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-xs font-medium text-ink-muted">Assistant</div>
              <div className="md-content text-[15px] leading-relaxed text-ink">
                {streamingText}
                <span className="ml-0.5 inline-block h-4 w-1.5 animate-blink-caret bg-accent-500 align-middle" />
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

  return (
    <div className="group mb-6 animate-fade-in">
      <div className="flex gap-3">
        <div
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
            isUser ? 'bg-surface-subtle text-ink-muted' : 'bg-accent-600 text-white'
          }`}
        >
          {isUser ? <User size={15} /> : <Bot size={15} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium text-ink-muted">
              {isUser ? 'You' : 'Assistant'}
            </span>
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
                className="w-full rounded-xl border border-accent-500 bg-surface p-3 text-[15px] text-ink focus:outline-none"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={commitEdit}
                  className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700"
                >
                  Save &amp; resend
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-muted hover:bg-surface-subtle"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`text-[15px] leading-relaxed ${
                isError ? 'text-error' : 'text-ink'
              }`}
            >
              {isError ? (
                <p className="flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>{message.content}</span>
                </p>
              ) : (
                <Markdown content={message.content} />
              )}
            </div>
          )}

          {/* Actions */}
          {!editing && (
            <div className="mt-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <MsgBtn label={copied ? 'Copied' : 'Copy'} onClick={copy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </MsgBtn>
              {isUser && (
                <MsgBtn label="Edit" onClick={() => setEditing(true)}>
                  <Pencil size={14} />
                </MsgBtn>
              )}
              {!isUser && !isError && (
                <MsgBtn
                  label="Regenerate"
                  onClick={() => app.regenerate(message.id)}
                  disabled={app.isGenerating}
                >
                  <RefreshCw size={14} />
                </MsgBtn>
              )}
              <MsgBtn label="Delete" onClick={() => app.deleteMessage(message.id)}>
                <Trash2 size={14} />
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
      className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-surface-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function EmptyState() {
  const app = useApp();
  const hasModel = app.loadState.status === 'ready';
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center animate-fade-in">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-600 text-white shadow-float">
        <Bot size={30} />
      </div>
      <h2 className="mb-2 text-2xl font-bold text-ink">Offline AI Chat</h2>
      <p className="mb-1 max-w-md text-[15px] text-ink-muted">
        Chat with a language model running entirely on your device. No internet, no cloud, no tracking.
      </p>
      {!hasModel && (
        <p className="mt-4 max-w-sm text-sm text-ink-faint">
          No model loaded yet. Open the Model Manager, pick a model (it downloads once to your device), then start chatting. Everything runs locally after that.
        </p>
      )}
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          'Explain quantization in simple terms',
          'Write a Kotlin coroutine example',
          'Draft a polite follow-up email',
          'Summarize the sliding window technique',
        ].map((s) => (
          <button
            key={s}
            onClick={() => app.sendMessage(s)}
            disabled={!hasModel}
            className="rounded-xl border border-line bg-surface-raised px-4 py-3 text-left text-sm text-ink-muted transition-all hover:border-accent-400 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
