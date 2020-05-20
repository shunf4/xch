import { Entity, Column, PrimaryColumn, Index, OneToMany, ManyToMany, ManyToOne, BaseEntity, JoinTable, getConnection, createQueryBuilder, SelectQueryBuilder } from "typeorm"
import { EntityNotFoundError } from "typeorm/error/EntityNotFoundError"
import { Transaction } from "./Transaction"
import { assertType, assertCondition, assertInstanceOf, stringIsNotEmpty, greaterThanOrEqualTo, assertTypeOrInstanceOf, passesAssertion, printObject, isUndefinedOrNonEmptyString, TypelessPartial, equalTo, fullObjectOutput, isNotNullNorUndefined } from "../xchUtil"
import { EntityValueError, GetStateInvalidArgumentError, BlockVerificationHashError, BlockVerificationPrevHashError, BlockVerificationHeightError, BlockVerificationSignatureError, BlockVerificationVersionError, BlockVerificationSlotError, DposDataInvalidError } from "../errors"
import { AccountStateSnapshot } from "./AccountStateSnapshot"
import { validateEntity, findOneWithAllRelationsOrFail } from "./common"
import multihashing from "multihashing"
import multihash from "multihashes"
import Debug from "debug-level"
import Constants from "../constants"
import PeerId from "peer-id"
import KnuthShuffle from "knuth-shuffle-seeded"
import { Role } from "./Role"
import { Dpos, WitnessExtendedAss } from "../dpos"

const debug = Debug("xch:orm:Block")

const getCurrentEntityConstructor = () => Block
type CurrentEntityConstructor = (typeof getCurrentEntityConstructor) extends () => infer R ? R : any
type CurrentEntity = (typeof getCurrentEntityConstructor) extends () => { new (...args: any): infer R } ? R : any
let CurrentEntity: CurrentEntityConstructor
let CurrentEntityNameCamelCase: string
function initCurrentEntity(): void {
  CurrentEntity = getCurrentEntityConstructor()
  CurrentEntityNameCamelCase = CurrentEntity.name[0].toLowerCase() + CurrentEntity.name.slice(1)
}

@Entity()
@Index(["hash"], { unique: true })
@Index(["priority", "height"], { unique: true })
export class Block extends BaseEntity {

  @PrimaryColumn()
  hash: string

  @Column()
  version: number

  @Column()
  timestamp: Date

  @Column()
  height: number

  @Column()
  priority: number

  @Column()
  prevHash: string

  @Column()
  mineReward: number

  @Column()
  generator: string // pubkey multihash

  @OneToMany(type => Transaction, transaction => transaction.block, { cascade: true })
  transactions: Transaction[]

  @ManyToMany(type => AccountStateSnapshot, accountStateSnapShot => accountStateSnapShot.mostRecentAssociatedBlocks, { cascade: true })
  @JoinTable()
  mostRecentAssociatedAccountStateSnapshots: AccountStateSnapshot[]

  @Column()
  stateHash: string

  @Column()
  signature: string

  public static addLeftJoinAndSelect<ET>(qb: SelectQueryBuilder<ET>): SelectQueryBuilder<ET> {
    let currentJoined = qb
      .leftJoinAndSelect("block.transactions", "transaction")
      .leftJoinAndSelect("block.mostRecentAssociatedAccountStateSnapshots", "accountStateSnapshot")

    currentJoined = Transaction.addLeftJoinAndSelect<ET>(currentJoined)
    currentJoined = AccountStateSnapshot.addLeftJoinAndSelect<ET>(currentJoined)

    return currentJoined
  }

  public static async * getBlocks({
    minHeight = undefined,
    maxHeight = undefined,
    withRelations = false,
    orderByHeight = "ASC",
  }: {
    minHeight?: undefined | number,
    maxHeight?: undefined | number,
    withRelations?: boolean,
    orderByHeight?: "ASC" | "DESC",
  } = {}): AsyncGenerator<Block> {
    // reload entity with relations
    let qb = getConnection()
      .createQueryBuilder(Block, "block")
      .where("1 = 1")
      .orderBy("block.height", orderByHeight)
      
    if (minHeight !== undefined) {
      qb = qb.andWhere("block.height >= :minHeight", { minHeight })
    }
    if (maxHeight !== undefined) {
      qb = qb.andWhere("block.height <= :maxHeight", { maxHeight })
    }
    if (withRelations) {
      qb = CurrentEntity.addLeftJoinAndSelect(qb)
    }

    const pageSize = 10
    let currentOffset = 0
    while (true) {
      const currentQb = qb.offset(currentOffset).limit(pageSize)
      const currentBlocks = await currentQb.getMany()
      if (currentBlocks.length === 0) {
        return
      }
      for (const block of currentBlocks) {
        yield block
      }
      currentOffset += pageSize
    }
  }

