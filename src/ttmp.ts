import dotenv from "dotenv"
dotenv.config()

import path from "path"
import fs from "fs"

import "reflect-metadata"
import { createConnection, getConnectionOptions } from "typeorm"

import { QueueTaskManager, ParallelismTaskManager, TaskType, Scheduler, Task } from "./taskManager"
import { TaskManagerCombination } from "./taskManagerCombination"
import { Profile } from "./profile"
import { P2pLayer } from "./p2pLayer"
import { Blockchain } from "./blockchain"

import constants from "./constants"
import { sleep, doNotWait, itJson } from "./xchUtil"
import Debug from "debug-level"

import Yargs from "yargs"

const debug = Debug("xch:main")
import chalk from "chalk"
import { promises } from "dns"
import { addTaskManagerDebugTask } from "./xchDebugUtil"
import { Block } from "./entity/Block"
debug.color = chalk.hex("#2222FF")

let profile: Profile
let taskManagers: TaskManagerCombination
let p2pLayer: P2pLayer
let blockchain: Blockchain

import pipe from "it-pipe"
import duplex from "it-pair/duplex"
import itLengthPrefixed from "it-length-prefixed"
import { Telephone } from "./telephone"
import { TestTelephoner } from "./telephoner/testTelephoner"
import { doesNotMatch } from "assert"

async function readArgv(): Promise<any> {
  const argv: any = Yargs.default("profileDir", "./.xch").argv
  debug.debug(`argv: ${JSON.stringify(argv)}`)
  return argv
}

async function initDb({ profile }: { profile: Profile }): Promise<void> {
  const connectionOptions = await getConnectionOptions()
  if (process[Symbol.for("ts-node.register.instance")] !== undefined) {
    Object.assign(connectionOptions, {
      entities: connectionOptions["tsEntities"],
      migrations: connectionOptions["tsMigrations"],
      subscribers: connectionOptions["tsSubscribers"],
    })
  }
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

  taskManagers.scheduler = await Scheduler.create({
    name: "mainsche",
    scheduledAsyncFunc: async () => {
      return await Promise.all([
      ])
    },
    targetTaskManager: taskManagers.overridingQueue
  })

  p2pLayer = await P2pLayer.create({ profile, taskManagers })
  blockchain = await Blockchain.create({ p2pLayer, taskManagers })
}

async function start(): Promise<void> {
}

async function main(): Promise<void> {
  try {
    await init()
    await start()


    const [client, server] = duplex()

    const clientTelephone = new Telephone({
      name: "client"
    })
    const serverTelephone = new Telephone({
      name: "server"
    })

    doNotWait(new TestTelephoner({
      name: "serverTelephoner",
      telephone: serverTelephone,
      wire: server
    }).start())

    pipe(
      client,
      itLengthPrefixed.decode({ maxDataLength: 100 }),
      itJson.decoder,
      clientTelephone,
      itJson.encoder,
      itLengthPrefixed.encode({ maxDataLength: 100 }),
      client
    )

    // pipe(
    //   server,
    //   itLengthPrefixed.decode({ maxDataLength: 100 }),
    //   itJson.decoder,
    //   serverTelephone,
    //   itJson.encoder,
    //   itLengthPrefixed.encode({ maxDataLength: 100 }),
    //   server
    // )
    
    // serverTelephone.answering("hello", async (content, handset) => {
    //   console.log(`c2s: hello`)
    //   await sleep(5000)
    //   await handset.answer("hello!!")
    // })

    // serverTelephone.answering("yoyo", async (content, handset) => {
    //   console.log(`c2s: yoyo`)
    //   await handset.answer("yooooo!!")
    // })

    clientTelephone.answering("meme", async (content, handset) => {
      try {
        console.log(`s2c: meme`)
        await sleep(5000)
        await handset.answer("meeeeeeee!!")
      } catch (err) {
        console.log("ans meme", err.constructor.name)
      }
    })

    // clientTelephone.answering("nono", async (content, handset) => {
    //   try {
    //     console.log(`s2c: nono`)
    //     await handset.answer("noooooooo!!")
    //   } catch (err) {
    //     console.log("ans nono", err.constructor.name)
    //   }
    // })

    // console.log(TestTelephoner)

    // void(pipe(
    //   process.stdin,
    //   (source) => (async function * () {
    //     for await (const input of source) {
    //       yield { fuck: input }
    //     }
    //   })(),
    //   async (source) => {
    //     for await (const obj of source) {
    //       clientTelephone.writer.push(obj as any)
    //     }
    //   }
    // ))

    doNotWait((async (): Promise<void> => {
      try {
        await sleep(4500)
        const response = await clientTelephone.ask("hello", null)
        console.log("s2c:", response)
      } catch (err) {
        console.log("ask hello", err.constructor.name)
      }
    })())

  } catch (err) {
    if (err.stack) {
      debug.error(`Exception occurred(${err.constructor.name}). Stack: ${err.stack}`)
    } else {
      debug.error(`${err.constructor.name}: ${err.message}`)
    }
  }
}

doNotWait(main())
