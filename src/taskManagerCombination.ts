import { QueueTaskManager, ParallelismTaskManager, Scheduler } from "./taskManager";

export type TaskManagerCombination = {
  mainQueue: QueueTaskManager,
  dbQueue: QueueTaskManager,
  ordinaryQueues: QueueTaskManager[],
  overridingQueue: QueueTaskManager,
  idleQueue: QueueTaskManager,
  scheduledParallelism: ParallelismTaskManager,
  scheduledQueue: QueueTaskManager,
  scheduler: Scheduler,
}