  public static async findOneWithAllRelationsOrFail(condition: TypelessPartial<CurrentEntity>): Promise<CurrentEntity> {
    return await findOneWithAllRelationsOrFail(getCurrentEntityConstructor, CurrentEntityNameCamelCase, condition)
  }

  public async saveOverwritingSamePriorityAndHeight(): Promise<void> {
    await Block.delete({
      priority: this.priority,
      height: this.height,
    })
    await this.save()
  }

  public static async normalize(sth: TypelessPartial<CurrentEntity>, {
    shouldCheckRelations = false,
    shouldLoadRelationsIfUndefined = false,
    shouldValidate = true,
    shouldCalcAndAssignHash = false,
    calcHashArgs = {} as {
      encoding?: "hex" | "buffer",
      shouldAssignHash?: boolean,
      shouldUseExistingChildHash?: boolean,
      shouldUseExistingStateHash?: boolean,
      shouldAssignExistingHash?: boolean,
      shouldUseExistingAssHash?: boolean,
    },
  } = {}): Promise<CurrentEntity> {
    if (shouldValidate) {
      validateEntity(getCurrentEntityConstructor, sth, [
        [false, "hash", assertCondition, isUndefinedOrNonEmptyString],
        [false, "version", assertType, "number"],
        [false, "version", assertCondition, function eqaulsOne(version: number): boolean {
          return version === 1
        }],
        [false, "timestamp", assertTypeOrInstanceOf, ["string", Date]],
        [false, "height", assertType, "number"],
        [false, "height", assertCondition, Number.isInteger],
        [false, "height", assertCondition, [[greaterThanOrEqualTo(0)], [equalTo(-1)]]],
        [false, "priority", assertType, "number"],
        [false, "priority", assertCondition, Number.isInteger],
        [false, "priority", assertCondition, [[greaterThanOrEqualTo(0)]]],
        [false, "prevHash", assertType, "string"],
        [false, "prevHash", assertCondition, stringIsNotEmpty],
        [false, "mineReward", assertType, "number"],
        [false, "mineReward", assertCondition, Number.isInteger],
        [false, "mineReward", assertCondition, greaterThanOrEqualTo(0)],
        [false, "generator", assertType, "string"],
        [false, "generator", assertCondition, stringIsNotEmpty],
        [false, "stateHash", assertCondition, isUndefinedOrNonEmptyString],
        [false, "signature", assertType, "string"],
        [false, "signature", assertCondition, stringIsNotEmpty],

        [false, "transactions", assertTypeOrInstanceOf, ["undefined", Array]],
        [false, "mostRecentAssociatedAccountStateSnapshots", assertTypeOrInstanceOf, ["undefined", Array]],
      ])
    }

    let newObj: CurrentEntity

    // reload entity with relations or normalize entity including all children
    if (shouldLoadRelationsIfUndefined && (
      sth.transactions === undefined
      || sth.mostRecentAssociatedAccountStateSnapshots === undefined
    )) {
      // reload entity with relations
      assertCondition(sth.hash, isNotNullNorUndefined, EntityValueError, `${CurrentEntity.name}.hash`)

      newObj = await CurrentEntity.findOneWithAllRelationsOrFail({
        hash: sth.hash
      })
    } else {
      // normalize entity and all children
      newObj = new CurrentEntity()
      Object.assign(newObj, sth)

      if (shouldCheckRelations) {
        if (sth.transactions !== undefined) {
          newObj.transactions = []
          for (const transaction of sth.transactions) {
            newObj.transactions.push(await Transaction.normalize(transaction, arguments[1]))
          }
        }

        if (sth.mostRecentAssociatedAccountStateSnapshots !== undefined) {
          newObj.mostRecentAssociatedAccountStateSnapshots = []
          for (const accountStateSnapshot of sth.mostRecentAssociatedAccountStateSnapshots) {
            newObj.mostRecentAssociatedAccountStateSnapshots.push(await AccountStateSnapshot.normalize(accountStateSnapshot, arguments[1]))
          }
        }
      }
    }

    // do other necessary normalization
    if (typeof newObj.timestamp === "string") {
      newObj.timestamp = new Date(newObj.timestamp)
      if (isNaN(newObj.timestamp.getTime())) {
        throw new EntityValueError(`Block.timestamp cannot be formatted to a Date: ${newObj.timestamp}`)
      }
    }

    if (shouldCalcAndAssignHash) {
      await newObj.calcHash(calcHashArgs)
    }

    return newObj
  }

