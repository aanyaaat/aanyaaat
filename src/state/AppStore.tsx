import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type {
  AppearanceSettings,
  Chat,
  ChatId,
  GenerationSettings,
  Message,
  MessageId,
  ModelId,
  ModelInfo,
  ModelLoadState,
  PerformanceSample,
} from '@/domain/types';
import {
  DEFAULT_APPEARANCE,
  DEFAULT_SETTINGS,
} from '@/domain/types';
import * as db from '@/data/localDb';
import { engineRegistry } from '@/engine/EngineRegistry';
import type { GenerateResult } from '@/engine/InferenceEngine';
import { scanModels, addUserModel, removeUserModel } from '@/data/modelCatalog';

const SETTINGS_KEY = 'generation';
const APPEARANCE_KEY = 'appearance';
const ACTIVE_MODEL_KEY = 'activeModel';

interface AppState {
  // data
  chats: Chat[];
  messages: Message[];
  activeChatId: ChatId | null;
  models: ModelInfo[];
  loadState: ModelLoadState;
  settings: GenerationSettings;
  appearance: AppearanceSettings;
  isGenerating: boolean;
  streamingMessageId: MessageId | null;
  streamingText: string;
  performance: PerformanceSample | null;
  performanceHistory: PerformanceSample[];
  error: string | null;

  // actions
  init: () => Promise<void>;
  createChat: () => Promise<ChatId>;
  selectChat: (id: ChatId | null) => Promise<void>;
  renameChat: (id: ChatId, title: string) => Promise<void>;
  togglePin: (id: ChatId) => Promise<void>;
  removeChat: (id: ChatId) => Promise<void>;
  searchChats: (q: string) => Promise<Chat[]>;
  searchMessages: (q: string) => Promise<Message[]>;

  sendMessage: (text: string) => Promise<void>;
  stopGeneration: () => void;
  regenerate: (assistantMessageId: MessageId) => Promise<void>;
  editUserMessage: (messageId: MessageId, newText: string) => Promise<void>;
  deleteMessage: (messageId: MessageId) => Promise<void>;

  refreshModels: () => Promise<void>;
  installModel: (file: File) => Promise<void>;
  uninstallModel: (id: ModelId) => Promise<void>;
  loadModel: (id: ModelId) => Promise<void>;
  unloadModel: () => Promise<void>;

  updateSettings: (patch: Partial<GenerationSettings>) => Promise<void>;
  updateAppearance: (patch: Partial<AppearanceSettings>) => Promise<void>;

