import { Entity, Index, Column, PrimaryColumn, ManyToOne } from "typeorm"
import { Block } from "./Block"
import { assertType, assertCondition, stringIsNotEmpty, greaterThanOrEqualTo, assertInstanceOf, isJsonSerializable } from "../xchUtil"
import { EntityValueError } from "../errors"

@Entity()
@Index(["blockHash", "seqInBlock"], { unique: true })
export class Transaction {
  @PrimaryColumn()
  hash: string

  @ManyToOne(type => Block, block => block.transactionsHash, { onDelete: "CASCADE" })
  blockHash: string

  @Column()
  seqInBlock: number

  @Column()
  type: string

  @Column()
  amount: number

  @Column()
  fee: number

  @Column()
  timestamp: Date

  @Column()
  sender: string

  @Column()
  recipient: string

  @Column()
  signature: string

  @Column("simple-json")
  extraData: any


  public static async normalize(sth: any): Promise<Transaction> {
    const validateList: [boolean, string, Function, string | any][] = [
      [false, "hash", assertType, "string"],
      [false, "hash", assertCondition, stringIsNotEmpty],
      [false, "blockHash", assertType, "string"],
      [false, "blockHash", assertCondition, stringIsNotEmpty],
      [false, "seqInBlock", assertType, "number"],
      [false, "seqInBlock", assertCondition, [[greaterThanOrEqualTo(0)]]],
      [false, "type", assertType, "string"],
      [false, "type", assertCondition, stringIsNotEmpty],
      [false, "amount", assertType, "number"],
      [false, "amount", assertCondition, greaterThanOrEqualTo(0)],
      [false, "fee", assertType, "number"],
      [false, "fee", assertCondition, greaterThanOrEqualTo(0)],
      [false, "timestamp", assertInstanceOf, Date],
      [false, "sender", assertType, "string"],
      [false, "sender", assertCondition, stringIsNotEmpty],
      [false, "recipient", assertType, "string"],
      [false, "signature", assertType, "string"],
      [false, "signature", assertCondition, stringIsNotEmpty],
      [false, "extraData", assertCondition, isJsonSerializable],
    ]

    validateList.forEach(([isOptional, propName, assertFunc, assertArg]) => {
      if (!isOptional || sth[propName] !== undefined) {
        assertFunc(sth[propName], assertArg, EntityValueError, `Transaction.${propName}`)
      }
    })

    const newObject = new Transaction()
    Object.assign(newObject, sth)

    return newObject
  }

  public static async fromObject(obj: any): Promise<Transaction> {
    return await Transaction.normalize(obj)
  }
}
