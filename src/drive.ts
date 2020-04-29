import dotenv from "dotenv"
dotenv.config()

import path from "path"

import "reflect-metadata"
import { createConnection, getConnectionOptions } from "typeorm"

import { QueueTaskManager, ParallelismTaskManager, TaskType, Scheduler, Task } from "./taskManager"
import { TaskManagerCombination } from "./taskManagerCombination"
import { Profile } from "./profile"
import { P2pLayer } from "./p2pLayer"
import { Blockchain } from "./blockchain"

import Constants from "./constants"
import { sleep, doNotWait } from "./xchUtil"
import Debug from "debug-level"

import Yargs from "yargs"

const debug = Debug("xch:main")
import Chalk from "chalk"
import { promises } from "dns"
import { addTaskManagerDebugTask } from "./xchDebugUtil"
debug.color = Chalk.hex("#2222FF")

let profile: Profile
let taskManagers: TaskManagerCombination
let p2pLayer: P2pLayer
let blockchain: Blockchain


async function readArgv(): Promise<any> {
  const argv: any = Yargs.default("profileDir", "./.xch").argv
  debug.debug(`argv: ${JSON.stringify(argv)}`)
  return argv
}

async function initDb({ profile }: { profile: Profile }): Promise<void> {
  const connectionOptions = await getConnectionOptions()
  Object.assign(connectionOptions, {
    database: path.join(profile.profileDir, "database.db")
  })
  await createConnection(connectionOptions)
}

async function init(): Promise<void> {
  const argv = await readArgv()

  profile = await Profile.create({ profileDir: argv.profileDir, clear: argv.clear })

  await initDb({ profile })

  taskManagers = new TaskManagerCombination()

  taskManagers.mainQueue = await QueueTaskManager.create({shouldDeleteTaskAfterRun: true, name: "main"})
  taskManagers.dbQueue = await QueueTaskManager.create({shouldDeleteTaskAfterRun: true, name: "db"})
  taskManagers.ordinaryQueues = [taskManagers.mainQueue, taskManagers.dbQueue]

  taskManagers.idleQueue = await QueueTaskManager.create({shouldDeleteTaskAfterRun: false, name: "idle"})

  taskManagers.overridingQueue = await QueueTaskManager.create({shouldDeleteTaskAfterRun: true, name: "overriding"})

  taskManagers.scheduledParallelism = await ParallelismTaskManager.create({name: "schepara"})

  taskManagers.scheduledQueue = await QueueTaskManager.create({ shouldDeleteTaskAfterRun: false, name: "schequeue" })

  taskManagers.scheduler = await Scheduler.create({
    name: "mainsche",
    scheduledAsyncFunc: async () => {
      return await Promise.all([
        taskManagers.scheduledParallelism.runAllTasks(),
        taskManagers.scheduledQueue.runAllTasks()
      ])
    },
    targetTaskManager: taskManagers.overridingQueue
  })

  p2pLayer = await P2pLayer.create({ profile, taskManagers })
  blockchain = await Blockchain.create({ p2pLayer, taskManagers })
}

async function start(): Promise<void> {
  await blockchain.start()
  await taskManagers.scheduler.start()
  addTaskManagerDebugTask({ taskManagers, debug })
}

async function poll(): Promise<QueueTaskManager> {
  while (true) {
    if (!taskManagers.overridingQueue.isQueueEmpty()) {
      // If overriding queue has any task, wait for all ordinary queues to finish their current work
      debug.debug("overridingQueue is not empty. waiting for all current task in ordinary queues to finish...")
      await Promise.all(taskManagers.ordinaryQueues.map(task => task.getNotRunningPromise()))
      debug.debug("done waiting for all current task in ordinary queues to finish")

      return taskManagers.overridingQueue
    } else {
      // If overriding queue has no tasks, wait for one queue(including overriding queue) to be available(not running && have at least one task queued) and start a new task
      debug.debug("overridingQueue is empty. waiting for an available task in queues or timeout...")
      let activatedQueue: QueueTaskManager = null

      const availablePromisesAndQueues = taskManagers.ordinaryQueues.map(queue => [queue.getAvailablePromise(), queue] as [Promise<void>, QueueTaskManager])
      availablePromisesAndQueues.forEach(
        ([promise, queue]) => doNotWait(promise.then(() => {
          activatedQueue = queue
        }))
      )

      const sleepPromise = sleep(Constants.IdleTaskTime)
      doNotWait(sleepPromise.then(() => {
        activatedQueue = taskManagers.idleQueue
      }))

      const overridingQueueAvailablePromise = taskManagers.overridingQueue.getAvailablePromise()
      doNotWait(overridingQueueAvailablePromise.then(() => {
        activatedQueue = taskManagers.overridingQueue
      }))
      
      await Promise.race([...availablePromisesAndQueues.map(([promise, _]) => promise), overridingQueueAvailablePromise, sleepPromise])
      debug.debug("done waiting for an available task in queues or timeout")

      if (activatedQueue === taskManagers.overridingQueue) {
        // we still need to wait for all ordinary queues to finish their current work
        debug.debug("overridingQueue is pushed in a task while polling")
        continue
      }

      return activatedQueue
    }
  }
}

async function main(): Promise<void> {
  try {
    await init()
    await start()

    while (true) {
      const activatedTaskManager = await poll()

      if (activatedTaskManager === taskManagers.idleQueue) {
        debug.debug("timed out. running all tasks in idleQueue...")
        await activatedTaskManager.runAllTasks()
        debug.debug("done running all tasks in idleQueue")
      } else if (activatedTaskManager === taskManagers.overridingQueue) {
        debug.debug("running all tasks in overridingQueue...")
        await activatedTaskManager.runAllTasks()
        debug.debug("done running all tasks in overridingQueue")
      } else {
        await activatedTaskManager.runOneTask()
      }
    }

  } catch (err) {
    if (e.stack) {
      debug.error(`Exception occurred(${e.constructor.name}). Stack: ${e.stack}`)
    } else {
      debug.error(`${e.constructor.name}: ${e.message}`)
    }
  }
}

doNotWait(main())