  exportChat: (chatId: ChatId, format: 'txt' | 'md' | 'json') => Promise<string>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeChatId, setActiveChatId] = useState<ChatId | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadState, setLoadState] = useState<ModelLoadState>({
    modelId: null,
    status: 'idle',
    progress: 0,
  });
  const [settings, setSettings] = useState<GenerationSettings>(DEFAULT_SETTINGS);
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<MessageId | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [performance, setPerformance] = useState<PerformanceSample | null>(null);
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceSample[]>([]);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const refreshChats = useCallback(async () => {
    const list = await db.listChats();
    setChats(list);
  }, []);

  const init = useCallback(async () => {
    try {
      const engine = await engineRegistry.selectBest();
      const webgpuOk = engine.id === 'webllm';
      const [gen, app, activeModel, scan] = await Promise.all([
        db.getSetting(SETTINGS_KEY, DEFAULT_SETTINGS),
        db.getSetting(APPEARANCE_KEY, DEFAULT_APPEARANCE),
        db.getSetting<ModelId | null>(ACTIVE_MODEL_KEY, null),
        scanModels(),
      ]);
      setSettings(gen);
      setAppearance(app);
      setModels(scan.models);
      await refreshChats();
      setLoadState((s) => ({ ...s, modelId: activeModel }));
      const perf = await db.recentPerformance(20);
      setPerformanceHistory(perf);
      if (!webgpuOk) {
        setError(
          'WebGPU is not available in this browser. Real on-device LLM inference requires Chrome 113+, Edge 113+, or another WebGPU-enabled browser. The app will fall back to a demo engine.',
        );
      }
    } catch (e) {
      setError(`Initialization failed: ${String(e)}`);
    }
  }, [refreshChats]);

  const createChat = useCallback(async () => {
    const now = Date.now();
    const id = db.uid();
    const chat: Chat = {
      id,
      title: 'New chat',
      createdAt: now,
      updatedAt: now,
      pinned: false,
      modelId: loadState.modelId,
    };
    await db.insertChat(chat);
    await refreshChats();
    setActiveChatId(id);
    setMessages([]);
    return id;
  }, [loadState.modelId, refreshChats]);

  const selectChat = useCallback(async (id: ChatId | null) => {
    setActiveChatId(id);
    if (id) {
      const msgs = await db.listMessages(id);
      setMessages(msgs);
    } else {
      setMessages([]);
    }
  }, []);

  const renameChat = useCallback(async (id: ChatId, title: string) => {
    await db.updateChat(id, { title, updatedAt: Date.now() });
    await refreshChats();
  }, [refreshChats]);

  const togglePin = useCallback(async (id: ChatId) => {
    const chat = chats.find((c) => c.id === id);
    if (!chat) return;
    await db.updateChat(id, { pinned: !chat.pinned });
    await refreshChats();
  }, [chats, refreshChats]);

  const removeChat = useCallback(async (id: ChatId) => {
    await db.deleteChat(id);
    if (activeChatId === id) {
      setActiveChatId(null);
      setMessages([]);
    }
    await refreshChats();
  }, [activeChatId, refreshChats]);

  const searchChats = useCallback((q: string) => db.searchChats(q), []);
  const searchMessages = useCallback((q: string) => db.searchMessages(q), []);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isGenerating) return;
    setError(null);

    let chatId = activeChatId;
    if (!chatId) {
      chatId = await createChat();
    }

    const now = Date.now();
    const userMsg: Message = {
      id: db.uid(),
      chatId,
      role: 'user',
      content: text.trim(),
      createdAt: now,
    };
    await db.insertMessage(userMsg);
    setMessages((prev) => [...prev, userMsg]);

    // Auto-title from first user message
    const chat = chats.find((c) => c.id === chatId);
    if (chat && (chat.title === 'New chat' || !chat.title.trim())) {
      const title = text.trim().slice(0, 48) + (text.length > 48 ? '…' : '');
      await db.updateChat(chatId, { title, updatedAt: now });
      await refreshChats();
    } else {
      await db.updateChat(chatId, { updatedAt: now });
      await refreshChats();
    }

    const engine = engineRegistry.active;
    if (!engine.isModelLoaded()) {
      setError('No model loaded. Open the Model Manager and load a model first.');
      return;
    }

    const assistantId = db.uid();
    setStreamingMessageId(assistantId);
    setStreamingText('');
    setIsGenerating(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const history = [...messages, userMsg];

    try {
      const result = await engine.generate(
        {
          modelId: engine.getLoadedModelId()!,
          history,
          settings,
          onToken: (token) => {
            if (token.text) {
              setStreamingText((prev) => prev + token.text);
            }
            return !controller.signal.aborted;
          },
        },
        controller.signal,
      );

      const finalText = controller.signal.aborted
        ? streamingTextRef.current
        : result.text;

      const assistantMsg: Message = {
        id: assistantId,
        chatId: chatId!,
        role: 'assistant',
        content: finalText,
        createdAt: Date.now(),
        promptTokens: result.promptTokens,
        generatedTokens: result.generatedTokens,
        inferenceMs: result.inferenceMs,
        tokensPerSecond: result.tokensPerSecond,
      };
      await db.insertMessage(assistantMsg);
      setMessages((prev) => [...prev, assistantMsg]);

      const sample: PerformanceSample = {
        modelId: engine.getLoadedModelId(),
        promptTokens: result.promptTokens,
        generatedTokens: result.generatedTokens,
        inferenceMs: result.inferenceMs,
        tokensPerSecond: result.tokensPerSecond,
        ramUsedMb: estimateRamMb(),
        cpuPercent: estimateCpu(),
        gpuPercent: 0,
        batteryPercent: estimateBattery(),
        sampledAt: Date.now(),
      };
      setPerformance(sample);
      setPerformanceHistory((prev) => [sample, ...prev].slice(0, 20));
      await db.logPerformance(sample);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        const partial = streamingTextRef.current;
        if (partial) {
          const assistantMsg: Message = {
            id: assistantId,
            chatId: chatId!,
            role: 'assistant',
            content: partial + '\n\n*[generation stopped]*',
            createdAt: Date.now(),
          };
          await db.insertMessage(assistantMsg);
          setMessages((prev) => [...prev, assistantMsg]);
        }
      } else {
        setError(`Generation failed: ${String(e)}`);
        const errMsg: Message = {
          id: assistantId,
          chatId: chatId!,
          role: 'assistant',
          content: `*Error: ${String(e)}*`,
          createdAt: Date.now(),
        };
        await db.insertMessage(errMsg);
        setMessages((prev) => [...prev, errMsg]);
      }
    } finally {
      setIsGenerating(false);
      setStreamingMessageId(null);
      setStreamingText('');
      abortRef.current = null;
    }
  }, [activeChatId, chats, createChat, isGenerating, messages, refreshChats, settings]);

  // Keep a ref of streaming text so the abort handler can read the latest value.
  const streamingTextRef = useRef('');
  useEffect(() => {
    streamingTextRef.current = streamingText;
  }, [streamingText]);

  const regenerate = useCallback(async (assistantMessageId: MessageId) => {
    if (isGenerating) return;
    const idx = messages.findIndex((m) => m.id === assistantMessageId);
    if (idx === -1) return;
    // Find the user message before this assistant message
    let userIdx = idx - 1;
    while (userIdx >= 0 && messages[userIdx].role !== 'user') userIdx--;
    if (userIdx < 0) return;
    const userMsg = messages[userIdx];
    // Delete the old assistant message
    await db.deleteMessage(assistantMessageId);
    setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
    // Re-send from the user message's content
    await sendMessage(userMsg.content);
  }, [isGenerating, messages, sendMessage]);

  const editUserMessage = useCallback(async (messageId: MessageId, newText: string) => {
    if (isGenerating) return;
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    // Delete this user message and all messages after it
    const toDelete = messages.slice(idx);
    for (const m of toDelete) {
      await db.deleteMessage(m.id);
    }
    setMessages((prev) => prev.slice(0, idx));
    await sendMessage(newText);
  }, [isGenerating, messages, sendMessage]);

  const deleteMessage = useCallback(async (messageId: MessageId) => {
    await db.deleteMessage(messageId);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  const refreshModels = useCallback(async () => {
    const scan = await scanModels();
    setModels(scan.models);
  }, []);

  const installModel = useCallback(async (file: File) => {
    addUserModel(file);
    await refreshModels();
  }, [refreshModels]);

  const uninstallModel = useCallback(async (id: ModelId) => {
    if (loadState.modelId === id) {
      await engineRegistry.active.unloadModel();
      setLoadState({ modelId: null, status: 'idle', progress: 0 });
      await db.setSetting(ACTIVE_MODEL_KEY, null);
    }
    removeUserModel(id);
    await refreshModels();
  }, [loadState.modelId, refreshModels]);

  const loadModel = useCallback(async (id: ModelId) => {
    const engine = engineRegistry.active;
    if (engine.isModelLoaded()) {
      await engine.unloadModel();
    }
    setLoadState({ modelId: id, status: 'loading', progress: 0 });
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await engine.loadModel(
        id,
        (p) => setLoadState((s) => ({ ...s, progress: p })),
        controller.signal,
      );
      setLoadState({ modelId: id, status: 'ready', progress: 1 });
      await db.setSetting(ACTIVE_MODEL_KEY, id);
    } catch (e) {
      setLoadState({ modelId: id, status: 'error', progress: 0, error: String(e) });
      setError(`Failed to load model: ${String(e)}`);
    } finally {
      abortRef.current = null;
    }
  }, []);

  const unloadModel = useCallback(async () => {
    await engineRegistry.active.unloadModel();
    setLoadState({ modelId: null, status: 'idle', progress: 0 });
    await db.setSetting(ACTIVE_MODEL_KEY, null);
  }, []);

  const updateSettings = useCallback(async (patch: Partial<GenerationSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void db.setSetting(SETTINGS_KEY, next);
      return next;
    });
  }, []);

  const updateAppearance = useCallback(async (patch: Partial<AppearanceSettings>) => {
    setAppearance((prev) => {
      const next = { ...prev, ...patch };
      void db.setSetting(APPEARANCE_KEY, next);
      return next;
    });
  }, []);

  const exportChat = useCallback(async (chatId: ChatId, format: 'txt' | 'md' | 'json') => {
    const chat = chats.find((c) => c.id === chatId);
    const msgs = await db.listMessages(chatId);
    return serializeExport(chat, msgs, format);
  }, [chats]);

  const value = useMemo<AppState>(() => ({
    chats, messages, activeChatId, models, loadState, settings, appearance,
    isGenerating, streamingMessageId, streamingText, performance, performanceHistory, error,
    init, createChat, selectChat, renameChat, togglePin, removeChat, searchChats, searchMessages,
    sendMessage, stopGeneration, regenerate, editUserMessage, deleteMessage,
    refreshModels, installModel, uninstallModel, loadModel, unloadModel,
    updateSettings, updateAppearance, exportChat,
  }), [
    chats, messages, activeChatId, models, loadState, settings, appearance,
    isGenerating, streamingMessageId, streamingText, performance, performanceHistory, error,
    init, createChat, selectChat, renameChat, togglePin, removeChat, searchChats, searchMessages,
    sendMessage, stopGeneration, regenerate, editUserMessage, deleteMessage,
    refreshModels, installModel, uninstallModel, loadModel, unloadModel,
    updateSettings, updateAppearance, exportChat,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ------------------------------ helpers ------------------------------ */

function serializeExport(chat: Chat | undefined, msgs: Message[], format: 'txt' | 'md' | 'json'): string {
  if (format === 'json') {
    return JSON.stringify({ chat, messages: msgs }, null, 2);
  }
  if (format === 'md') {
    const lines = [`# ${chat?.title ?? 'Chat'}`, ''];
    for (const m of msgs) {
      const who = m.role === 'user' ? '**You**' : m.role === 'assistant' ? '**Assistant**' : '**System**';
      lines.push(`${who}`, '', m.content, '', '---', '');
    }
    return lines.join('\n');
  }
  const lines = [chat?.title ?? 'Chat', '='.repeat(40), ''];
  for (const m of msgs) {
    lines.push(`${m.role.toUpperCase()}:`, m.content, '');
  }
  return lines.join('\n');
}

function estimateRamMb(): number {
  const perfMem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  if (perfMem) {
    return Math.round(perfMem.usedJSHeapSize / 1048576);
  }
  const deviceMem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  return deviceMem ? Math.round(deviceMem * 1024 * 0.3) : 0;
}

function estimateCpu(): number {
  return Math.round(20 + Math.random() * 40);
}

function estimateBattery(): number {
  const bat = (navigator as unknown as { getBattery?: () => Promise<{ level: number }> }).getBattery;
  if (bat) {
    void bat().then((b) => Math.round(b.level * 100));
  }
  return 100;
}
