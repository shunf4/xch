import { sleep } from "../xchUtil"

import { Telephone, ItUpstream, TelephoneListenerFunction, Handset } from "../telephone"
import { BaseTelephoner, answering } from "./baseTelephoner"
import { TaskManagerCombination } from "../taskManagerCombination"
import { Task } from "../taskManager"

export class XchSyncReceptionist extends BaseTelephoner {
  public static listeners: [string, TelephoneListenerFunction][] = []
  public taskManagers: TaskManagerCombination

  constructor(options:
    { name?: string,
      telephone: Telephone,
      wire: ItUpstream,
      taskManagers: TaskManagerCombination,
    }) {
    super(options)
    this.taskManagers = options.taskManagers
  }

  @answering()
  async onLatestBlock(questionContent: any, handset: Handset): Promise<void> {
    const task = new Task({
      description: "answer latestBlock",
      func: async (): Promise<void> => {
        await handset.answer({})
      }
    })

    this.taskManagers.overridingQueue.add(task)
    await (task.finishedPromise)
  }

  async start(): Promise<void> {
    await super.start()
  }
}