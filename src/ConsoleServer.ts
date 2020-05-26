import { createServer, IncomingMessage, ServerResponse, Server as HttpServer } from "http"
import { TaskManagerCombination } from "./taskManagerCombination"
import { P2pLayer } from "./p2pLayer"
import { Blockchain } from "./blockchain"
import { Profile } from "./profile"
import { assignOptions, printException, assertInstanceOf, assertType } from "./xchUtil"

import Debug from "debug"
import ItConcat from "it-concat"
import { ConsoleArgsError, ConsoleMoreArgsNeededError, ConsoleSignatureNeededError } from "./errors"

const debug = Debug("xch:console")

export class ConsoleServer {
  profile: Profile
  p2pLayer: P2pLayer
  blockchain: Blockchain
  taskManagers: TaskManagerCombination
  consoleApi: ConsoleApi

  httpServer: HttpServer
  
  argMap: Map<string, Function>

  private constructor() {
    this.argMap = new Map()
  }

  public static async create(options: {
    profile: Profile,
    p2pLayer: P2pLayer,
    blockchain: Blockchain,
    taskManagers: TaskManagerCombination,
    consoleApi: ConsoleApi
  }): Promise<ConsoleServer> {
    const newConsoleServer = new ConsoleServer()
    assignOptions(newConsoleServer, options)
    this.consoleApi.addConsoleFunctions(this.argMap)
    return newConsoleServer
  }

  public async handleDo(req: IncomingMessage, resp: ServerResponse): Promise<void> {
    try {
      const reqData = JSON.parse(await ItConcat(req, { type: "string" }))
      assertInstanceOf(reqData.commandLine, Array, ConsoleArgsError, "reqData.commandLine")

      const commandLine: string[] = reqData.commandLine
      for (const component of commandLine) {
        assertType(component, "string", ConsoleArgsError, "reqData.commandLine[]")
      }

      const firstFunc = this.argMap.get(commandLine[0])
      if (!firstFunc) {
        throw new ConsoleArgsError(`command line is empty or operation not found`)
      }

    } catch (err) {
      if (err instanceof ConsoleArgsError) {
        resp.statusCode = 400
      }

      if (err instanceof ConsoleMoreArgsNeededError
          || err instanceof ConsoleSignatureNeededError
          || err instanceof ConsoleArgsError) {
        resp.end(JSON.stringify({
          type: err.constructor.name,
          msg: err.message,
          ...err.extra,
        }))
      } else {
        throw err
      }
    }
  }

  public async start(): Promise<void> {
    this.httpServer = createServer(async (req: IncomingMessage, resp: ServerResponse): Promise<void> => {
      if (req.method !== "POST" || req.url !== "/do") {
        resp.statusCode = 404
        resp.statusMessage = "Not Supported, Please POST /do"
        resp.end()
        return
      }

      let result: any
      try {
        result = await this.handleDo(req, resp)
      } catch (err) {
        printException(debug, err, {
          prefix: "During handling POST /do: ",
          printStack: "oneLine",
        })

        resp.statusCode = 500
        resp.statusMessage = err.constructor.name
        resp.end(JSON.stringify({
          type: err.constructor.name,
          msg: err.message,
        }))
      }

      resp.end(JSON.stringify(result))
    })
  }
}