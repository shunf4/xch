import { Entity, Column, PrimaryColumn, Index, OneToMany, ManyToMany, ManyToOne } from "typeorm"
import { Transaction } from "./Transaction"
import { assertType, assertCondition, assertInstanceOf, stringIsNotEmpty, greaterThanOrEqualTo } from "../xchUtil"
import { EntityValueError } from "../errors"

@Entity()
@Index(["hash"], { unique: true })
export class Block {

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

  @OneToMany(type => Transaction, transaction => transaction.blockHash, { cascade: true })
  transactions: Transaction[]

  @Column()
  transactionsHash: string

  @Column()
  stateHash: string

  @Column()
  signature: Buffer

  public static async normalize(sth: any): Promise<Block> {
    const validateList: [boolean, string, Function, string | any][] = [
      [false, "hash", assertType, "string"],
      [false, "hash", assertCondition, stringIsNotEmpty],
      [false, "version", assertType, "number"],
      [false, "version", assertCondition, function eqaulsOne(version: number): boolean {
        return version === 1
      }],
      [false, "timestamp", assertInstanceOf, Date],
      [false, "height", assertType, "number"],
      [false, "height", assertCondition, [[greaterThanOrEqualTo(0)]]],
      [false, "prevHash", assertType, "string"],
      [false, "prevHash", assertCondition, stringIsNotEmpty],
      [false, "mineReward", assertType, "number"],
      [false, "mineReward", assertType, greaterThanOrEqualTo(0)],
      [false, "generator", assertType, "string"],
      [false, "generator", assertCondition, stringIsNotEmpty],
      [false, "transactions", assertInstanceOf, Array],
      [false, "transactionHash", assertType, "string"],
      [false, "transactionHash", assertCondition, stringIsNotEmpty],
      [false, "stateHash", assertType, "string"],
      [false, "stateHash", assertCondition, stringIsNotEmpty],
      [false, "signature", assertInstanceOf, Buffer],
    ]

    validateList.forEach(([isOptional, propName, assertFunc, assertArg]) => {
      if (!isOptional || sth[propName] !== undefined) {
        assertFunc(sth[propName], assertArg, EntityValueError, `Block.${propName}`)
      }
    })

    const newObject = new Block()
    Object.assign(newObject, sth)

    newObject.transactions = []
    for (const transaction of sth.transactions) {
      newObject.transactions.push(await Transaction.normalize(transaction))
    }

    return newObject
  }

  public static async fromObject(obj: any): Promise<Block> {
    return await Block.normalize(obj)
  }
}
