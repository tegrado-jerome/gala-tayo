type AskAiFeatureLabel = 'chatbot' | 'maps'

type AskAiTaskStatus = 'pending' | 'streaming' | 'done' | 'error' | 'cancelled'

type AskAiTaskResult = {
  answer?: string
  sources?: unknown
  places?: unknown
  answerText?: string
}

export type AskAiTask = {
  id: string
  feature: AskAiFeatureLabel
  jobId?: string
  status: AskAiTaskStatus
  startedAt: number
  exceededThreshold: boolean
  result: AskAiTaskResult | null
  error: string | null
}

type AskAiTaskListener = (task: AskAiTask) => void

type AskAiTaskStore = {
  tasksByFeature: Partial<Record<AskAiFeatureLabel, AskAiTask>>
  listeners: Set<AskAiTaskListener>
  thresholdTimers: Partial<Record<AskAiFeatureLabel, number>>
}

const THRESHOLD_MS = 10000

const store: AskAiTaskStore = {
  tasksByFeature: {},
  listeners: new Set(),
  thresholdTimers: {},
}

function emitTask(task: AskAiTask) {
  for (const listener of store.listeners) {
    listener(task)
  }
}

function clearThresholdTimer(feature: AskAiFeatureLabel) {
  const timerId = store.thresholdTimers[feature]
  if (timerId !== undefined) {
    window.clearTimeout(timerId)
    delete store.thresholdTimers[feature]
  }
}

export function getTask(feature: AskAiFeatureLabel): AskAiTask | null {
  return store.tasksByFeature[feature] ?? null
}

export function getTasks(): AskAiTask[] {
  return Object.values(store.tasksByFeature)
}

export function subscribeToAskAiTasks(listener: AskAiTaskListener) {
  store.listeners.add(listener)
  return () => {
    store.listeners.delete(listener)
  }
}

export function registerAskAiTask(feature: AskAiFeatureLabel): AskAiTask {
  clearThresholdTimer(feature)

  const task: AskAiTask = {
    id: `${feature}-${Date.now()}`,
    feature,
    status: 'pending',
    startedAt: Date.now(),
    exceededThreshold: false,
    result: null,
    error: null,
  }

  store.tasksByFeature[feature] = task

  const timerId = window.setTimeout(() => {
    const currentTask = store.tasksByFeature[feature]
    if (currentTask?.id === task.id) {
      store.tasksByFeature[feature] = {
        ...currentTask,
        exceededThreshold: true,
      }
      emitTask(store.tasksByFeature[feature]!)
    }
  }, THRESHOLD_MS)

  store.thresholdTimers[feature] = timerId

  return task
}

export function updateAskAiTask(
  feature: AskAiFeatureLabel,
  patch: Partial<Pick<AskAiTask, 'status' | 'result' | 'error' | 'jobId' | 'exceededThreshold'>>,
) {
  const task = store.tasksByFeature[feature]
  if (!task) {
    return
  }

  const nextTask: AskAiTask = {
    ...task,
    ...patch,
  }

  store.tasksByFeature[feature] = nextTask
  emitTask(nextTask)
}

export function completeAskAiTask(
  feature: AskAiFeatureLabel,
  result: AskAiTaskResult,
) {
  const task = store.tasksByFeature[feature]
  if (!task) {
    return
  }

  clearThresholdTimer(feature)

  const completedTask: AskAiTask = {
    ...task,
    status: 'done',
    result,
    error: null,
  }

  store.tasksByFeature[feature] = completedTask
  emitTask(completedTask)
}

export function failAskAiTask(feature: AskAiFeatureLabel, error: string) {
  const task = store.tasksByFeature[feature]
  if (!task) {
    return
  }

  clearThresholdTimer(feature)

  const failedTask: AskAiTask = {
    ...task,
    status: 'error',
    error,
    result: null,
  }

  store.tasksByFeature[feature] = failedTask
  emitTask(failedTask)
}

export function cancelAskAiTask(
  feature: AskAiFeatureLabel,
  result: AskAiTaskResult | null = null,
) {
  const task = store.tasksByFeature[feature]
  if (!task) {
    return
  }

  clearThresholdTimer(feature)

  const cancelledTask: AskAiTask = {
    ...task,
    status: 'cancelled',
    error: null,
    result,
  }

  store.tasksByFeature[feature] = cancelledTask
  emitTask(cancelledTask)
}

export function clearAskAiTask(feature: AskAiFeatureLabel) {
  clearThresholdTimer(feature)
  delete store.tasksByFeature[feature]
}
