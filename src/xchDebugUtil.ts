import { doNotWait, sleep } from "./xchUtil"
import { TaskManagerCombination } from "./taskManagerCombination"
import { Task } from "./taskManager"

export function addTaskManagerDebugTask({ taskManagers, debug }: { taskManagers: TaskManagerCombination, debug: any }): void {
  doNotWait(sleep(3000).then(() => {
    taskManagers.dbQueue.enqueue(new Task({
      func: (x) => { debug.info(`dbdb ${x}`) },
      description: "dbdb task",
      args: ["xxx"]
    }))

    taskManagers.mainQueue.enqueue(new Task({
      func: (x) => { debug.info(`mainmain ${x}`) },
      description: "mainmain task",
      args: ["xxx"]
    }))

    taskManagers.idleQueue.enqueue(new Task({
      func: (x) => { debug.info(`idleidle ${x}`) },
      description: "idleidle task",
      args: ["xxx"]
    }))

    taskManagers.overridingQueue.enqueue(new Task({
      func: (x) => { debug.info(`overover ${x}`) },
      description: "overover task",
      args: ["xxx"]
    }))

    taskManagers.scheduledQueue.enqueue(new Task({
      func: async (x) => {
        await sleep(1000)
        debug.info(`schesche ${x}`)
      },
      description: "schesche task",
      args: ["xxx"]
    }))

    taskManagers.scheduledQueue.enqueue(new Task({
      func: async (x) => {
        await sleep(1000)
        debug.info(`schesche2 ${x}`)
      },
      description: "schesche2 task",
      args: ["xxx"]
    }))

    taskManagers.scheduledParallelism.register(new Task({
      func: async (x) => {
        await sleep(1000)
        debug.info(`schepschep ${x}`)
      },
      description: "schepschep task",
      args: ["xxx"]
    }))

    taskManagers.scheduledParallelism.register(new Task({
      func: async (x) => {
        await sleep(1000)
        debug.info(`schepschep2 ${x}`)
      },
      description: "schepschep2 task",
      args: ["xxx"]
    }))
  }))
}
