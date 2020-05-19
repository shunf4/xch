import dotenv from "dotenv"
dotenv.config()
// import "source-map-support/register"

import path from "path"
import fs, { read } from "fs"
import readline from "readline"

import util from "util"

import chalk from "chalk"
import Debug from "debug-level"
import yargs from "yargs"
import "reflect-metadata"
import { createConnection, getConnectionOptions, getConnection } from "typeorm"

import { doNotWait, printObject, TypelessPartial, printException } from "./xchUtil"
import { Profile } from "./profile"


const debug = Debug("xch:main")
import { Block } from "./entity/Block"
import { Transaction } from "./entity/Transaction"
import { AccountStateSnapshot } from "./entity/AccountStateSnapshot"
import PeerId from "peer-id"
import { Role } from "./entity/Role"
import Constants from "./constants"
import { KeyType } from "libp2p-crypto"

import itAll from "it-all"

debug.color = chalk.hex("#2222FF")

let profile: Profile


async function readArgv(): Promise<any> {
  const argv: any = yargs.argv
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
    database: path.join(profile.profileDir, "database_test.db")
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

    await main2()

  } catch (err) {
    printException(debug, err, {
      prefix: "During running dbTest.main: ",
    })
  }
}

doNotWait(main())


async function main1() {
  const asker = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const genesisBlockObj: TypelessPartial<Block> = {
    hash: generateSpecialId(0),
    version: 1,
    timestamp: new Date(),
    height: 0,
    priority: 0,
    prevHash: generateSpecialId(0),
    mineReward: 0,
    generator: profile.config.peerId.toJSON().pubKey,
    transactions: [],
    stateHash: generateSpecialId(0),
    signature: generateSpecialId(0),
    mostRecentAssociatedAccountStateSnapshots: []
  }

  let seqInBlock = 0
  for (const peerId of [profile.config.peerId, ...profile.config.extraAccountPeerIds]) {
    const currentTransaction = await Transaction.normalize({
      hash: generateSpecialId(seqInBlock),
      seqInBlock: seqInBlock,
      type: "transfer",
      amount: 1000,
      fee: 0,
      timestamp: new Date(),
      sender: profile.config.peerId.toJSON().pubKey,
      recipient: peerId.toJSON().pubKey,
      signature: generateSpecialId(0),
      extraData: {}
    })
    genesisBlockObj.transactions.push(currentTransaction)

    seqInBlock++
  }

  for (let i = 0; i < 3; i++) {
    genesisBlockObj.mostRecentAssociatedAccountStateSnapshots.push(await AccountStateSnapshot.normalize({
      hash: generateSpecialId(i),
      pubKey: (await PeerId.create({ keyType: Constants.DefaultPeerIdKeyType as KeyType })).toJSON().pubKey,
      nonce: 0,
      balance: 0,
      state: {},
      roles: [
        await Role.normalize({
          hash: generateSpecialId(i * 5),
          name: "role1",
          score: 0,
        }),
        await Role.normalize({
          hash: generateSpecialId(i * 5 + 1),
          name: "role2",
          score: 0,
        })
      ]
    }))
  }

  const genesisBlock = await Block.normalize(genesisBlockObj, {
    shouldCheckRelations: true,
    shouldLoadRelationsIfUndefined: false 
  })

  printObject(genesisBlock)
  // await new Promise((r) => {
  //   asker.question("press enter to continue", r)
  // })

  const secondBlockObj: TypelessPartial<Block> = {
    hash: generateSpecialId(1),
    version: 1,
    timestamp: new Date(),
    height: 1,
    priority: 0,
    prevHash: genesisBlock.hash,
    mineReward: 0,
    generator: profile.config.peerId.toJSON().pubKey,
    transactions: [],
    stateHash: generateSpecialId(0),
    signature: generateSpecialId(0),
    mostRecentAssociatedAccountStateSnapshots: []
  }

  seqInBlock = 0
  for (const peerId of [profile.config.peerId, ...profile.config.extraAccountPeerIds]) {
    const currentTransaction = await Transaction.normalize({
      hash: generateSpecialId(seqInBlock),
      seqInBlock: seqInBlock,
      type: "transfer",
      amount: 2000,
      fee: 0,
      timestamp: new Date(),
      sender: profile.config.peerId.toJSON().pubKey,
      recipient: peerId.toJSON().pubKey,
      signature: generateSpecialId(0),
      extraData: {}
    })
    console.log(currentTransaction)
    secondBlockObj.transactions.push(currentTransaction)

    seqInBlock++
  }

  for (let i = 0; i < 2; i++) {
    secondBlockObj.mostRecentAssociatedAccountStateSnapshots.push(await AccountStateSnapshot.normalize({
      hash: generateSpecialId(i + 10),
      pubKey: genesisBlock.mostRecentAssociatedAccountStateSnapshots[i].pubKey,
      nonce: 1,
      balance: 22,
      state: {},
      roles: [
        await Role.normalize({
          hash: generateSpecialId(100 + i * 5),
          name: "role1",
          score: 23,
        }),
        await Role.normalize({
          hash: generateSpecialId(100 + i * 5 + 1),
          name: "role2",
          score: 23,
        })
      ]
    }))
  }

  for (let i = 0; i < 3; i++) {
    secondBlockObj.mostRecentAssociatedAccountStateSnapshots.push(await AccountStateSnapshot.normalize({
      hash: generateSpecialId(i + 20),
      pubKey: (await PeerId.create({ keyType: Constants.DefaultPeerIdKeyType as KeyType })).toJSON().pubKey,
      nonce: 0,
      balance: 0,
      state: {},
      roles: [
        await Role.normalize({
          hash: generateSpecialId((i + 10) * 99),
          name: "role3",
          score: 0,
        }),
        await Role.normalize({
          hash: generateSpecialId((i + 10) * 99 + 1),
          name: "role4",
          score: 0,
        })
      ]
    }))
  }

  const secondBlock = await Block.normalize(secondBlockObj, {
    shouldCheckRelations: true,
    shouldLoadRelationsIfUndefined: false 
  })


  // {
  //   const f = await fs.promises.open("./testGenesisBlock.json", "w")
  //   await f.writeFile(JSON.stringify(genesisBlock, null, 2), {
  //     encoding: "utf-8"
  //   })
  //   await f.close()
  // }

  // {
  //   const f = await fs.promises.open("./testGenesisBlock.json", "r")
  //   const x = JSON.parse(await f.readFile({
  //     encoding: "utf-8"
  //   }))
  //   console.log(await Block.normalize(x))
  // }

  await genesisBlock.save()
  await secondBlock.save()

  {
    const requery = await Block.findOneWithAllRelationsOrFail({
      hash: generateSpecialId(0)
    })

    const reqSorted = await requery.reorder()

    console.log("1 reqSorted:", util.inspect(reqSorted, {
      depth: null,
      colors: true,
    }))

    await requery.test1()
  }

  {
    const requery = await Block.findOneWithAllRelationsOrFail({
      hash: generateSpecialId(1)
    })

    const reqSorted = await requery.reorder()

    console.log("2 reqSorted:", util.inspect(reqSorted, {
      depth: null,
      colors: true,
    }))

    await requery.test1()
  }

  console.log("main end")
  asker.close()
}

