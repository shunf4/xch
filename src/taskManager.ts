import Debug from "debug-level"
import Constants from "./constants"
import __ from "underscore"
import pDefer from "p-defer"

import { assignOptions } from "./xchUtil"

type DeferredPromise<T> = pDefer.DeferredPromise<T>
const createDeferredPromise = pDefer

const debug = Debug("xch:task")

export enum TaskType {
  QueuedTask,
  IdleTask
}

class TaskNotFoundError extends Error {
  constructor(message?: string) {
    super(message)
  }
}

export class Task {
  description: string
  func: Function
  args: any[]
  private finishedDeferred: DeferredPromise<any>
  get finishedPromise(): Promise<any> {
    return this.finishedDeferred.promise
  }

  constructor({ description, func, args }: { func: Function, description?: string, args?: any[] }, ...extraArgs: any[])
  constructor(func: Function, ...extraArgs: any[])

  constructor(firstArg: { func: Function, description?: string, args?: any[] } | any, ...extraArgs: any[]) {
    let description: string
    let func: Function
    let args: any[]
    if (__.isFunction(firstArg)) {
      func = firstArg
      description = null
      args = null
    } else {
      ({ description, func, args } = firstArg)
    }
    this.description = description ? description : func.name
    this.func = func
    this.args = args ? args : extraArgs
    this.finishedDeferred = createDeferredPromise()
  }

  async run({ shouldThrowException } = { shouldThrowException: false }): Promise<any> {
    try {
      const resultOrResultPromise = this.func(...this.args)
      const result = await Promise.resolve(resultOrResultPromise) // forcily convert result to a Promise
      this.finishedDeferred.resolve(result)
      return result
    } catch (err) {
      if (err.stack) {
        debug.error(`Exception occurred(${err.constructor.name}) when executing task ${this.description}. Stack: ${err.stack}`)
      } else {
        debug.error(`Exception occurred(${err.constructor.name}) when executing task ${this.description}: ${err.message}`)
      }

      this.finishedDeferred.reject(err)
      if (shouldThrowException) {
        throw err
      }
    }
  }
}

interface ITaskManager {
  add(task: Task): void,
  add(func: Function): void,

  invalidate(task: Task): void,
  invalidate(func: Function): void,

  runAllTasks(): Promise<any>,
}

// A QueueTaskManager runs tasks sequentially and removes them after running(if shouldDeleteTaskAfterRun is true).
// Tasks in different QueueTaskManager should not conflict with each other.
export class QueueTaskManager implements ITaskManager {
  private name: string
  private queue: Task[]
  private availableDeferreds: DeferredPromise<void>[]
  private notRunningDeferreds: DeferredPromise<void>[]
  private taskRunning: boolean
  private shouldDeleteTaskAfterRun: boolean
  private debug: any

  private constructor() {
    this.name = "unnamed"
    this.queue = []
    this.availableDeferreds = []
    this.notRunningDeferreds = []
    this.taskRunning = false
    this.shouldDeleteTaskAfterRun = false
    this.debug = Debug("xch:debug:unnamed")
  }

  public static async create(options: {shouldDeleteTaskAfterRun?: boolean, name?: string} = {}): Promise<QueueTaskManager> {
    const newQueueTaskManager = new QueueTaskManager()
    assignOptions(newQueueTaskManager, options)
    newQueueTaskManager.debug = Debug("xch:task:" + newQueueTaskManager.name)
    return newQueueTaskManager
  }

  isQueueEmpty(): boolean {
    return this.queue.length === 0
  }

  private resolveAndClearDeferredIfNeeded(): void {
    if (this.taskRunning) {
      return
    }

    this.debug.debug(`resolving notRunningDeferreds(${this.notRunningDeferreds.length})...`)
    const notRunningDeferreds = this.notRunningDeferreds
    this.notRunningDeferreds = []
    notRunningDeferreds.forEach((deferred) => deferred.resolve())
    this.debug.debug(`done resolving notRunningDeferreds(${this.notRunningDeferreds.length})`)

    if (this.queue.length === 0) {
      return
    }

    this.debug.debug(`resolving availableDeferreds(${this.availableDeferreds.length})...`)
    const availableDeferreds = this.availableDeferreds
    this.availableDeferreds = []
    availableDeferreds.forEach((deferred) => deferred.resolve())
    this.debug.debug(`done resolving availableDeferreds(${this.availableDeferreds.length})`)
  }

  generateAvailablePromise(): Promise<void> {
    const deferred: DeferredPromise<void> = createDeferredPromise()
    this.availableDeferreds.push(deferred)
    this.resolveAndClearDeferredIfNeeded()

    return deferred.promise
  }

