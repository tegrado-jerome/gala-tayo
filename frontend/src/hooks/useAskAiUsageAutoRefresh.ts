type UseAskAiUsageAutoRefreshOptions = {
  enabled: boolean
  intervalMs?: number
  onRefresh: () => void
}

export function useAskAiUsageAutoRefresh(_options: UseAskAiUsageAutoRefreshOptions) {
  // Intentionally a no-op.
  // Auto-refresh was removed to prevent unnecessary fetches when switching tabs.
  // AI usage is now fetched only on mount and after AI request submissions.
}