  public async reorder({ reverse } = { reverse: false }): Promise<Block> {
    this.transactions?.sort((ta, tb) => ta.seqInBlock - tb.seqInBlock)
    this.mostRecentAssociatedAccountStateSnapshots?.sort((aa, ab) => (+(aa.pubKey > ab.pubKey) - +(aa.pubKey < ab.pubKey)))

    if (reverse) {
      this.transactions?.reverse()
      this.mostRecentAssociatedAccountStateSnapshots?.reverse()
    }
    
    return this
  }

  public static async createTemporaryBlock(): Promise<Block> {
    return await Block.normalize({
      hash: "TEMPORARY_BLOCK",
      generator: "",
      height: -1,
      mineReward: 0,
      mostRecentAssociatedAccountStateSnapshots: [],
      prevHash: "",
      priority: Constants.BlockPriorityTemporary,
      signature: "",
      stateHash: "",
      timestamp: new Date(0),
      transactions: [],
      version: 1,
    })
  }

  public updateMostRecentAssociatedAccountStateSnapshots(
    arr: AccountStateSnapshot[]
  ): void {
    const pubKeyToIndex: Record<string, number> = {}
    for (const [i, ass] of this.mostRecentAssociatedAccountStateSnapshots.entries()) {
      pubKeyToIndex[ass.pubKey] = i
    }

    for (const ass of arr) {
      const index = pubKeyToIndex[ass.pubKey]
      if (index !== undefined) {
        this.mostRecentAssociatedAccountStateSnapshots[index] = ass
      } else {
        this.mostRecentAssociatedAccountStateSnapshots.push(ass)
      }
    }
  }

