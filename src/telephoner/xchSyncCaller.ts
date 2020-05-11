import { sleep } from "../xchUtil"

import { Telephone, ItUpstream, TelephoneListenerFunction, Handset } from "../telephone"
import { BaseTelephoner, answering } from "./baseTelephoner"
import { TaskManagerCombination } from "../taskManagerCombination"
import { Task } from "../taskManager"

export class XchSyncCaller extends BaseTelephoner {
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

  async start(): Promise<void> {
    await super.start()

    const latestBlockResp = await this.telephone.ask("latestBlock", {})
  }
}