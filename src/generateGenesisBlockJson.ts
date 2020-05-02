import dotenv from "dotenv"
dotenv.config()

import path from "path"
import fs from "fs"

import chalk from "chalk"
import Debug from "debug-level"
import yargs from "yargs"
import "reflect-metadata"
import { createConnection, getConnectionOptions, getConnection } from "typeorm"

import { doNotWait } from "./xchUtil"
import { Profile } from "./profile"


const debug = Debug("xch:main")
import { Block } from "./entity/Block"
import { Transaction } from "./entity/Transaction"
debug.color = chalk.hex("#2222FF")

let profile: Profile


async function readArgv(): Promise<any> {
  const argv: any = yargs.default("profileDir", "./.xch").argv
  debug.debug(`argv: ${JSON.stringify(argv)}`)
  return argv
}

async function initDb({ profile }: { profile: Profile }): Promise<void> {
  const connectionOptions = await getConnectionOptions()
  Object.assign(connectionOptions, {
    database: path.join(profile.profileDir, "database_gengen.db")
  })
  await createConnection(connectionOptions)
}

async function init(): Promise<void> {
  const argv = await readArgv()

  profile = await Profile.create({ profileDir: argv.profileDir, clear: argv.clear })

  await initDb({ profile })
}

async function start(): Promise<void> {
}

function generateSpecialId(num: number) {
  return num.toString().padStart(16, "0")
}

async function main(): Promise<void> {
  try {
    await init()
    await start()

    await getConnection().synchronize(true)

    const genesisBlockObj = {
      hash: generateSpecialId(0),
      version: 1,
      timestamp: new Date(),
      height: 0,
      prevHash: generateSpecialId(0),
      mineReward: 0,
      generator: profile.config.peerId.toB58String(),
      transactions: [],
      stateHash: generateSpecialId(0),
      signature: generateSpecialId(0),
      transactionsHash: generateSpecialId(0),
      accountStateSnapshots: []
    }

    let seqInBlock = 0
    for (const peerId of [profile.config.peerId, ...profile.config.extraAccountPeerIds]) {
      genesisBlockObj.transactions.push(await Transaction.fromObject({
        hash: generateSpecialId(seqInBlock),
        seqInBlock: seqInBlock,
        type: "transfer",
        amount: 1000,
        fee: 0,
        timestamp: new Date(),
        sender: profile.config.peerId.toB58String(),
        recipient: peerId.toB58String(),
        signature: generateSpecialId(0),
        extraData: {}
      }))

      seqInBlock++
    }

    const genesisBlock = await Block.fromObject(genesisBlockObj)

    {
      const f = await fs.promises.open("./testGenesisBlock.json", "w")
      await f.writeFile(JSON.stringify(genesisBlock, null, 2), {
        encoding: "utf-8"
      })
      await f.close()
    }

    {
      const f = await fs.promises.open("./testGenesisBlock.json", "r")
      const x = JSON.parse(await f.readFile({
        encoding: "utf-8"
      }))
      console.log(await Block.fromObject(x))
    }

    await genesisBlock.save()

    {
      console.log(await (await Block.findOne({
        hash: generateSpecialId(0)
      }, {
        relations: ["transactions"]
      })).reorder({reverse: true}))
    }

  } catch (err) {
    if (err.stack) {
      debug.error(`Exception occurred(${err.constructor.name}). Stack: ${err.stack}`)
    } else {
      debug.error(`${err.constructor.name}: ${err.message}`)
    }
  }
}

doNotWait(main())