  public async verifyAllButState({
    genesisBlockHash,
    expectedPrevHash,
    expectedHeight,
  }: {
    genesisBlockHash: string,
    expectedPrevHash: string,
    expectedHeight: number,
  }): Promise<void> {
    // 0. verify hash and whether genesis
    const expectedHash = await this.calcHash({
      encoding: "hex",
      shouldAssignExistingHash: false,
      shouldAssignHash: false,
      shouldUseExistingChildHash: true,
      shouldUseExistingStateHash: true,
    })
    if (expectedHash !== this.hash) {
      throw new BlockVerificationHashError(`verify block(${this.priority}, ${this.height}): hash mismatch: ${this.hash} (expected ${expectedHash})`)
    }

    if (expectedHash === genesisBlockHash) {
      return
    }

    // 1. verify this block's prevHash and height
    if (this.prevHash !== expectedPrevHash) {
      throw new BlockVerificationPrevHashError(`verify block(${this.priority}, ${this.height}): prevHash mismatch: ${this.prevHash} (expected ${expectedPrevHash})`)
    }

    if (this.height !== expectedHeight) {
      throw new BlockVerificationHeightError(`verify block(${this.priority}, ${this.height}): height mismatch (expected ${expectedHeight})`)
    }

    // 2. verify signature
    const peerId = await PeerId.createFromPrivKey(this.generator)
    const blockVerifySignResult = await peerId.pubKey.verify(Buffer.from(this.hash, "hex"), Buffer.from(this.signature, "hex"))
    if (blockVerifySignResult === false) {
      throw new BlockVerificationSignatureError(`verify block(${this.priority}, ${this.height}): signature incorrect`)
    }

    // 3. verify version
    if (this.version !== 1) {
      throw new BlockVerificationVersionError(`verify block(${this.priority}, ${this.height}): invalid version: ${this.version} (expected ${1})`)
    }

    // 4.verify slot
    const blockEpochAndSlot = Dpos.getEpochAndSlot(this.timestamp)
    const currentEpochAndSlot = Dpos.getEpochAndSlot(new Date())
    if (currentEpochAndSlot.accumulatedSlot < blockEpochAndSlot.accumulatedSlot) {
      throw new BlockVerificationSlotError(`verify block(${this.priority}, ${this.height}): slot error: ${this.timestamp}'s slot: (${blockEpochAndSlot.epoch}, ${blockEpochAndSlot.slot}), current: (${currentEpochAndSlot.epoch}, ${currentEpochAndSlot.slot})`)
    }

    // 5. verify slot and witness
    await Dpos.verifyWitness({
      block: this,
    })

    // 6. verify transactions
    for (const [i, transaction] of this.transactions.entries()) {
      await transaction.verify({
        blockTimestamp: this.timestamp,
        expectedSeqInBlock: i,
      })
    }
  }

  
  public async finalize({
    baseBlock,
    targetBlock = this,
    genesisBlockTimestamp,
  }: {
    baseBlock: Block,
    targetBlock: Block,
    genesisBlockTimestamp: Date,
  }): Promise<void> {
    // 1. if it is the first block of a new epoch, re-elect
    const baseBlockEpochAndSlot = Dpos.getEpochAndSlot(baseBlock.timestamp)
    const currentBlockEpochAndSlot = Dpos.getEpochAndSlot(this.timestamp)

    if (baseBlockEpochAndSlot.epoch < currentBlockEpochAndSlot.epoch) {
      // re-elect

      // 0. witnesses' participation in previous epoches
      const workingWitnessPubKeys = await Dpos.getWorkingWitnessPubKeys({
        maxBlockHeight: baseBlock.height,
        shouldIncludeTemporary: false,
      })

      const pubKeyToForgeCount: Record<string, number> = {}

      for (const pubKey of workingWitnessPubKeys) {
        pubKeyToForgeCount[pubKey] = 0
      }

      const dposAss = await Block.getFirstSpecificState({
        maxBlockHeight: baseBlock.height,
        shouldIncludeTemporary: false,
        shouldCreateIfNotFound: false,
        specificPubKey: "DPOS",
      })

      const dposData = dposAss.state

      assertType(dposData.firstBlockHeightOfEpoch, "number", DposDataInvalidError, "dposAss.state.firstBlockHeightOfEpoch")
      assertCondition(dposData.firstBlockHeightOfEpoch, Number.isInteger, DposDataInvalidError, "dposAss.state.firstBlockHeightOfEpoch")

      const currentEpochDuration = Math.min(Constants.DposEpochDurationMillisec, this.timestamp.getTime() - genesisBlockTimestamp.getTime())

      for await (const block of Block.getBlocks({
        minHeight: dposData.firstBlockHeightOfEpoch,
        maxHeight: baseBlock.height,
        orderByHeight: "ASC",
        withRelations: false,
      })) {
        if (pubKeyToForgeCount[block.generator] === undefined) {
          debug.warn(`some invalid user forged block in previous epoch: ${block.generator}. valid witnesses are: ${pubKeyToForgeCount}`)
          continue
        }
        pubKeyToForgeCount[block.generator]++
      }

      for (const pubKey of workingWitnessPubKeys) {
        if (pubKeyToForgeCount[pubKey] < currentEpochDuration / Constants.DposWitnessNumber / Constants.DposSlotDurationMillisec / 2) {
          debug.info(`${pubKey} is not actively forging. currently not kicking`)
        }
      }

      // 1. roll of witnesses

      const witnesses: WitnessExtendedAss[] = []
      const witnessesByPubKey: Record<string, WitnessExtendedAss> = {}

      for await (const witness of Dpos.getWitnesses({
        maxBlockHeight: baseBlock.height,
        overridingBlock: targetBlock,
        shouldIncludeTemporary: false,
      })) {
        const witnessExtended = witness as WitnessExtendedAss
        witnessExtended.witnessRole = witness.roles.find(role => role.name === "witness")
        witnessExtended.witnessRole.score = 0
        witnessesByPubKey[witness.pubKey] = witnessExtended
        witnesses.push(witnessExtended)
      }

      for await (const ass of Block.getState({
        maxBlockHeight: baseBlock.height,
        shouldIncludeTemporary: false,
        overridingBlock: targetBlock,
      })) {
        if (ass.state.votes !== undefined && Array.isArray(ass.state.votes)) {
          for (const vote of ass.state.votes) {
            if (typeof vote.pubKey === "string" && typeof vote.roleName === "string") {
              const witness = witnessesByPubKey[vote.pubKey]
              if (witness) {
                witness.witnessRole.score += ass.balance
              }
            }
          }
        }
      }

      witnesses.sort((assa, assb) => assa.witnessRole.score - assb.witnessRole.score)
      for (const witness of witnesses) {
        await witness.calcHash({
          shouldAssignExistingHash: true,
          shouldAssignHash: true,
          shouldUseExistingHash: false,
        })
      }

      KnuthShuffle(witnesses, baseBlock.hash)

      // 2. update dpos
      dposAss.state.firstBlockHeightOfEpoch = this.height
      dposAss.state.workingWitnesses = witnesses
      await dposAss.calcHash({
        shouldAssignExistingHash: true,
        shouldAssignHash: true,
        shouldUseExistingHash: false,
      })

      targetBlock.updateMostRecentAssociatedAccountStateSnapshots([...witnesses, dposAss])
    }
  }

