import { QueueTaskManager, ParallelismTaskManager, Scheduler } from "./taskManager";

export class TaskManagerCombination {
  mainQueue: QueueTaskManager = null
  dbQueue: QueueTaskManager = null
  ordinaryQueues: QueueTaskManager[] = null
  overridingQueue: QueueTaskManager = null
  idleQueue: QueueTaskManager = null
  scheduledParallelism: ParallelismTaskManager = null
  scheduledQueue: QueueTaskManager = null
  scheduler: Scheduler = null
}