  generateNotRunningPromise(): Promise<void> {
    const deferred: DeferredPromise<void> = createDeferredPromise()
    this.notRunningDeferreds.push(deferred)
    this.resolveAndClearDeferredIfNeeded()

    return deferred.promise
  }

  add(task: Task): void
  add(func: Function): void
  add(sth: any): void {
    this.enqueue(sth)
  }

  enqueue(task: Task): void
  enqueue(func: Function): void
  
  enqueue(sth: any): void {
    if (!sth) return

    if (!(sth instanceof Task || sth instanceof Function)) return

    if (sth instanceof Task) {
      const task = sth as Task
      if (!this.queue.includes(task)) {
        this.queue.push(task)
        this.debug.debug(`enqueued task ${task.description}`)
      } else {
        this.debug.debug(`task ${task.description} already exists, not enqueueing`)
      }
    }

    if (sth instanceof Function) {
      const func = sth as Function
      if (!this.queue.some((task) => task.func === func)) {
        this.queue.push(new Task({ func: func }))
        this.debug.debug(`enqueued task ${func.name}`)
      } else {
        this.debug.debug(`task ${func.name} already exists, not enqueueing`)
      }
    }

    this.resolveAndClearDeferredIfNeeded()
  }

  invalidate(task: Task): void
  invalidate(func: Function): void
  invalidate(sth: any): void {
    if (!sth) return

    if (!(sth instanceof Task || sth instanceof Function)) return

    let index = -1
    let taskDescription
    if (sth instanceof Task) {
      const task = sth as Task
      taskDescription = task.description

      index = this.queue.indexOf(task)
    }

    if (sth instanceof Function) {
      const func = sth as Function
      taskDescription = func.name

      for (let i = 0; i < this.queue.length; i++) {
        if (this.queue[i].func === func) {
          index = i
          break
        }
      }
    }

    if (index === -1) {
      throw new TaskNotFoundError(`cannot invalidate task: "${taskDescription}": not found`)
    }

    this.queue[index] = new Task(() => {})
    this.debug.debug(`invalidated task ${taskDescription}`)
  }

  async runOneTask(): Promise<any> {
    if (this.queue.length === 0) {
      throw new Error("queue is empty")
    }

    if (this.taskRunning) {
      throw Error("a task is running at present")
    }

    const firstTask = this.queue[0]

    this.taskRunning = true
    this.debug.debug(`running task ${firstTask.description}...`)
    const result = await firstTask.run()
    this.debug.debug(`done running task ${firstTask.description}`)
    if (this.shouldDeleteTaskAfterRun) {
      this.queue.shift()
    }
    this.taskRunning = false

    this.resolveAndClearDeferredIfNeeded()
    return result
  }

  async runAllTasks(): Promise<void> {
    if (this.taskRunning) {
      throw Error("a task is running at present")
    }

    let i = 0
    this.debug.debug(`running all tasks(${this.queue.length})...`)
    while (i < this.queue.length) {
      const currTask = this.queue[i]
      this.taskRunning = true
      this.debug.debug(`running task ${currTask.description}...`)
      await currTask.run()
      this.debug.debug(`done running task ${currTask.description}`)
      if (this.shouldDeleteTaskAfterRun) {
        this.queue.shift()
      } else {
        i++
      }
      this.taskRunning = false
    }

    this.debug.debug(`done running all tasks`)
    this.resolveAndClearDeferredIfNeeded()
  }
}

// A ParallelismTaskManager runs all registered tasks at the same time.
// Even tasks in the same QueueTaskManager should not conflict with each other.
export class ParallelismTaskManager implements ITaskManager {
  private name: string
  private tasks: Task[]
  private debug: any

  private constructor() {
    this.name = "unnamed"
    this.tasks = []
    this.debug = Debug("xch:task:unnamed")
  }

  public static async create(options: {name?: string} = {}): Promise<ParallelismTaskManager> {
    const newParallelismTaskManager = new ParallelismTaskManager()
    assignOptions(newParallelismTaskManager, options)
    newParallelismTaskManager.debug = Debug("xch:task:" + newParallelismTaskManager.name)
    return newParallelismTaskManager
  }

  add(task: Task): void
  add(func: Function): void
  add(sth: any): void {
    this.register(sth)
  }

  register(task: Task): void
  register(func: Function): void
  