  public async clearAndSave(): Promise<void> {
    this.timestamp = new Date(0),
    this.prevHash = ""
    this.mineReward = 0
    this.generator = ""
    this.transactions = []
    this.mostRecentAssociatedAccountStateSnapshots = []
    this.signature = ""
    this.hash = ""
    this.stateHash = ""

    await this.saveOverwritingSamePriorityAndHeight()
  }

  public async test1() {
    printObject("getAssHashes:", await this.getAssHashes())
    printObject("getState:", await this.getState())
  }

  public static getAssPubKeysAndHashesSqlSubquerFunction<T>({
    maxBlockHeight = undefined as undefined | number,
    maxPriority = undefined as undefined | number,
    specificPubKey = undefined as undefined | string,
    offset = undefined as undefined | number,
    limit = undefined as undefined | number,
  } = {}): (qb: SelectQueryBuilder<T>) => SelectQueryBuilder<unknown> {
    return (qb): SelectQueryBuilder<unknown> =>
      qb
        .select("ass.pubKey", "pubKey")
        .addSelect("ass.hash", "hash")
        .addSelect("MAX(block.height)", "maxBlockHeight")
        .addSelect("maxBlockPriority", "maxBlockPriority")
        .from(subQb => {
          let tempQb = subQb
            .select("ass.pubKey", "assByPriorityPubKey")
            .addSelect("MAX(block.priority)", "maxBlockPriority")
            .from(AccountStateSnapshot, "ass")
            .leftJoin("ass.mostRecentAssociatedBlocks", "block")
            .groupBy("ass.pubKey")
            .orderBy("ass.pubKey", "ASC")
            .where(
              maxPriority === undefined ?
                "1 = 1"
                : "block.priority <= :maxPriority", { maxPriority })
            .andWhere(
              specificPubKey === undefined ?
                "1 = 1"
                : "ass.pubKey = :specificPubKey", { specificPubKey })

          if (offset !== undefined) {
            tempQb = tempQb.offset(offset)
          }

          if (limit !== undefined) {
            tempQb = tempQb.limit(limit)
          }

          return tempQb
        }, "assByPriority")
        .innerJoin(AccountStateSnapshot, "ass", "assByPriority.assByPriorityPubKey = ass.pubKey")
        .innerJoin("ass.mostRecentAssociatedBlocks", "block", "block.priority = maxBlockPriority")
        .groupBy("assByPriorityPubKey")
        .where(
          maxBlockHeight === undefined ?
            "1 = 1"
            : "block.height <= :maxBlockHeight", { maxBlockHeight })
        .orderBy("ass.pubKey", "ASC")

    // qb with fixed priority:
    //
    // currentQb = createQueryBuilder()
    // .select("ass.pubKey", "pubKey")
    // .addSelect("ass.hash", "hash")
    // .addSelect("MAX(block.height)", "maxBlockHeight")
    // .from(AccountStateSnapshot, "ass")
    // .leftJoin("ass.mostRecentAssociatedBlocks", "block")
    // .where((maxBlockHeight === undefined) ? "1 = 1" : "block.height <= :maxBlockHeight", { maxBlockHeight })
    // .andWhere("block.priority = :fixedPriority", { fixedPriority: Constants.BlockPriorityCommon })
    // .andWhere((specificPubKey === undefined) ? "1 = 1" : "ass.pubKey = :specificPubKey", { specificPubKey })
    // .groupBy("ass.pubKey")  
    // .offset(currentOffset)
    // .limit(pageSize)
    // .orderBy({
    //   "ass.pubKey": "ASC"
    // })
  }

  // if overridingBlock specified, returned asses is not sorted; else they are ordered ASC by pubKey.
  public static async * getAssHashes({
    maxBlockHeight = undefined as undefined | number,
    shouldIncludeTemporary = false,
    specificPubKey = undefined as undefined | string,
    overridingBlock = undefined as Block,
  } = {}): AsyncGenerator<string> {
    const pageSize = 10
    let currentOffset = 0
    const assesInOverridingBlock = overridingBlock ? [...overridingBlock.mostRecentAssociatedAccountStateSnapshots] : []
    while (true) {
      const currentQb: SelectQueryBuilder<unknown> = Block.getAssPubKeysAndHashesSqlSubquerFunction({
        maxBlockHeight,
        maxPriority: shouldIncludeTemporary ? Constants.BlockPriorityTemporary : Constants.BlockPriorityCommon,
        specificPubKey,
        offset: currentOffset,
        limit: pageSize,
      })(createQueryBuilder())

      debug.debug(`executing sql in Block.getAssHashes: ${currentQb.getQueryAndParameters()}`)
      const currentAssHashes = await currentQb.getRawMany()
      debug.debug(`done executing sql in Block.getAssHashes, currentAssHashes.length === ${currentAssHashes.length}`)

      if (currentAssHashes.length === 0) {
        break
      }

      for (const { pubKey, hash } of currentAssHashes) {
        const assIndexInOverridingBlock = assesInOverridingBlock.findIndex(assInOverridingBlock => assInOverridingBlock.pubKey === pubKey)
        if (assIndexInOverridingBlock !== -1) {
          yield assesInOverridingBlock[assIndexInOverridingBlock].hash
          assesInOverridingBlock[assIndexInOverridingBlock] = null
        } else {
          yield hash
        }
      }
      currentOffset += pageSize
    }

    for (const ass of assesInOverridingBlock) {
      if (ass !== null && (specificPubKey === undefined || ass.pubKey === specificPubKey)) {
        yield ass.hash
      }
    }
  }

