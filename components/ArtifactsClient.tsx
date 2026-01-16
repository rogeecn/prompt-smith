"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Pencil, Search, Trash2, MoreVertical } from "lucide-react";
import TopNav from "./TopNav";
import ArtifactChat from "./ArtifactChat";
import {
  createArtifact,
  createArtifactSession,
  createProject,
  deleteArtifact,
  listArtifacts,
  loadArtifactContext,
  loadArtifactSession,
} from "../src/app/actions";
import type { Artifact, HistoryItem } from "../lib/schemas";

const projectIdSchema = z.string().uuid();

type ArtifactsClientProps = {
  initialProjectId?: string | null;
};

export default function ArtifactsClient({
  initialProjectId = null,
}: ArtifactsClientProps) {
  const router = useRouter();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [sessions, setSessions] = useState<
    { id: string; created_at: string | Date; last_message?: string }[]
  >([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<HistoryItem[]>([]);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isCreatingArtifact, setIsCreatingArtifact] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [deletingArtifactId, setDeletingArtifactId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const hasRequestedRef = useRef(false);

  const validProjectId = projectIdSchema.safeParse(initialProjectId).success
    ? initialProjectId
    : null;

  // Project Init
  const createAndRedirect = useCallback(async () => {
    if (isCreatingProject) return;
    setIsCreatingProject(true);
    try {
      const newProjectId = await createProject();
      setProjectId(newProjectId);
      router.replace(`/artifacts?projectId=${newProjectId}`);
    } finally {
      setIsCreatingProject(false);
    }
  }, [isCreatingProject, router]);

  useEffect(() => {
    if (validProjectId) {
      setProjectId(validProjectId);
      return;
    }
    if (hasRequestedRef.current) return;
    hasRequestedRef.current = true;
    void createAndRedirect();
  }, [validProjectId, createAndRedirect]);

  // Artifact List
  const refreshArtifacts = useCallback(async (activeProjectId: string) => {
    try {
      let items = await listArtifacts(activeProjectId);
      if (items.length === 0) {
        await createArtifact(activeProjectId);
        items = await listArtifacts(activeProjectId);
      }
      setArtifacts(items);
      setCurrentArtifactId((prev) =>
        prev && items.some((item) => item.id === prev) ? prev : null
      );
    } catch {
      // Error handling
    }
  }, []);

  useEffect(() => {
    if (!projectId) return;
    void refreshArtifacts(projectId);
  }, [projectId, refreshArtifacts]);

  // Context Loading
  const loadContext = useCallback(async (artifactId: string) => {
    if (!projectId) return;
    setIsLoadingContext(true);
    try {
      const context = await loadArtifactContext(projectId, artifactId);
      setArtifact(context.artifact);
      setSessions(context.sessions);
      setCurrentSessionId(context.currentSessionId);
      setInitialMessages(context.history);
    } finally {
      setIsLoadingContext(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !currentArtifactId) {
      setArtifact(null);
      setSessions([]);
      setCurrentSessionId(null);
      setInitialMessages([]);
      return;
    }
    void loadContext(currentArtifactId);
  }, [projectId, currentArtifactId, loadContext]);

  // Actions
  const handleSelectArtifact = (artifactItem: Artifact) => {
    setCurrentArtifactId(artifactItem.id);
    setIsSidebarOpen(false);
  };

  const handleCreateArtifact = async () => {
    if (!projectId || isCreatingArtifact) return;
    setIsCreatingArtifact(true);
    try {
      const created = await createArtifact(projectId);
      const items = await listArtifacts(projectId);
      setArtifacts(items);
      setCurrentArtifactId(created.id);
    } finally {
      setIsCreatingArtifact(false);
    }
  };

  const handleEditArtifact = (artifactId: string) => {
    if (!projectId) return;
    router.push(`/artifacts/edit/${artifactId}?projectId=${projectId}`);
  };

  const handleDeleteArtifact = (artifactItem: Artifact) => {
    if (!projectId || deletingArtifactId) return;
    setDeleteTarget({
      id: artifactItem.id,
      title: artifactItem.title || "未命名制品",
    });
  };

  const confirmDeleteArtifact = async () => {
    if (!projectId || !deleteTarget) return;
    const artifactId = deleteTarget.id;
    setDeletingArtifactId(artifactId);
    try {
      await deleteArtifact(projectId, artifactId);
      const items = await listArtifacts(projectId);
      setArtifacts(items);
      if (currentArtifactId === artifactId) {
        setCurrentArtifactId(items[0]?.id ?? null);
      }
    } finally {
      setDeletingArtifactId(null);
      setDeleteTarget(null);
    }
  };

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (!projectId || !currentArtifactId || sessionId === currentSessionId) return;
      setIsLoadingContext(true);
      try {
        const context = await loadArtifactSession(projectId, currentArtifactId, sessionId);
        setInitialMessages(context.history);
        setCurrentSessionId(sessionId);
      } finally {
        setIsLoadingContext(false);
      }
    },
    [projectId, currentArtifactId, currentSessionId]
  );

  const handleCreateSession = useCallback(async () => {
    if (!projectId || !currentArtifactId || isCreatingSession) return;
    setIsCreatingSession(true);
    try {
      const sessionId = await createArtifactSession(projectId, currentArtifactId);
      setCurrentSessionId(sessionId);
      setInitialMessages([]);
      setSessions((prev) => [
        { id: sessionId, created_at: new Date(), last_message: "New Branch" },
        ...prev,
      ]);
    } finally {
      setIsCreatingSession(false);
    }
  }, [projectId, currentArtifactId, isCreatingSession]);

  const handleSessionIdChange = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
    setSessions((prev) => {
      if (prev.some((item) => item.id === sessionId)) return prev;
      return [{ id: sessionId, created_at: new Date(), last_message: "New Branch" }, ...prev];
    });
  }, []);

  const formatDate = (value: string | Date) => {
    const d = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("en-US", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const currentArtifact = useMemo(
    () => artifacts.find((item) => item.id === currentArtifactId) ?? null,
    [artifacts, currentArtifactId]
  );

  if (!projectId) {
    return (
      <div className="flex min-h-screen flex-col bg-background items-center justify-center">
        <div className="animate-pulse font-display text-2xl">Loading Artifacts...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-white">
      <TopNav />

      {/* Mobile Toggle */}
      <div className="lg:hidden border-b border-gray-200 p-4 flex justify-between items-center bg-white">
        <span className="font-heading font-bold text-lg">Artifacts</span>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
          <MoreVertical />
        </button>
      </div>

      <main className="flex flex-1 min-h-0 w-full overflow-hidden relative">
         {/* Sidebar Overlay */}
         {isSidebarOpen && (
          <div 
            className="absolute inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* 1. Left Sidebar: Artifact List */}
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
                   id="artifact-search"
                   name="artifactSearch"
                   placeholder="Search artifacts..."
                   className="w-full border-b border-gray-300 py-2 text-sm font-body outline-none focus:border-black transition-colors bg-transparent"
                 />
                 <Search className="absolute right-0 top-2 h-4 w-4 text-gray-400" />
               </div>
               
               <div className="flex items-center justify-between">
                 <h2 className="font-heading font-bold text-lg text-black">Library</h2>
                 <button 
                   onClick={handleCreateArtifact}
                   disabled={isCreatingArtifact}
                   className="text-xs font-bold uppercase tracking-wider text-black hover:text-accent disabled:opacity-50"
                 >
                   + New Artifact
                 </button>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {artifacts.map((item) => {
                const isActive = item.id === currentArtifactId;
                return (
                  <div
                    key={item.id}
                    className={`
                      flex items-start gap-2 border-b border-gray-50 p-6 transition-all duration-200
                      ${isActive ? "bg-surface-muted" : "hover:bg-gray-50"}
                    `}
                  >
                    <button
                      onClick={() => handleSelectArtifact(item)}
                      className="flex-1 text-left"
                    >
                      <div className={`border-l-2 pl-4 ${isActive ? "border-accent" : "border-transparent"}`}>
                        <h3 className={`font-heading font-bold text-base mb-1 ${isActive ? "text-black" : "text-gray-700"}`}>
                          {item.title || "Untitled Artifact"}
                        </h3>
                        <p className="font-body text-xs text-gray-500 line-clamp-2">
                          {item.problem || "No description provided."}
                        </p>
                      </div>
                    </button>
                    <div className="flex flex-col items-center gap-2 pt-1">
                      <button
                        type="button"
                        aria-label="编辑制品"
                        onClick={() => handleEditArtifact(item.id)}
                        className="text-gray-400 hover:text-black transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="删除制品"
                        onClick={() => handleDeleteArtifact(item)}
                        disabled={deletingArtifactId === item.id}
                        className="text-gray-400 hover:text-rose-500 transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* 2. Center: Chat Area */}
        <section className="flex flex-1 flex-col overflow-hidden bg-white relative min-w-0">
          {!currentArtifact ? (
            <div className="flex h-full items-center justify-center text-gray-400">
              Select an artifact to view details
            </div>
          ) : (
            <>
              {/* Artifact Header */}
              <div className="border-b border-gray-100 px-8 py-6">
                 <h1 className="font-display text-3xl font-bold text-black mb-2">
                   {artifact?.title || "Untitled"}
                 </h1>
                 <p className="font-body text-sm text-gray-500 italic">
                   {artifact?.problem || "Prompt engineering workspace"}
                 </p>
              </div>

              {/* Chat Stream */}
              <div className="flex-1 min-h-0 relative">
                {isLoadingContext ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10">
                    <div className="font-mono text-xs">Loading context...</div>
                  </div>
                ) : currentSessionId && currentArtifactId ? (
                   <ArtifactChat
                    key={`${currentArtifactId}-${currentSessionId}`}
                    projectId={projectId as string}
                    artifactId={currentArtifactId}
                    sessionId={currentSessionId}
                    initialMessages={initialMessages}
                    variables={artifact?.variables}
                    onSessionIdChange={handleSessionIdChange}
                  />
                ) : null}
              </div>
            </>
          )}
        </section>

        {/* 3. Right Sidebar: Session History & Variables */}
        {currentArtifact && (
          <aside className="hidden w-[280px] shrink-0 border-l border-gray-200 bg-white flex-col lg:flex">
            
            {/* Session History */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0 border-b border-gray-200">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-heading font-bold text-sm text-black">Sessions</h3>
                <button 
                  onClick={handleCreateSession}
                  className="text-xs text-gray-500 hover:text-black transition-colors"
                >
                  + New
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {sessions.map((session, index) => {
                  const isActive = session.id === currentSessionId;
                  return (
                    <button
                      key={session.id}
                      onClick={() => handleSelectSession(session.id)}
                      className={`
                        w-full text-left p-3 border transition-all duration-200
                        ${isActive 
                          ? "border-accent bg-accent-light" 
                          : "border-gray-100 hover:bg-gray-50"
                        }
                      `}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-mono text-xs font-bold text-black">
                          #{sessions.length - index}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {formatDate(session.created_at)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 truncate font-body">
                        {session.last_message || "Empty"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Variables Snapshot */}
            <div className="h-1/3 min-h-[200px] flex flex-col bg-surface-muted">
              <div className="p-6 border-b border-gray-200/50">
                <h3 className="font-heading font-bold text-sm text-black">Variables</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-6 pt-2">
                {artifact?.variables && artifact.variables.length > 0 ? (
                  <div className="space-y-4">
                    {artifact.variables.map((v) => (
                       <div key={v.key} className="border-l-2 border-gray-300 pl-3">
                         <div className="text-xs text-gray-500 mb-1">{v.label}</div>
                         <code className="text-xs font-mono text-black bg-white px-1 py-0.5">
                           {`{{${v.key}}}`}
                         </code>
                       </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No variables defined yet.</p>
                )}
              </div>
            </div>

          </aside>
        )}
      </main>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!deletingArtifactId) {
              setDeleteTarget(null);
            }
          }}
        >
          <div
            className="w-full max-w-md border border-gray-200 bg-white p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-base font-bold text-black">删除制品</h3>
            <p className="mt-2 text-sm text-gray-600">
              确定要删除“{deleteTarget.title}”及其会话记录吗？此操作无法撤销。
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:text-black"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingArtifactId === deleteTarget.id}
              >
                取消
              </button>
              <button
                type="button"
                className="border border-rose-500 bg-rose-500 px-4 py-2 text-sm text-white hover:bg-rose-600 disabled:opacity-60"
                onClick={confirmDeleteArtifact}
                disabled={deletingArtifactId === deleteTarget.id}
              >
                {deletingArtifactId === deleteTarget.id ? "删除中..." : "删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
