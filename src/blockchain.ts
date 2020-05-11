import { P2pLayer } from "./p2pLayer"
import { Block } from "./entity/Block"
import { TaskManagerCombination } from "./taskManagerCombination"
import { assignOptions, assertCondition } from "./xchUtil"
import { Profile } from "./profile"
import genesisBlockData from "../testGenesisBlock.json"
import { AccountStateSnapshot } from "./entity/AccountStateSnapshot"
import { getConnection } from "typeorm"

export class Blockchain {
  p2pLayer: P2pLayer
  taskManagers: TaskManagerCombination
  profile: Profile
  genesisBlock: Block

  private constructor() {
  }

  // public async load(): Promise<void> {
  //   // 0. load genesisBlock
  //   this.genesisBlock = await Block.normalize(genesisBlockData)

  //   // 1. verify currently saved blocks
  //   if (this.profile.config.verifySavedBlocksOnStart === "full") {
  //     // 1.a1. verify the first block is equal to genesis block
  //     const firstBlock = await Block.findOneOrFail({
  //       height: 0
  //     })

  //     const firstBlockHash = await firstBlock.calcHash({
  //       shouldUseExistingChildHash: false,
  //       shouldUseExistingStateHash: false,
  //       shouldUseExistingAssHash: false,
  //     })
  //     if (firstBlock.hash !== firstBlockHash) {
  //       throw new Error()
  //     }
  //     const genesisBlockHash = await this.genesisBlock.calcHash({
  //       shouldUseExistingChildHash: false,
  //       shouldUseExistingStateHash: false,
  //       shouldUseExistingAssHash: false
  //     })
  //     if (firstBlockHash !== genesisBlockHash) {
  //       throw new Error()
  //     }

  //     // 1.a2. generate initial state and verify genesis block
  //     await getConnection()
  //       .createQueryBuilder()
  //       .delete()
  //       .from(AccountStateSnapshot)

  //     await firstBlock.applyOn()

  //     // 1.a2. verify blocks
  //     let lastBlock = firstBlock
  //     for await (const block of Block.getBlocks({
  //       minHeight: 1,
  //       withRelations: true,
  //     })) {
  //       // 1.a2.1. verify this block's prevHash
  //       if (block.prevHash !== lastBlock.hash) {
  //         throw new Error()
  //       }

  //       // 1.a2.2. verify signature
  //       await block.verifySignature()

  //       // 1.a3.3 verify slot
  //       const { round, slot } = block.getSlot()
  //       await Delegate.verifyDelegates({
  //         round,
  //         slot,
  //         state,
  //       })

  //       // TODO: what marks the end of a round?

  //       // 1.a4.4 verify transactions
  //       for (const transaction of block.transactions) {
  //         await transaction.verify()
  //         state = await transaction.applyOn(state)
  //       }

  //       // TODO: how to handle temporal state?
  //       state = await block.finalizeOn(state) // will include the change of delegates if necessary ?

  //       // TODO: type of return value of calcStateHash
  //       const stateHashFromAssesInBlock = await block.calcStateHash({
  //         shouldAssignHash: false,
  //         shouldUseExistingHash: false,
  //       })
  //       const stateHashReal = await Block.calcStateHash({ state })
  //       if (stateHashReal !== stateHashFromAssesInBlock || stateHashReal !== block.stateHash) {
  //         throw new Error()
  //       }

  //       // TODO: sign first or hash first?
  //       // 1.a4.5 verify hash
  //       if (block.hash !== await block.calcHash({
  //         shouldUseExistingChildHash: true,
  //         shouldUseExistingStateHash: false,
  //         shouldUseExistingAssHash: false,
  //       })) {
  //         throw new Error()
  //       }

  //       lastBlock = block
  //     }
  //   }
  // }

  public static async create(options: {
    p2pLayer: P2pLayer,
    taskManagers: TaskManagerCombination,
    profile: Profile,
  }): Promise<Blockchain> {
    const newBlockchain = new Blockchain()
    assignOptions(newBlockchain, options)
    return newBlockchain
  }

  async start(): Promise<void> {
    await this.p2pLayer.start()

    //await this.initializeGenesisBlock()
    //await this.initializeBlockchain()
  }
}
