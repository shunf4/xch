import { Entity, Column, PrimaryColumn, Index, OneToMany, ManyToMany, ManyToOne, BaseEntity, JoinTable, getConnection, createQueryBuilder, SelectQueryBuilder } from "typeorm"
import { EntityNotFoundError } from "typeorm/error/EntityNotFoundError"
import { Transaction } from "./Transaction"
import { assertType, assertCondition, assertInstanceOf, stringIsNotEmpty, greaterThanOrEqualTo, assertTypeOrInstanceOf, passesAssertion, printObject, isUndefinedOrNonEmptyString, TypelessPartial, equalTo } from "../xchUtil"
import { EntityValueError, GetStateInvalidArgumentError } from "../errors"
import { AccountStateSnapshot } from "./AccountStateSnapshot"
import { validateEntity } from "./common"
import multihashing from "multihashing"
import multihash from "multihashes"
import Debug from "debug-level"
import Constants from "../constants"

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

  @ManyToMany(type => AccountStateSnapshot, accountStateSnapShot => accountStateSnapShot.mostRecentAssociatedBlock, { cascade: true })
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
  }: {
    minHeight?: undefined | number,
    maxHeight?: undefined | number,
    withRelations?: boolean,
  } = {}): AsyncGenerator<Block> {
    // reload entity with relations
    let qb = getConnection()
      .createQueryBuilder(Block, "block")
      .where("1 = 1")
      
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

  public static async findOneWithAllRelations(sth: TypelessPartial<CurrentEntity>): Promise<CurrentEntity> {
    return await CurrentEntity.normalize(sth, {
      shouldCheckRelations: false,
      shouldLoadRelationsIfUndefined: true,
      shouldValidate: false,
    })
  }

  public static async normalize(sth: TypelessPartial<CurrentEntity>, {
    shouldCheckRelations = false,
    shouldLoadRelationsIfUndefined = false,
    shouldValidate = true,
    shouldCalcAndAssignHash = false,
    calcHashArgs = {} as {
      encoding?: string,
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
      let allRelationsSqb = getConnection()
        .createQueryBuilder(CurrentEntity, CurrentEntityNameCamelCase)
        .where(`${CurrentEntityNameCamelCase}.hash = :hash`, sth)

      allRelationsSqb = CurrentEntity.addLeftJoinAndSelect(allRelationsSqb)

      newObj = await allRelationsSqb.getOne()

      if (newObj === undefined) {
        throw new EntityNotFoundError(CurrentEntity, `hash: ${sth.hash}`)
      }
      await newObj.reorder()
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

  public async test1() {
    printObject("getAssHashes:", await this.getAssHashes())
    printObject("getState:", await this.getState())
  }

  public async * getAssHashes(): AsyncGenerator<string> {
    const pageSize = 10
    let currentOffset = 0
    while (true) {
      const currentQb = createQueryBuilder()
        .select("ass.pubKey", "pubKey")
        .addSelect("ass.hash", "hash")
        .addSelect("MAX(block.height)", "maxBlockHeight")
        .addSelect("maxBlockPriority", "maxBlockPriority")
        .from(subQb => 
          subQb
            .select("ass.pubKey", "assByPriorityPubKey")
            .addSelect("MAX(block.priority)", "maxBlockPriority")
            .from(AccountStateSnapshot, "ass")
            .leftJoin("ass.mostRecentAssociatedBlock", "block")
            .groupBy("ass.pubKey")
            .orderBy({
              "ass.pubKey": "ASC"
            })
            .offset(currentOffset)
            .limit(pageSize)
        , "assByPriority")
        .innerJoin(AccountStateSnapshot, "ass", "assByPriority.assByPriorityPubKey = ass.pubKey")
        .innerJoin("ass.mostRecentAssociatedBlock", "block", "block.priority = maxBlockPriority")
        .groupBy("assByPriorityPubKey")
        .where("block.height <= :height", { height: this.height })
        .orderBy({
          "ass.pubKey": "ASC"
        })

      debug.debug(`executing sql in Block.getAssHashes: ${currentQb.getQueryAndParameters()}`)
      const currentAssHashes = await currentQb.getRawMany()
      debug.debug(`done executing sql in Block.getAssHashes, currentAssHashes.length === ${currentAssHashes.length}`)

      if (currentAssHashes.length === 0) {
        return
      }

      for (const { hash } of currentAssHashes) {
        yield hash
      }
      currentOffset += pageSize
    }
  }

  public static async * getState({
    maxBlockHeight = undefined as undefined | number,
    shouldIncludeUnconfirmed = false,
    specificPubKey = undefined as undefined | string,
  } = {}): AsyncGenerator<AccountStateSnapshot> {
    const pageSize = 10
    let currentOffset = 0
    while (true) {
      let currentQb: SelectQueryBuilder<AccountStateSnapshot>
      
      if (shouldIncludeUnconfirmed) {
        currentQb = createQueryBuilder()
          .select("ass")
          .from(AccountStateSnapshot, "ass")
          .innerJoin(subQb =>
            subQb
              .select("ass.pubKey", "pubKey")
              .addSelect("ass.hash", "hash")
              .addSelect("MAX(block.height)", "maxBlockHeight")
              .addSelect("maxBlockPriority", "maxBlockPriority")
              .from(subQb => 
                subQb
                  .select("ass.pubKey", "assByPriorityPubKey")
                  .addSelect("MAX(block.priority)", "maxBlockPriority")
                  .from(AccountStateSnapshot, "ass")
                  .leftJoin("ass.mostRecentAssociatedBlock", "block")
                  .groupBy("ass.pubKey")
                  .orderBy({
                    "ass.pubKey": "ASC"
                  })
                  .where("block.priority <= :fixedPriority", { fixedPriority: Constants.BlockPriorityUnconfirmed })
                  .andWhere((specificPubKey === undefined) ? "1 = 1" : "ass.pubKey = :specificPubKey", { specificPubKey })
                  .offset(currentOffset)
                  .limit(pageSize)
              , "assByPriority")
              .innerJoin(AccountStateSnapshot, "ass", "assByPriority.assByPriorityPubKey = ass.pubKey")
              .innerJoin("ass.mostRecentAssociatedBlock", "block", "block.priority = maxBlockPriority")
              .groupBy("assByPriorityPubKey")
              .where((maxBlockHeight === undefined) ? "1 = 1" : "block.height <= :maxBlockHeight", { maxBlockHeight })
          , "currState", "ass.hash = currState.hash")
          .leftJoinAndSelect("ass.roles", "role")
          .orderBy({
            "ass.pubKey": "ASC"
          })
      } else {
        currentQb = createQueryBuilder()
          .select("ass")
          .from(AccountStateSnapshot, "ass")
          .innerJoin(subQb =>
            subQb
              .select("ass.hash", "hash")
              .addSelect("MAX(block.height)", "maxBlockHeight")
              .from(AccountStateSnapshot, "ass")
              .leftJoin("ass.mostRecentAssociatedBlock", "block")
              .where((maxBlockHeight === undefined) ? "1 = 1" : "block.height <= :maxBlockHeight", { maxBlockHeight })
              .andWhere("block.priority = :fixedPriority", { fixedPriority: Constants.BlockPriorityCommon })
              .andWhere((specificPubKey === undefined) ? "1 = 1" : "ass.pubKey = :specificPubKey", { specificPubKey })
              .groupBy("ass.pubKey")
              .offset(currentOffset)
              .limit(pageSize)
          , "currState", "ass.hash = currState.hash")
          .leftJoinAndSelect("ass.roles", "role")
          .orderBy({
            "ass.pubKey": "ASC"
          })
      }
      
      debug.debug(`executing sql in Block.getState: ${currentQb.getQueryAndParameters()}`)
      const currentAsses = await currentQb.getMany()
      debug.debug(`done executing sql in Block.getState, currentAsses.length === ${currentAsses.length}`)

      if (currentAsses.length === 0) {
        return
      }

      for (const ass of currentAsses) {
        yield ass
      }
      currentOffset += pageSize
    }
  }

  public static async getFirstSpecificState(options: {
    maxBlockHeight?: undefined | number,
    shouldIncludeUnconfirmed?: boolean,
    specificPubKey?: undefined | string,
    shouldCreateIfNotFound?: boolean,
    createTargetBlock?: Block,
  } = {}): Promise<AccountStateSnapshot> {
    const {
      specificPubKey,
      shouldCreateIfNotFound = false,
      createTargetBlock,
    } = options

    for await (const ass of this.getState(options)) {
      return ass
    }

    if (shouldCreateIfNotFound) {
      if (!specificPubKey) {
        throw new GetStateInvalidArgumentError(`specificPubKey not specified when creating account state (because not found)`)
      }

      if (!createTargetBlock) {
        throw new GetStateInvalidArgumentError(`createTargetBlock not specified when creating account state (because not found)`)
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

      createTargetBlock.mostRecentAssociatedAccountStateSnapshots.push(newAss)
      return newAss
    } else {
      throw new EntityNotFoundError(`not found specific account state`, `${options}`)
    }
  }

  public async * getState(options: {
    shouldIncludeUnconfirmed?: boolean,
    specificPubKey?: undefined | string,
  } = {}): AsyncGenerator<AccountStateSnapshot> {
    const optionsWithHeight = Object.assign(options, {
      maxBlockHeight: this.height,
    })
    yield * Block.getState(optionsWithHeight)
  }

  public async getFirstSpecificState(options: {
    shouldIncludeUnconfirmed?: boolean,
    specificPubKey?: undefined | string,
    shouldCreateIfNotFound?: boolean,
    createTargetBlock?: Block,
  } = {}): Promise<AccountStateSnapshot> {
    const optionsWithHeight = Object.assign(options, {
      maxBlockHeight: this.height,
    })
    return await Block.getFirstSpecificState(optionsWithHeight)
  }

  public static async calcStateHash({
    state,
    encoding = "hex",
  }: {
    state: AccountStateSnapshot[],
    encoding?: "hex" | "buffer",
  }): Promise<any> {
    const stateHasher = multihashing.createHash("sha2-256")
    for await (const ass of state) {
      stateHasher.update(await ass.calcHash({
        encoding: "buffer",
        shouldAssignHash: false,
        shouldAssignExistingHash: false,
        shouldUseExistingHash: false
      }))
    }

    const resultBuffer: Buffer = multihash.encode(stateHasher.digest(), "sha2-256")
    return encoding === "buffer" ? resultBuffer : resultBuffer.toString(encoding)
  }

  public async calcStateHash({
    encoding = "hex",
    shouldAssignHash = false,
    shouldUseExistingHash = true,
  } = {}): Promise<any> {
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

    const tmpBuffer = Buffer.alloc(8)
    tmpBuffer.writeBigInt64BE(BigInt(obj.version))
    hasher.update(tmpBuffer)
    tmpBuffer.writeBigInt64BE(BigInt(obj.timestamp.getTime()))
    hasher.update(tmpBuffer)
    tmpBuffer.writeBigInt64BE(BigInt(obj.height))
    hasher.update(tmpBuffer)
    hasher.update(Buffer.from(obj.prevHash, "hex"))
    tmpBuffer.writeBigInt64BE(BigInt(obj.mineReward))
    hasher.update(tmpBuffer)
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
          shouldAssignExistingHash: shouldAssignExistingHash,
          shouldUseExistingHash: shouldUseExistingChildHash,
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