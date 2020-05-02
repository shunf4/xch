import { Entity, Column, PrimaryColumn, Index, OneToMany, ManyToMany, ManyToOne, BaseEntity, JoinTable } from "typeorm"
import { Transaction } from "./Transaction"
import { assertType, assertCondition, assertInstanceOf, stringIsNotEmpty, greaterThanOrEqualTo, assertTypeOrInstanceOf, passesAssertion } from "../xchUtil"
import { EntityValueError } from "../errors"
import { AccountStateSnapshot } from "./Account"
import { CommonNormalizeOption } from "./common"

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
  prevHash: string

  @Column()
  mineReward: number

  @Column()
  generator: string // pubkey multihash

  @OneToMany(type => Transaction, transaction => transaction.block, { cascade: true })
  transactions: Transaction[]

  @Column()
  transactionsHash: string

  @ManyToMany(type => AccountStateSnapshot, accountStateSnapShot => accountStateSnapShot.blocks)
  @JoinTable()
  accountStateSnapshots: AccountStateSnapshot[]

  @Column()
  stateHash: string

  @Column()
  signature: string

  public static async normalize(sth: any, options: CommonNormalizeOption = {}): Promise<Block> {
    const validateList: [boolean, string, Function, string | any][] = [
      [false, "hash", assertType, "string"],
      [false, "hash", assertCondition, stringIsNotEmpty],
      [false, "version", assertType, "number"],
      [false, "version", assertCondition, function eqaulsOne(version: number): boolean {
        return version === 1
      }],
      [false, "timestamp", assertTypeOrInstanceOf, ["string", Date]],
      [false, "height", assertType, "number"],
      [false, "height", assertCondition, Number.isInteger],
      [false, "height", assertCondition, [[greaterThanOrEqualTo(0), greaterThanOrEqualTo(-3)], [greaterThanOrEqualTo(-3), greaterThanOrEqualTo(0)]]],
      [false, "prevHash", assertType, "string"],
      [false, "prevHash", assertCondition, stringIsNotEmpty],
      [false, "mineReward", assertType, "number"],
      [false, "mineReward", assertCondition, Number.isInteger],
      [false, "mineReward", assertCondition, greaterThanOrEqualTo(0)],
      [false, "generator", assertType, "string"],
      [false, "generator", assertCondition, stringIsNotEmpty],
      [false, "transactions", assertInstanceOf, Array],
      [false, "transactionsHash", assertType, "string"],
      [false, "transactionsHash", assertCondition, stringIsNotEmpty],
      [false, "accountStateSnapshots", assertInstanceOf, Array],
      [false, "stateHash", assertCondition, stringIsNotEmpty],
      [false, "signature", assertType, "string"],
    ]

    validateList.forEach(([isOptional, propName, assertFunc, assertArg]) => {
      if (!isOptional || sth[propName] !== undefined) {
        assertFunc(sth[propName], assertArg, EntityValueError, `Block.${propName}`)
      }
    })

    const newObj = new Block()
    Object.assign(newObj, sth)

    if (typeof sth.timestamp === "string") {
      newObj.timestamp = new Date(newObj.timestamp)
      if (isNaN(newObj.timestamp.getTime())) {
        throw new EntityValueError(`Block.timestamp cannot be formatted to a Date: ${sth.timestamp}`)
      }
    }

    newObj.transactions = []
    for (const transaction of sth.transactions) {
      newObj.transactions.push(await Transaction.normalize(transaction))
    }

    newObj.accountStateSnapshots = []
    for (const accountStateSnapshot of sth.accountStateSnapshots) {
      newObj.accountStateSnapshots.push(await AccountStateSnapshot.normalize(accountStateSnapshot))
    }

    return newObj
  }

  public static async fromObject(obj: Partial<Block>, options?: CommonNormalizeOption): Promise<Block> {
    return await Block.normalize(obj, options)
  }

  public async reorder({ reverse } = { reverse: false }): Promise<Block> {
    this.transactions?.sort((ta, tb) => ta.seqInBlock - tb.seqInBlock)
    this.accountStateSnapshots?.sort((aa, ab) => (+(aa.publicKey > ab.publicKey) - +(aa.publicKey < ab.publicKey)))

    if (reverse) {
      this.transactions?.reverse()
      this.accountStateSnapshots?.reverse()
    }
    
    return this
  }
}
