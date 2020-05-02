import { Entity, Index, Column, PrimaryColumn, ManyToOne } from "typeorm"
import { Block } from "./Block"
import { assertType, assertCondition, stringIsNotEmpty, greaterThanOrEqualTo, assertInstanceOf, isJsonSerializable, isNotNullNorUndefined, assertTypeOrInstanceOf } from "../xchUtil"
import { EntityValueError } from "../errors"
import { CommonNormalizeOption } from "./common"

@Entity()
@Index(["block", "seqInBlock"], { unique: true })
export class Transaction {
  @PrimaryColumn()
  hash: string

  @ManyToOne(type => Block, block => block.transactions, { onDelete: "CASCADE" })
  block: Block

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


  public static async normalize(sth: any, options: CommonNormalizeOption = {}): Promise<Transaction> {
    const validateList: [boolean, string, Function, string | any][] = [
      [false, "hash", assertType, "string"],
      [false, "hash", assertCondition, stringIsNotEmpty],
      [false, "seqInBlock", assertType, "number"],
      [false, "seqInBlock", assertCondition, Number.isInteger],
      [false, "seqInBlock", assertCondition, [[greaterThanOrEqualTo(0)]]],
      [false, "type", assertType, "string"],
      [false, "type", assertCondition, stringIsNotEmpty],
      [false, "amount", assertType, "number"],
      [false, "amount", assertCondition, greaterThanOrEqualTo(0)],
      [false, "fee", assertType, "number"],
      [false, "fee", assertCondition, Number.isInteger],
      [false, "fee", assertCondition, greaterThanOrEqualTo(0)],
      [false, "timestamp", assertTypeOrInstanceOf, ["string", Date]],
      [false, "sender", assertType, "string"],
      [false, "sender", assertCondition, stringIsNotEmpty],
      [false, "recipient", assertType, "string"],
      [false, "signature", assertType, "string"],
      [false, "signature", assertCondition, stringIsNotEmpty],
      [false, "extraData", assertCondition, [[isJsonSerializable, isNotNullNorUndefined]]],
    ]

    validateList.forEach(([isOptional, propName, assertFunc, assertArg]) => {
      if (!isOptional || sth[propName] !== undefined) {
        assertFunc(sth[propName], assertArg, EntityValueError, `Transaction.${propName}`)
      }
    })

    const newObj = new Transaction()
    Object.assign(newObj, sth)

    if (typeof sth.timestamp === "string") {
      newObj.timestamp = new Date(newObj.timestamp)
      if (isNaN(newObj.timestamp.getTime())) {
        throw new EntityValueError(`Transaction.timestamp cannot be formatted to a Date: ${sth.timestamp}`)
      }
    }

    return newObj
  }

  public static async fromObject(obj: Partial<Transaction>, options?: CommonNormalizeOption): Promise<Transaction> {
    return await Transaction.normalize(obj, options)
  }
}
