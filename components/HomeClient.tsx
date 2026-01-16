"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Plus, X } from "lucide-react";
import ChatInterface from "./ChatInterface";
import TopNav from "./TopNav";
import {
  createProject,
  createSession,
  deleteSession,
  loadProjectContext,
  loadSessionContext,
} from "../src/app/actions";
import type { HistoryItem, SessionState } from "../lib/schemas";

const projectIdSchema = z.string().uuid();

type HomeClientProps = {
  initialProjectId?: string | null;
};

export default function HomeClient({ initialProjectId = null }: HomeClientProps) {
  const router = useRouter();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [initialMessages, setInitialMessages] = useState<HistoryItem[]>([]);
  const [initialState, setInitialState] = useState<SessionState | null>(null);
  const [sessions, setSessions] = useState<
    {
      id: string;
      created_at: string | Date;
      last_message?: string;
      title?: string | null;
    }[]
  >([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const hasRequestedRef = useRef(false);

  const validProjectId = projectIdSchema.safeParse(initialProjectId).success
    ? initialProjectId
    : null;

  // Project Creation Logic
  const createAndRedirect = useCallback(async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const newProjectId = await createProject();
      setProjectId(newProjectId);
      setInitialMessages([]);
      router.replace(`/?projectId=${newProjectId}`);
    } catch {
      // Error handling
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, router]);

  useEffect(() => {
    if (validProjectId) {
      setProjectId(validProjectId);
      return;
    }
    if (hasRequestedRef.current) return;
    hasRequestedRef.current = true;
    void createAndRedirect();
  }, [validProjectId, createAndRedirect]);

  // Context Loading Logic
  const loadContext = useCallback(async (activeProjectId: string) => {
    setIsLoadingContext(true);
    try {
      const context = await loadProjectContext(activeProjectId);
      setInitialMessages(context.history);
      setSessions(context.sessions);
      setCurrentSessionId(context.currentSessionId);
      setInitialState(context.state);
    } finally {
      setIsLoadingContext(false);
    }
  }, []);

  useEffect(() => {
    if (!projectId) return;
    void loadContext(projectId);
  }, [projectId, loadContext]);

  // Session Management Logic
  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (!projectId || sessionId === currentSessionId) {
        setIsSidebarOpen(false);
        return;
      }
      setIsLoadingContext(true);
      setIsSidebarOpen(false);
      try {
        const context = await loadSessionContext(projectId, sessionId);
        setInitialMessages(context.history);
        setInitialState(context.state);
        setCurrentSessionId(sessionId);
      } finally {
        setIsLoadingContext(false);
      }
    },
    [projectId, currentSessionId]
  );

  const handleCreateSession = useCallback(async () => {
    if (!projectId || isCreatingSession) return;
    setIsCreatingSession(true);
    setIsSidebarOpen(false);
    try {
      const sessionId = await createSession(projectId);
      setCurrentSessionId(sessionId);
      setInitialMessages([]);
      setInitialState(null);
      setSessions((prev) => [
        { id: sessionId, created_at: new Date(), last_message: "New Session" },
        ...prev,
      ]);
    } finally {
      setIsCreatingSession(false);
    }
  }, [projectId, isCreatingSession]);

  const handleSessionTitleUpdate = useCallback(
    (title: string) => {
      if (!currentSessionId) return;
      setSessions((prev) =>
        prev.map((session) =>
          session.id === currentSessionId ? { ...session, title } : session
        )
      );
    },
    [currentSessionId]
  );

  // Formatting Helper
  const formatSessionDate = (value: string | Date) => {
    const dateValue = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(dateValue.getTime())) return "";
    return dateValue.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!projectId) {
    return (
      <div className="flex min-h-screen flex-col bg-background items-center justify-center">
         <div className="animate-pulse font-display text-2xl">Initializing...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background">
      <TopNav />

      {/* Mobile Header Toggle */}
      <div className="lg:hidden border-b border-gray-200 p-4 flex justify-between items-center bg-white">
        <span className="font-heading font-bold text-lg">Menu</span>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
          {isSidebarOpen ? <X /> : <Plus className="rotate-45" />} 
          {/* Using rotate-45 plus as a menu icon alternative or just standard menu icon */}
        </button>
      </div>

      <main className="flex flex-1 min-h-0 w-full overflow-hidden relative">
        {/* Sidebar Overlay for Mobile */}
        {isSidebarOpen && (
          <div 
            className="absolute inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Left Sidebar - Session History */}
        <aside 
          className={`
            absolute inset-y-0 left-0 z-50 w-80 transform border-r border-gray-200 bg-white transition-transform duration-300 ease-in-out lg:static lg:translate-x-0
            ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}
        >
          <div className="flex h-full flex-col">
            <div className="p-8 pb-4">
              <h2 className="font-display text-2xl font-bold text-black mb-6">History</h2>
              <button
                onClick={handleCreateSession}
                disabled={isCreatingSession}
                className="w-full border border-black bg-black text-white py-3 text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                + New Session
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-8 pb-8 space-y-1">
              {sessions.map((session) => {
                const isActive = session.id === currentSessionId;
                const title = session.title || "Untitled Session";
                
                return (
                  <button
                    key={session.id}
                    onClick={() => handleSelectSession(session.id)}
                    className={`
                      group w-full text-left py-4 border-l-[3px] px-4 transition-all duration-200
                      ${isActive 
                        ? "border-accent bg-surface-muted" 
                        : "border-transparent hover:border-gray-200 hover:bg-gray-50"
                      }
                    `}
                  >
                    <div className="flex flex-col gap-1">
                      <span className={`
                        font-body text-sm font-medium transition-colors
                        ${isActive ? "text-black" : "text-gray-600 group-hover:text-black"}
                      `}>
                        {title}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">
                        {formatSessionDate(session.created_at)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Main Chat Area */}
        <section className="flex flex-1 flex-col overflow-hidden bg-white relative">
          {isLoadingContext ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-1 w-12 bg-gray-200 overflow-hidden">
                <div className="h-full bg-black animate-progress origin-left" />
              </div>
            </div>
          ) : currentSessionId ? (
            <ChatInterface
              key={`${projectId}-${currentSessionId}`}
              projectId={projectId}
              sessionId={currentSessionId}
              initialMessages={initialMessages}
              initialState={initialState ?? undefined}
              onSessionTitleUpdate={handleSessionTitleUpdate}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <h2 className="font-display text-3xl font-bold text-black mb-4">Prompt Smith</h2>
              <p className="text-gray-500 max-w-sm font-body leading-relaxed mb-8">
                Select a session from the history or start a new conversation to begin crafting your prompt.
              </p>
              <button
                onClick={handleCreateSession}
                className="border-b border-black text-black pb-0.5 hover:text-accent hover:border-accent transition-colors font-medium"
              >
                Start new conversation →
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
