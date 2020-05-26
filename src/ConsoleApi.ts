import { TaskManagerCombination } from "./taskManagerCombination"
import { P2pLayer } from "./p2pLayer"
import { Blockchain } from "./blockchain"
import { Profile } from "./profile"
import { assignOptions, printException, assertInstanceOf, assertType, addConsoleFunctions } from "./xchUtil"

import Debug from "debug"

const debug = Debug("xch:api")

export class ConsoleApi {
  profile: Profile
  p2pLayer: P2pLayer
  blockchain: Blockchain
  taskManagers: TaskManagerCombination

  private constructor() {}

  public static async create(options: {
    profile: Profile,
    p2pLayer: P2pLayer,
    blockchain: Blockchain,
    taskManagers: TaskManagerCombination,
  }): Promise<ConsoleApi> {
    const newConsoleApi = new ConsoleApi()
    assignOptions(newConsoleApi, options)
    return newConsoleApi
  }

  public addConsoleFunctions(argMap: Map<string, (args: string[]) => Promise<any>>): void {
    addConsoleFunctions(debug, this, argMap, [
      this.apiGetLatestBlock,
    ])
  }

  public apiGetLatestBlock(args: string[]): Promise<any> {
    wantMore = 
  }
}