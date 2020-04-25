import dotenv from "dotenv"
dotenv.config()

import { QueueTaskManager, ParallelismTaskManager, TaskType, Scheduler } from "./taskManager"
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

async function init(): Promise<void> {
  const argv = await readArgv()

  profile = await Profile.create({ profileDir: argv.profileDir, clear: argv.clear })

  taskManagers.mainQueue = await QueueTaskManager.create({shouldDeleteTaskAfterRun: false, name: "main"})
  taskManagers.dbQueue = await QueueTaskManager.create({shouldDeleteTaskAfterRun: false, name: "db"})
  taskManagers.ordinaryQueues = [taskManagers.mainQueue, taskManagers.dbQueue]

  taskManagers.idleQueue = await QueueTaskManager.create({shouldDeleteTaskAfterRun: false, name: "idle"})

  taskManagers.overridingQueue = await QueueTaskManager.create({shouldDeleteTaskAfterRun: false, name: "overriding"})

  taskManagers.scheduledParallelism = await ParallelismTaskManager.create({name: "schepara"})

  taskManagers.scheduledQueue = await QueueTaskManager.create({ shouldDeleteTaskAfterRun: false, name: "schequeue" })

  taskManagers.scheduler = await Scheduler.create({
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
}

async function poll(): Promise<QueueTaskManager> {
  
  if (!taskManagers.overridingQueue.isQueueEmpty()) {
    // If overriding queue has any task, wait for all ordinary queues to finish their current work
    await Promise.all(taskManagers.ordinaryQueues.map(task => task.getNotRunningPromise()))

    return taskManagers.overridingQueue
  } else {
    // If overriding queue has no tasks, wait for one queue to be available(not running && have at least one task queued) and start a new task
    let activatedQueue: QueueTaskManager = null

    const availablePromisesAndQueues: [Promise<void>, QueueTaskManager][] = taskManagers.ordinaryQueues.map(queue => [queue.getAvailablePromise(), queue])
    availablePromisesAndQueues.forEach(
      ([promise, queue]) => doNotWait(promise.then(() => {
        activatedQueue = queue
      }))
    )

    const sleepPromise = sleep(Constants.IdleTaskTime)
    doNotWait(sleepPromise.then(() => {
      activatedQueue = taskManagers.idleQueue
    }))
    
    await Promise.race([...availablePromisesAndQueues, sleepPromise])
    return activatedQueue
  }
}

async function main(): Promise<void> {
  try {
    await init()
    await start()

    while (true) {
      const activatedTaskManager = await poll();

      if (activatedTaskManager === taskManagers.idleQueue) {
        await activatedTaskManager.runAllTasks()
      } else {
        await activatedTaskManager.runOneTask()
      }
    }

  } catch (e) {
    if (e.stack) {
      debug.error(`Stack(${e.constructor.name}): ${e.stack}`)
    } else {
      debug.error(`${e.constructor.name}: ${e.message}`)
    }
  }
}

doNotWait(main())
