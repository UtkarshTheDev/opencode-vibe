/**
 * React hooks for OpenCode
 */

// === Data Fetching ===
export {
	useSessionList,
	type UseSessionListOptions,
	type UseSessionListReturn,
} from "./use-session-list"
export {
	useSession,
	type UseSessionOptions,
	type UseSessionReturn,
} from "./use-session"
export {
	useSessionStatus,
	type UseSessionStatusOptions,
	type SessionStatus,
} from "./use-session-status"
export {
	useMessages,
	type UseMessagesOptions,
	type UseMessagesReturn,
} from "./use-messages"
export {
	useParts,
	type UsePartsOptions,
	type UsePartsReturn,
} from "./use-parts"
export {
	useMessagesWithParts,
	type UseMessagesWithPartsOptions,
	type UseMessagesWithPartsReturn,
	type OpenCodeMessage,
} from "./use-messages-with-parts"
export {
	useProjects,
	useCurrentProject,
	type UseProjectsReturn,
	type UseCurrentProjectReturn,
	type Project,
} from "./use-projects"
export {
	useServers,
	useCurrentServer,
	type UseServersReturn,
	type UseCurrentServerReturn,
	type ServerInfo,
} from "./use-servers"
export { useProviders } from "./use-providers"

// === Real-time (SSE) ===
export {
	useSSE,
	type UseSSEOptions,
	type UseSSEReturn,
} from "./use-sse"
export {
	useMultiServerSSE,
	type UseMultiServerSSEOptions,
} from "./use-multi-server-sse"
export { useSubscription } from "./use-subscription"

// === Subagents ===
export {
	useSubagents,
	type UseSubagentsReturn,
	type SubagentSession,
	type SubagentState,
} from "./use-subagents"
export {
	useSubagent,
	type UseSubagentOptions,
	type UseSubagentReturn,
} from "./use-subagent"
export {
	useSubagentSync,
	type UseSubagentSyncOptions,
} from "./use-subagent-sync"

// === State Management ===
export {
	useContextUsage,
	formatTokens,
	type UseContextUsageOptions,
	type ContextUsageState,
} from "./use-context-usage"
export {
	useCompactionState,
	type UseCompactionStateOptions,
	type CompactionState,
	type CompactionProgress,
} from "./use-compaction-state"

// === Actions ===
export { useSendMessage } from "./use-send-message"
export { useCreateSession } from "./use-create-session"
export { useCommands } from "./use-commands"

// === Utilities ===
export { useLiveTime } from "./use-live-time"
export { useFileSearch } from "./use-file-search"