  // if overridingBlock specified, returned asses is not sorted; else they are ordered ASC by pubKey.
  public async * getAssHashes(options: {
    maxBlockHeight?: number,
    shouldIncludeTemporary?: boolean,
    specificPubKey?: undefined | string,
    overridingBlock?: Block,
  } = {}): AsyncGenerator<string> {
    const optionsWithHeight = Object.assign(options, {
      maxBlockHeight: this.height,
    })
    yield * Block.getAssHashes(optionsWithHeight)
  }

  // if overridingBlock specified, returned asses is not sorted; else they are ordered ASC by pubKey.
  public static async * getState({
    maxBlockHeight = undefined as undefined | number,
    shouldIncludeTemporary = false,
    specificPubKey = undefined as undefined | string,
    overridingBlock = undefined as Block,
  } = {}): AsyncGenerator<AccountStateSnapshot> {
    const pageSize = 10
    let currentOffset = 0
    const assesInOverridingBlock = overridingBlock ? [...overridingBlock.mostRecentAssociatedAccountStateSnapshots] : []
    while (true) {
      const currentQb: SelectQueryBuilder<AccountStateSnapshot> =
        createQueryBuilder()
          .select("ass")
          .from(AccountStateSnapshot, "ass")
          .innerJoin(Block.getAssPubKeysAndHashesSqlSubquerFunction({
            maxBlockHeight,
            maxPriority: shouldIncludeTemporary ? Constants.BlockPriorityTemporary : Constants.BlockPriorityCommon,
            specificPubKey,
            offset: currentOffset,
            limit: pageSize,
          }), "currState", "ass.hash = currState.hash")
          .leftJoinAndSelect("ass.roles", "role")
          .orderBy("ass.pubKey", "ASC")
      
      debug.debug(`executing sql in Block.getState: ${currentQb.getQueryAndParameters()}`)
      const currentAsses = await currentQb.getMany()
      debug.debug(`done executing sql in Block.getState, currentAsses.length === ${currentAsses.length}`)

      if (currentAsses.length === 0) {
        break
      }

      for (const ass of currentAsses) {
        const assIndexInOverridingBlock = assesInOverridingBlock.findIndex(assInOverridingBlock => assInOverridingBlock.pubKey === ass.pubKey)
        if (assIndexInOverridingBlock !== -1) {
          yield assesInOverridingBlock[assIndexInOverridingBlock]
          assesInOverridingBlock[assIndexInOverridingBlock] = null
        }
        yield ass
      }
      currentOffset += pageSize
    }

    for (const ass of assesInOverridingBlock) {
      if (ass !== null && (specificPubKey === undefined || ass.pubKey === specificPubKey)) {
        yield ass
      }
    }
  }

  // if overridingBlock specified, returned asses is not sorted; else they are ordered ASC by pubKey.
  public static async getFirstSpecificState(options: {
    maxBlockHeight?: undefined | number,
    shouldIncludeTemporary?: boolean,
    specificPubKey?: undefined | string,
    shouldCreateIfNotFound?: boolean,
    targetBlockToCreateIn?: Block,
    overridingBlock?: Block,
  } = {}): Promise<AccountStateSnapshot> {
    const {
      specificPubKey,
      shouldCreateIfNotFound = false,
      targetBlockToCreateIn,
    } = options

    for await (const ass of this.getState(options)) {
      return ass
    }

    // Not found
    if (shouldCreateIfNotFound) {
      if (!specificPubKey) {
        throw new GetStateInvalidArgumentError(`specificPubKey not specified when creating account state (because not found)`)
      }

      if (!targetBlockToCreateIn) {
        throw new GetStateInvalidArgumentError(`targetBlockToCreateIn not specified when creating account state (because not found)`)
      }
      
      const newAss: AccountStateSnapshot = await AccountStateSnapshot.normalize({
        pubKey: specificPubKey,
        balance: 0,
        nonce: 0,
        roles: [],
        state: {},
      })

      await newAss.calcHash({
        encoding: "buffer",
        shouldAssignHash: true,
        shouldUseExistingHash: true,
        shouldAssignExistingHash: false
      })

      targetBlockToCreateIn.mostRecentAssociatedAccountStateSnapshots.push(newAss)
      return newAss
    } else {
      throw new EntityNotFoundError(`not found specific account state`, `${options}`)
    }
  }

