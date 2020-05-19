import { P2pLayer } from "./p2pLayer"
import { Block } from "./entity/Block"
import { TaskManagerCombination } from "./taskManagerCombination"
import { assignOptions, assertCondition } from "./xchUtil"
import { Profile } from "./profile"
import genesisBlockData from "../testGenesisBlock.json"
import { AccountStateSnapshot } from "./entity/AccountStateSnapshot"
import { getConnection } from "typeorm"
import Constants from "./constants"
import { BlockVerificationStateHashError, BlockVerificationGenesisError, BlockVerificationError } from "./errors"

export class Blockchain {
  p2pLayer: P2pLayer
  taskManagers: TaskManagerCombination
  profile: Profile
  genesisBlock: Block

  private constructor() {
  }

  public async verifyAllAndLoad(): Promise<void> {
    const emptyBlock = await Block.normalize({
      height: -1,
    }, {
      shouldValidate: false
    })

    // 1. verify the first block is equal to genesis block
    const firstBlock = await Block.findOneOrFail({
      height: 0
    })

    const firstBlockHash = await firstBlock.calcHash({
      shouldUseExistingChildHash: false,
      shouldUseExistingStateHash: false,
      shouldUseExistingAssHash: false,
    })
    if (firstBlock.hash !== firstBlockHash) {
      throw new BlockVerificationGenesisError(`verify genesis block: firstBlock.hash(${firstBlock.hash}) !== firstBlock.calcHash()(${firstBlockHash})`)
    }
    const genesisBlockHash = await this.genesisBlock.calcHash({
      shouldUseExistingChildHash: false,
      shouldUseExistingStateHash: false,
      shouldUseExistingAssHash: false
    })
    if (firstBlockHash !== genesisBlockHash) {
      throw new BlockVerificationGenesisError(`verify genesis block: firstBlock.hash(${firstBlock.hash}) !== hash of genesis block(${genesisBlockHash})`)
    }

    // 2. generate initial state and verify genesis block
    let temporaryBlock: Block

    temporaryBlock = await Block.createTemporaryBlock()

    await firstBlock.apply({
      baseBlock: emptyBlock,
      targetBlock: temporaryBlock,
      isGenesis: true,
    })

    await temporaryBlock.saveOverwritingSamePriorityAndHeight()

    if (temporaryBlock.mostRecentAssociatedAccountStateSnapshots.length !== this.genesisBlock.mostRecentAssociatedAccountStateSnapshots.length) {
      throw new BlockVerificationGenesisError(`verify genesis block: temporaryBlock.asses.length(${temporaryBlock.mostRecentAssociatedAccountStateSnapshots.length}) !== this.genesisBlock.asses.length(${this.genesisBlock.mostRecentAssociatedAccountStateSnapshots.length})`)
    }

    for (let i = 0; i < temporaryBlock.mostRecentAssociatedAccountStateSnapshots.length; i++) {
      const tempAssHash = await temporaryBlock.mostRecentAssociatedAccountStateSnapshots[i].calcHash({
        shouldAssignExistingHash: false,
        shouldAssignHash: false,
        shouldUseExistingHash: false,
      })
      const genesisAssHash = await this.genesisBlock.mostRecentAssociatedAccountStateSnapshots[i].calcHash({
        shouldAssignExistingHash: false,
        shouldAssignHash: false,
        shouldUseExistingHash: false,
      })
      if (tempAssHash !== genesisAssHash) {
        throw new BlockVerificationGenesisError(`verify genesis block: ass [${i}]: tempAssHash(${tempAssHash}) !== genesisAssHash(${genesisAssHash})`)
      }
    }

    const stateHashBasedOnJustComputedAsses = await Block.calcStateHash({
      assesOrAssHashes: Block.getAssHashes({
        shouldIncludeTemporary: true,
        maxBlockHeight: this.genesisBlock.height - 1,
      }),
    })

    if (stateHashBasedOnJustComputedAsses !== firstBlock.stateHash) {
      throw new BlockVerificationStateHashError(`verify genesis block: invalid state hash: firstBlock.stateHash: ${firstBlock.stateHash}, just computed(expected): ${stateHashBasedOnJustComputedAsses}`)
    }

    // 3. verify blocks
    
    let lastBlock = firstBlock
    for await (const block of Block.getBlocks({
      minHeight: 1,
      withRelations: true,
    })) {
      temporaryBlock = await Block.createTemporaryBlock()
      
      // 3.1. verify this block except its state
      await block.verifyAllButState({
        genesisBlockHash: this.genesisBlock.hash,
        expectedHeight: lastBlock.height + 1,
        expectedPrevHash: lastBlock.hash,
      })

      // 3.2 apply transactions
      for (const transaction of block.transactions) {
        await transaction.apply({
          baseBlock: lastBlock,
          targetBlock: temporaryBlock,
          isGenesis: false,
        })
      }

      await temporaryBlock.saveOverwritingSamePriorityAndHeight()

      // 3.3 verify account state snapshot hash

      for (const newAss of block.mostRecentAssociatedAccountStateSnapshots) {
        const expectedNewAssHash = await newAss.calcHash({
          shouldAssignExistingHash: false,
          shouldAssignHash: false,
          shouldUseExistingHash: false,
        })
        if (newAss.hash !== expectedNewAssHash) {
          throw new BlockVerificationStateHashError(`verify block(${block.priority}, ${block.height}): invalid new account state snapshots hash: ${newAss.hash} (expected ${expectedNewAssHash})`)
        }
      }

      // 3.4 compare computed ASSes and ASSes shipped with block

      const stateHashBasedOnAssesInBlock = await block.calcStateHash({
        shouldAssignHash: false,
        shouldUseExistingHash: true,
      })
      const stateHashBasedOnJustComputedAsses = await Block.calcStateHash({
        assesOrAssHashes: Block.getAssHashes({
          shouldIncludeTemporary: true,
          maxBlockHeight: block.height - 1,
        }),
      })

      if (stateHashBasedOnJustComputedAsses !== stateHashBasedOnAssesInBlock || stateHashBasedOnJustComputedAsses !== block.stateHash) {
        throw new BlockVerificationStateHashError(`verify block(${block.priority}, ${block.height}): invalid state hash: block.stateHash: ${block.stateHash}, from block.mostRecent and previous: ${stateHashBasedOnAssesInBlock}, just computed(expected): ${stateHashBasedOnJustComputedAsses}`)
      }

      lastBlock = block
    }
  }