async function main2() {

  const b0 = await Block.normalize({
    version: 1,
    timestamp: new Date(),
    height: 0,
    priority: 0,
    prevHash: generateSpecialId(0),
    mineReward: 0,
    generator: profile.config.peerId.toJSON().pubKey,
    transactions: [],
    stateHash: generateSpecialId(0),
    signature: generateSpecialId(0),
    mostRecentAssociatedAccountStateSnapshots: [
      await AccountStateSnapshot.normalize({
        pubKey: "A",
        nonce: 0,
        balance: 1000,
        state: {},
        roles: []
      }, {
        shouldCalcAndAssignHash: true,
        calcHashArgs: {
          encoding: "buffer",
          shouldAssignExistingHash: false,
          shouldAssignHash: true,
          shouldUseExistingHash: true,
        },
      }),
      await AccountStateSnapshot.normalize({
        pubKey: "B",
        nonce: 0,
        balance: 1500,
        state: {},
        roles: []
      }, {
        shouldCalcAndAssignHash: true,
        calcHashArgs: {
          encoding: "buffer",
          shouldAssignExistingHash: false,
          shouldAssignHash: true,
          shouldUseExistingHash: true,
        },
      }),
    ]
  }, {
    shouldCheckRelations: true,
    shouldLoadRelationsIfUndefined: false,
    shouldCalcAndAssignHash: true,
    calcHashArgs: {
      encoding: "buffer",
      shouldAssignHash: true,
      shouldAssignExistingHash: false,
      shouldUseExistingAssHash: true,
      shouldUseExistingStateHash: true,
      shouldUseExistingChildHash: true,
    }
  })

  const b1 = await Block.normalize({
    version: 1,
    timestamp: new Date(),
    height: 1,
    priority: 0,
    prevHash: b0.hash,
    mineReward: 0,
    generator: profile.config.peerId.toJSON().pubKey,
    transactions: [],
    stateHash: generateSpecialId(0),
    signature: generateSpecialId(0),
    mostRecentAssociatedAccountStateSnapshots: []
  }, {
    shouldCheckRelations: true,
    shouldLoadRelationsIfUndefined: false,
    shouldCalcAndAssignHash: true,
    calcHashArgs: {
      encoding: "buffer",
      shouldAssignHash: true,
      shouldAssignExistingHash: false,
      shouldUseExistingAssHash: true,
      shouldUseExistingStateHash: true,
      shouldUseExistingChildHash: true,
    }
  })

  const b2 = await Block.normalize({
    version: 1,
    timestamp: new Date(),
    height: 2,
    priority: 0,
    prevHash: b1.hash,
    mineReward: 0,
    generator: profile.config.peerId.toJSON().pubKey,
    transactions: [],
    stateHash: generateSpecialId(0),
    signature: generateSpecialId(0),
    mostRecentAssociatedAccountStateSnapshots: [
      await AccountStateSnapshot.normalize({
        pubKey: "A",
        nonce: 0,
        balance: 2000,
        state: {},
        roles: []
      }, {
        shouldCalcAndAssignHash: true,
        calcHashArgs: {
          encoding: "buffer",
          shouldAssignExistingHash: false,
          shouldAssignHash: true,
          shouldUseExistingHash: true,
        },
      }),
    ]
  }, {
    shouldCheckRelations: true,
    shouldLoadRelationsIfUndefined: false,
    shouldCalcAndAssignHash: true,
    calcHashArgs: {
      encoding: "buffer",
      shouldAssignHash: true,
      shouldAssignExistingHash: false,
      shouldUseExistingAssHash: true,
      shouldUseExistingStateHash: true,
      shouldUseExistingChildHash: true,
    }
  })

  const b3 = await Block.normalize({
    version: 1,
    timestamp: new Date(),
    height: 3,
    priority: 0,
    prevHash: b2.hash,
    mineReward: 0,
    generator: profile.config.peerId.toJSON().pubKey,
    transactions: [],
    stateHash: generateSpecialId(0),
    signature: generateSpecialId(0),
    mostRecentAssociatedAccountStateSnapshots: []
  }, {
    shouldCheckRelations: true,
    shouldLoadRelationsIfUndefined: false,
    shouldCalcAndAssignHash: true,
    calcHashArgs: {
      encoding: "buffer",
      shouldAssignHash: true,
      shouldAssignExistingHash: false,
      shouldUseExistingAssHash: true,
      shouldUseExistingStateHash: true,
      shouldUseExistingChildHash: true,
    }
  })

  const bp1 = await Block.normalize({
    version: 1,
    timestamp: new Date(),
    height: -1,
    priority: 1,
    prevHash: b3.hash,
    mineReward: 0,
    generator: profile.config.peerId.toJSON().pubKey,
    transactions: [],
    stateHash: generateSpecialId(0),
    signature: generateSpecialId(0),
    mostRecentAssociatedAccountStateSnapshots: [
      await AccountStateSnapshot.normalize({
        pubKey: "A",
        nonce: 0,
        balance: 3000,
        state: {},
        roles: []
      }, {
        shouldCalcAndAssignHash: true,
        calcHashArgs: {
          encoding: "buffer",
          shouldAssignExistingHash: false,
          shouldAssignHash: true,
          shouldUseExistingHash: true,
        },
      }),

      await AccountStateSnapshot.normalize({
        pubKey: "B",
        nonce: 0,
        balance: 2500,
        state: {},
        roles: []
      }, {
        shouldCalcAndAssignHash: true,
        calcHashArgs: {
          encoding: "buffer",
          shouldAssignExistingHash: false,
          shouldAssignHash: true,
          shouldUseExistingHash: true,
        },
      }),
    ]
  }, {
    shouldCheckRelations: true,
    shouldLoadRelationsIfUndefined: false,
    shouldCalcAndAssignHash: true,
    calcHashArgs: {
      encoding: "buffer",
      shouldAssignHash: true,
      shouldAssignExistingHash: false,
      shouldUseExistingAssHash: true,
      shouldUseExistingStateHash: true,
      shouldUseExistingChildHash: true,
    },
  })

  for (const b of [b0, b1, b2, b3, bp1]) {
    // printObject(b)
    await b.save()
  }

  printObject(await itAll(await Block.getState({
    shouldIncludeTemporary: false,
  })))

  printObject(await Block.find())

  const temporaryBlock = await Block.findOneWithAllRelationsOrFail({
    priority: Constants.BlockPriorityTemporary,
    height: -1,
  })

  printObject(await Block.getFirstSpecificState({
    shouldIncludeTemporary: false,
    specificPubKey: 'C',
    shouldCreateIfNotFound: true,
    targetBlockToCreateIn: temporaryBlock,
  }))

  temporaryBlock.mostRecentAssociatedAccountStateSnapshots.splice(0, 2)

  printObject(temporaryBlock)
  await temporaryBlock.calcHash({
    encoding: "buffer",
    shouldAssignHash: true,
    shouldAssignExistingHash: false,
    shouldUseExistingAssHash: true,
    shouldUseExistingChildHash: true, 
    shouldUseExistingStateHash: false,
  })
  printObject(temporaryBlock)
  await temporaryBlock.saveOverwritingSamePriorityAndHeight()

  printObject(await itAll(await Block.getState({
    shouldIncludeTemporary: true,
  })))
}
