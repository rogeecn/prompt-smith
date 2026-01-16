"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Plus, Search, X } from "lucide-react";
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
        <span className="font-heading font-bold text-lg">Sessions</span>
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
            <div className="p-6 border-b border-gray-100">
              <div className="relative mb-6">
                <input
                  type="text"
                  id="session-search"
                  name="sessionSearch"
                  placeholder="Search sessions..."
                  className="w-full border-b border-gray-300 py-2 text-sm font-body outline-none focus:border-black transition-colors bg-transparent"
                />
                <Search className="absolute right-0 top-2 h-4 w-4 text-gray-400" />
              </div>
              <div className="flex items-center justify-between">
                <h2 className="font-heading font-bold text-lg text-black">Sessions</h2>
                <button
                  onClick={handleCreateSession}
                  disabled={isCreatingSession}
                  className="text-xs font-bold uppercase tracking-wider text-black hover:text-accent disabled:opacity-50"
                >
                  + New Session
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {sessions.map((session) => {
                const isActive = session.id === currentSessionId;
                const title = session.title || "Untitled Session";
                const summary = session.last_message || formatSessionDate(session.created_at);
                
                return (
                  <div
                    key={session.id}
                    className={`
                      flex items-start gap-2 border-b border-gray-50 p-6 transition-all duration-200
                      ${isActive ? "bg-surface-muted" : "hover:bg-gray-50"}
                    `}
                  >
                    <button
                      onClick={() => handleSelectSession(session.id)}
                      className="flex-1 text-left"
                    >
                      <div className={`border-l-2 pl-4 ${isActive ? "border-accent" : "border-transparent"}`}>
                        <h3 className={`font-heading font-bold text-base mb-1 ${isActive ? "text-black" : "text-gray-700"}`}>
                          {title}
                        </h3>
                        <p className="font-body text-xs text-gray-500 line-clamp-2">
                          {summary}
                        </p>
                      </div>
                    </button>
                  </div>
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