  // if overridingBlock specified, returned asses is not sorted; else they are ordered ASC by pubKey.
  public async * getState(options: {
    shouldIncludeTemporary?: boolean,
    specificPubKey?: undefined | string,
    overridingBlock?: Block,
  } = {}): AsyncGenerator<AccountStateSnapshot> {
    const optionsWithHeight = Object.assign(options, {
      maxBlockHeight: this.height,
    })
    yield * Block.getState(optionsWithHeight)
  }

  // if overridingBlock specified, returned asses is not sorted; else they are ordered ASC by pubKey.
  public async getFirstSpecificState(options: {
    shouldIncludeTemporary?: boolean,
    specificPubKey?: undefined | string,
    shouldCreateIfNotFound?: boolean,
    targetBlockToCreateIn?: Block,
    overridingBlock?: Block,
  } = {}): Promise<AccountStateSnapshot> {
    const optionsWithHeight = Object.assign(options, {
      maxBlockHeight: this.height,
    })
    return await Block.getFirstSpecificState(optionsWithHeight)
  }

  public async apply({
    baseBlock,
    targetBlock = this,
    isGenesis = false,
  }: {
    baseBlock: Block,
    targetBlock: Block,
    isGenesis: boolean,
  }): Promise<void> {
    for (const transaction of this.transactions) {
      await transaction.apply({
        baseBlock,
        targetBlock,
        isGenesis,
      })
    }

    const generatorAss = await baseBlock.getFirstSpecificState({
      shouldIncludeTemporary: false,
      shouldCreateIfNotFound: false,
      specificPubKey: this.generator,
      overridingBlock: targetBlock,
    })

    generatorAss.balance += this.transactions.map(transaction => transaction.fee).reduce((prev, curr) => prev + curr)
    generatorAss.balance += this.mineReward

    await generatorAss.calcHash({
      shouldAssignExistingHash: true,
      shouldAssignHash: true,
      shouldUseExistingHash: false,
    })

    targetBlock.updateMostRecentAssociatedAccountStateSnapshots([generatorAss])

    // TODO: other finalization
  }

  public static async calcStateHash(options?: {
    assesOrAssHashes?: AsyncGenerator<AccountStateSnapshot | string, any, unknown>,
    maxBlockHeight?: number,
    shouldIncludeTemporary?: boolean,
    encoding?: "hex",
  }): Promise<string>
  public static async calcStateHash(options?: {
    assesOrAssHashes?: AsyncGenerator<AccountStateSnapshot | string, any, unknown>,
    maxBlockHeight?: number,
    shouldIncludeTemporary?: boolean,
    encoding?: "buffer",
  }): Promise<Buffer>
  public static async calcStateHash({
    assesOrAssHashes = undefined as AsyncGenerator<AccountStateSnapshot | string, any, unknown>,
    maxBlockHeight = undefined as number,
    shouldIncludeTemporary = false,
    encoding = "hex",
  } = {}): Promise<any> {

    const stateHasher = multihashing.createHash("sha2-256")
    if (assesOrAssHashes === undefined) {
      assesOrAssHashes = Block.getState({
        maxBlockHeight,
        shouldIncludeTemporary,
      })
    }

    for await (const assOrAssHash of assesOrAssHashes) {
      if (typeof assOrAssHash === "string") {
        stateHasher.update(Buffer.from(assOrAssHash, "hex"))
      } else {
        stateHasher.update(await assOrAssHash.calcHash({
          encoding: "buffer",
          shouldAssignHash: false,
          shouldAssignExistingHash: false,
          shouldUseExistingHash: false
        }))
      }
    }

    const resultBuffer: Buffer = multihash.encode(stateHasher.digest(), "sha2-256")
    return encoding === "buffer" ? resultBuffer : resultBuffer.toString(encoding)
  }

