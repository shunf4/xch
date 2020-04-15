import dotenv from "dotenv"
dotenv.config()

import { Profile } from "./profile"
import { P2pLayer } from "./p2pLayer"
import { Blockchain } from "./blockchain"

import { colorForRgb, sleep } from "./xchUtil"
import Debug from "debug-level"

import Yargs from "yargs"

const debug = Debug("xch:main")
import Chalk from "chalk"
debug.color = Chalk.hex("#2222FF")

let profile: Profile
//let db: Database
//let taskQueue: TaskQueue
let db
let taskQueue
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
  // db = await Database.create({ profile: profile })
  db = null
  // taskQueue = await TaskQueue.create()
  taskQueue = null
  p2pLayer = await P2pLayer.create({ profile, db, taskQueue })
  // blockchain = await Blockchain.create({ p2pLayer, db, taskQueue })
}

async function start(): Promise<void> {
  // await blockchain.start()
  await p2pLayer.start()
}

async function main(): Promise<void> {
  try {
    await init()
    await start()

    // while (true) {
    //   if (!taskQueue.empty()) {

    //   } else {
    //     const enqueuePromise = taskQueue.getEnqueuePromise()
    //     const sleepPromise = sleep(10000)
    //     await Promise.race([
    //       enqueuePromise,
    //       sleepPromise
    //     ])
    //   }
    // }

  } catch (e) {
    if (e.stack) {
      debug.error(`Stack(${e.constructor.name}): ${e.stack}`)
    } else {
      debug.error(`${e.constructor.name}: ${e.message}`)
    }
  }
}

void(main())
