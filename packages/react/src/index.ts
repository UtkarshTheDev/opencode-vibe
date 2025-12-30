/**
 * React hooks for OpenCode
 */

export {
	useSSE,
	type UseSSEOptions,
	type UseSSEReturn,
} from "./hooks/use-sse"
export {
	useMultiServerSSE,
	type UseMultiServerSSEOptions,
} from "./hooks/use-multi-server-sse"
export {
	useMessages,
	type UseMessagesOptions,
	type UseMessagesReturn,
} from "./hooks/use-messages"
export {
	useParts,
	type UsePartsOptions,
	type UsePartsReturn,
} from "./hooks/use-parts"
export {
	useMessagesWithParts,
	type UseMessagesWithPartsOptions,
	type UseMessagesWithPartsReturn,
	type OpenCodeMessage,
} from "./hooks/use-messages-with-parts"
export {
	useProjects,
	useCurrentProject,
	type UseProjectsReturn,
	type UseCurrentProjectReturn,
	type Project,
} from "./hooks/use-projects"
export {
	OpenCodeProvider,
	useOpenCode,
	type OpenCodeContextValue,
	type OpenCodeProviderProps,
	SSEProvider,
	type SSEContextValue,
	type SSEProviderProps,
} from "./providers"
// Hooks still using caller pattern (to be migrated)
export { useCreateSession } from "./hooks/use-create-session"
export { useProvider } from "./hooks/use-provider"
export {
	useSendMessage,
	type UseSendMessageOptions,
	type UseSendMessageReturn,
	type ModelSelection,
} from "./hooks/use-send-message"
export {
	useProviders,
	type UseProvidersReturn,
	type Provider,
	type Model,
} from "./hooks/use-providers"
export type { ProviderData, UseProviderResult } from "./hooks/use-provider"
export {
	useFileSearch,
	type UseFileSearchOptions,
	type UseFileSearchResult,
} from "./hooks/use-file-search"
export { useLiveTime } from "./hooks/use-live-time"
export { useCommands } from "./hooks/use-commands"

// Re-export core types for backwards compatibility
export type { Session, Message, Part } from "@opencode-vibe/core/types"

// Effect-based hooks (Phase 3b: Effect atom migration)
export {
	useServers,
	useServersEffect,
	useCurrentServer,
	type UseServersReturn,
	type UseCurrentServerReturn,
	type ServerInfo,
} from "./hooks/use-servers"
export {
	useSession,
	type UseSessionOptions,
	type UseSessionReturn,
} from "./hooks/use-session"
export {
	useSessionList,
	type UseSessionListOptions,
	type UseSessionListReturn,
} from "./hooks/use-session-list"
export {
	useSessionStatus,
	type UseSessionStatusOptions,
	type SessionStatus,
} from "./hooks/use-session-status"
export {
	useSubagents,
	type UseSubagentsReturn,
	type SubagentSession,
	type SubagentState,
} from "./hooks/use-subagents"
export {
	useSubagent,
	type UseSubagentOptions,
	type UseSubagentReturn,
} from "./hooks/use-subagent"
export {
	useContextUsage,
	formatTokens,
	type UseContextUsageOptions,
	type ContextUsageState,
} from "./hooks/use-context-usage"
export {
	useCompactionState,
	type UseCompactionStateOptions,
	type CompactionState,
	type CompactionProgress,
} from "./hooks/use-compaction-state"
export {
	useSubagentSync,
	type UseSubagentSyncOptions,
} from "./hooks/use-subagent-sync"