  register(sth: any): void {
    if (!sth) return

    if (!(sth instanceof Task || sth instanceof Function)) return

    if (sth instanceof Task) {
      const task = sth as Task
      if (!this.tasks.includes(task)) {
        this.tasks.push(task)
        this.debug.debug(`added task ${task.description}`)
      } else {
        this.debug.debug(`task ${task.description} already exists, not adding`)
      }
    }

    if (sth instanceof Function) {
      const func = sth as Function
      if (!this.tasks.some((task) => task.func === func)) {
        this.tasks.push(new Task({ func: func }))
        this.debug.debug(`added task ${func.name}`)
      } else {
        this.debug.debug(`task ${func.name} already exists, not adding`)
      }
    }
  }

  invalidate(task: Task): void
  invalidate(func: Function): void
  invalidate(sth: any): void {
    if (!sth) return

    if (!(sth instanceof Task || sth instanceof Function)) return

    let index = -1
    let taskDescription
    if (sth instanceof Task) {
      const task = sth as Task
      taskDescription = task.description

      index = this.tasks.indexOf(task)
    }

    if (sth instanceof Function) {
      const func = sth as Function
      taskDescription = func.name

      for (let i = 0; i < this.tasks.length; i++) {
        if (this.tasks[i].func === func) {
          index = i
          break
        }
      }
    }

    if (index === -1) {
      throw new TaskNotFoundError(`cannot invalidate task: "${taskDescription}": not found`)
    }

    this.tasks[index] = new Task(() => {})
    this.debug.debug(`invalidated task ${taskDescription}`)
  }

  unregister(sth: any): void {
    if (!sth) return

    if (!(sth instanceof Task || sth instanceof Function)) return

    let index = -1
    let taskDescription
    if (sth instanceof Task) {
      const task = sth as Task
      taskDescription = task.description

      index = this.tasks.indexOf(task)
    }

    if (sth instanceof Function) {
      const func = sth as Function
      taskDescription = func.name

      for (let i = 0; i < this.tasks.length; i++) {
        if (this.tasks[i].func === func) {
          index = i
          break
        }
      }
    }

    if (index === -1) {
      throw new TaskNotFoundError(`cannot unregister task: "${taskDescription}": not registered`)
    }

    this.tasks.splice(index, 1)
    this.debug.debug(`removed task ${taskDescription}`)
  }

  async runAllTasks(): Promise<any[]> {
    this.debug.debug(`running all tasks(${this.tasks.length})...`)
    const promises = this.tasks.map((task) => task.run())
    const result = await Promise.all(promises)
    this.debug.debug(`done running all tasks`)
    return result
  }
}

// A cheduler assign a task executing a certain function in targetTaskManager at a certain time interval.
export class Scheduler {
  private name: string
  private _isRunning: boolean
  private debug: any

  public scheduledTask: Task
  public targetTaskManager: QueueTaskManager
  
  private constructor() {
    this.name = "unnamed"
    this.scheduledTask = null
    this.targetTaskManager = null
    this.debug = Debug("xch:sche:unnamed")
  }

  public static async create(options: { name?: string, scheduledAsyncFunc: Function, targetTaskManager: QueueTaskManager}): Promise<Scheduler> {
    const newScheduler = new Scheduler()
    assignOptions(newScheduler, options)
    newScheduler.debug = Debug("xch:sche:" + newScheduler.name)

    newScheduler.scheduledTask = new Task({
      description: "__ScheduledTask__",
      func: async (): Promise<any> => {
        const result = await options.scheduledAsyncFunc()
        newScheduler.onScheduledTaskFinished()
        return result
      },
      args: []
    })
    
    return newScheduler
  }

  start(): void {
    if (!this._isRunning) {
      this._isRunning = true
      this.addToTargetTaskManager()
      this.debug.debug(`started scheduler`)
    } else {
      this.debug.warning(`already started scheduler; ignoring`)
    }
  }

  stop(): void {
    if (this._isRunning) {
      try {
        this.targetTaskManager.invalidate(this.scheduledTask)
      } catch (err) {
        if (!(err instanceof TaskNotFoundError)) {
          throw err
        }
      }
      this._isRunning = false
      this.debug.debug(`stopped scheduler`)
    } else {
      this.debug.warning(`already stopped scheduler; ignoring`)
    }
  }

  private addToTargetTaskManager(): void {
    this.debug.debug(`adding scheduled task...`)
    this.targetTaskManager.add(this.scheduledTask)
    this.debug.debug(`done adding scheduled task`)
  }

  private onScheduledTaskFinished(): void {
    if (this._isRunning) {
      this.debug.debug(`installing timer for next run of scheduled task...`)
      setTimeout(() => { this.addToTargetTaskManager() }, Constants.ScheduledTaskTime)
    }
  }
}