  public async verifyMostRecentAndLoad(): Promise<void> {
    const temporaryBlock = await Block.createTemporaryBlock()

    let mostRecentBlock: Block = undefined
    let secondMostRecentBlock: Block = undefined

    for await (const block of Block.getBlocks({
      minHeight: 1,
      withRelations: true,
      orderByHeight: "DESC",
    })) {
      if (!mostRecentBlock) {
        mostRecentBlock = block
      } else {
        secondMostRecentBlock = block
        break
      }
    }

    if (!mostRecentBlock) {
      throw new BlockVerificationError(`there is no block`)
    }

    if (mostRecentBlock.height === 0) {
      await this.verifyAllAndLoad()
      return
    }

    if (!secondMostRecentBlock) {
      throw new BlockVerificationError(`there is no second most recent block`)
    }

    await mostRecentBlock.verifyAllButState({
      genesisBlockHash: this.genesisBlock.hash,
      expectedHeight: secondMostRecentBlock.height + 1,
      expectedPrevHash: secondMostRecentBlock.hash,
    })

    for (const transaction of mostRecentBlock.transactions) {
      await transaction.apply({
        baseBlock: secondMostRecentBlock,
        targetBlock: temporaryBlock,
        isGenesis: false,
      })
    }

    await temporaryBlock.saveOverwritingSamePriorityAndHeight()

    for (const newAss of mostRecentBlock.mostRecentAssociatedAccountStateSnapshots) {
      const expectedNewAssHash = await newAss.calcHash({
        shouldAssignExistingHash: false,
        shouldAssignHash: false,
        shouldUseExistingHash: false,
      })
      if (newAss.hash !== expectedNewAssHash) {
        throw new BlockVerificationStateHashError(`verify block(${mostRecentBlock.priority}, ${mostRecentBlock.height}): invalid new account state snapshots hash: ${newAss.hash} (expected ${expectedNewAssHash})`)
      }
    }

    const stateHashBasedOnAssesInBlock = await mostRecentBlock.calcStateHash({
      shouldAssignHash: false,
      shouldUseExistingHash: true,
    })

    const stateHashBasedOnJustComputedAsses = await Block.calcStateHash({
      assesOrAssHashes: Block.getAssHashes({
        shouldIncludeTemporary: true,
        maxBlockHeight: mostRecentBlock.height - 1,
      }),
    })

    if (stateHashBasedOnJustComputedAsses !== stateHashBasedOnAssesInBlock || stateHashBasedOnJustComputedAsses !== mostRecentBlock.stateHash) {
      throw new BlockVerificationStateHashError(`verify block(${mostRecentBlock.priority}, ${mostRecentBlock.height}): invalid state hash: block.stateHash: ${mostRecentBlock.stateHash}, from block.mostRecent and previous: ${stateHashBasedOnAssesInBlock}, just computed(expected): ${stateHashBasedOnJustComputedAsses}`)
    }
  }

  public async load(): Promise<void> {
    // 0. load genesisBlock
    this.genesisBlock = await Block.normalize(genesisBlockData)

    // 1. verify currently saved blocks
    if (this.profile.config.blockValidationMode === "full") {
      await this.verifyAllAndLoad()
    } else if (this.profile.config.blockValidationMode === "mostRecent") {
      await this.verifyMostRecentAndLoad()
    } else {
      // 
    }
  }

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