  public async calcStateHash(options?: {
    encoding?: "hex",
    shouldAssignHash?: boolean,
    shouldUseExistingHash?: boolean,
  }): Promise<string>
  public async calcStateHash(options?: {
    encoding: "buffer",
    shouldAssignHash?: boolean,
    shouldUseExistingHash?: boolean,
  }): Promise<Buffer>
  public async calcStateHash({
    encoding = "hex" as "hex" | "buffer",
    shouldAssignHash = false,
    shouldUseExistingHash = true,
  } = {}): Promise<Buffer | string> {
    const stateHasher = multihashing.createHash("sha2-256")
    if (shouldUseExistingHash) {
      for await (const assHash of this.getAssHashes()) {
        stateHasher.update(Buffer.from(assHash, "hex"))
      }
    } else {
      for await (const ass of this.getState()) {
        stateHasher.update(await ass.calcHash({
          encoding: "buffer",
          shouldAssignHash: false,
          shouldAssignExistingHash: false,
          shouldUseExistingHash: false
        }))
      }
    }

    const resultBuffer: Buffer = multihash.encode(stateHasher.digest(), "sha2-256")

    if (shouldAssignHash) {
      this.stateHash = resultBuffer.toString("hex")
      return encoding === "buffer" ? resultBuffer : encoding === "hex" ? this.stateHash : resultBuffer.toString(encoding)
    } else {
      return encoding === "buffer" ? resultBuffer : resultBuffer.toString(encoding)
    }
  }

  public async calcHash(options?: {
    encoding?: "hex",
    shouldAssignHash?: boolean,
    shouldUseExistingChildHash?: boolean,
    shouldUseExistingStateHash?: boolean,
    shouldAssignExistingHash?: boolean,
    shouldUseExistingAssHash?: boolean,
  }): Promise<string>
  public async calcHash(options?: {
    encoding?: "buffer",
    shouldAssignHash?: boolean,
    shouldUseExistingChildHash?: boolean,
    shouldUseExistingStateHash?: boolean,
    shouldAssignExistingHash?: boolean,
    shouldUseExistingAssHash?: boolean,
  }): Promise<Buffer>
  public async calcHash(options?: {
    encoding?: "hex" | "buffer",
    shouldAssignHash?: boolean,
    shouldUseExistingChildHash?: boolean,
    shouldUseExistingStateHash?: boolean,
    shouldAssignExistingHash?: boolean,
    shouldUseExistingAssHash?: boolean,
  })
  public async calcHash({
    encoding = "hex",
    shouldAssignHash = false,
    shouldUseExistingChildHash = true,
    shouldUseExistingStateHash = true,
    shouldAssignExistingHash = false,
    shouldUseExistingAssHash = true,
  } = {}): Promise<any> {
    let obj: Block = this

    const hasher = multihashing.createHash("sha2-256")

    const tempBuffer = Buffer.alloc(8)
    tempBuffer.writeBigInt64BE(BigInt(obj.version))
    hasher.update(tempBuffer)
    tempBuffer.writeBigInt64BE(BigInt(obj.timestamp.getTime()))
    hasher.update(tempBuffer)
    tempBuffer.writeBigInt64BE(BigInt(obj.height))
    hasher.update(tempBuffer)
    hasher.update(Buffer.from(obj.prevHash, "hex"))
    tempBuffer.writeBigInt64BE(BigInt(obj.mineReward))
    hasher.update(tempBuffer)
    hasher.update(Buffer.from(obj.generator))
    
    const transactionsHasher = multihashing.createHash("sha2-256")
    if (obj.transactions === undefined) {
      obj = await Block.normalize(obj, {
        shouldLoadRelationsIfUndefined: true
      })
    }
  
    for (const transaction of obj.transactions) {
      if (shouldUseExistingChildHash) {
        transactionsHasher.update(Buffer.from(transaction.hash, "hex"))
      } else {
        transactionsHasher.update(await transaction.calcHash({
          encoding: "buffer",
          shouldAssignHash: shouldAssignExistingHash,
        }))
      }
    }
    hasher.update(multihash.encode(transactionsHasher.digest(), "sha2-256"))

    if (shouldUseExistingStateHash) {
      hasher.update(Buffer.from(this.stateHash, "hex"))
    } else {
      hasher.update(await this.calcStateHash({
        encoding: "buffer",
        shouldUseExistingHash: shouldUseExistingAssHash,
        shouldAssignHash: shouldAssignHash,
      }))
    }

    const resultBuffer: Buffer = multihash.encode(hasher.digest(), "sha2-256")

    if (shouldAssignHash) {
      this.hash = resultBuffer.toString("hex")
      return encoding === "buffer" ? resultBuffer : encoding === "hex" ? this.hash : resultBuffer.toString(encoding)
    } else {
      return encoding === "buffer" ? resultBuffer : resultBuffer.toString(encoding)
    }
  }
}

initCurrentEntity()