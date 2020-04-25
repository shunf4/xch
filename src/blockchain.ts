import { P2pLayer } from "./p2pLayer"
import { Block } from "./entity/Block"
import { TaskManagerCombination } from "./taskManagerCombination"
import { assignOptions } from "./xchUtil"

export class Blockchain {
  p2pLayer: P2pLayer
  taskManagers: TaskManagerCombination

  private constructor() {
  }

  public static async create(options: { p2pLayer: P2pLayer, taskManagers: TaskManagerCombination }): Promise<Blockchain> {
    const newBlockchain = new Blockchain()
    assignOptions(newBlockchain, options)
    return newBlockchain
  }

  async start(): Promise<void> {
    await this.p2pLayer.start()
  }
}
