import { Entity, Column, PrimaryColumn, ManyToOne } from "typeorm"
import { Transaction } from "./Transaction"
import { Block } from "./Block"
import { assertType, assertCondition, assertInstanceOf, stringIsNotEmpty, greaterThanOrEqualTo, assertTypeOrInstanceOf, passesAssertion, isJsonSerializable } from "../xchUtil"
import { EntityValueError } from "../errors"
import { CommonNormalizeOption, completeNormalizeOption } from "./common"
import Multihashing from "multihashing";

@Entity()
export class AccountStateSnapshot {
  @PrimaryColumn()
  publicKey: string  // same format as PeerId

  @Column()
  nonce: number

  @Column()
  balance: number

  @Column("simple-json")
  state: any

  @ManyToOne(type => Block, block => block.mostRecentAssociatedAccountStateSnapshots)
  mostRecentAssociatedBlock: Block

  public static async normalize(sth: any, options: CommonNormalizeOption = {}): Promise<AccountStateSnapshot> {
    const validateList: [boolean, string, Function, string | any][] = [
      [false, "publicKey", assertType, "string"],
      [false, "publicKey", assertCondition, stringIsNotEmpty],
      [false, "nonce", assertType, "number"],
      [false, "nonce", assertCondition, greaterThanOrEqualTo(0)],
      [false, "balance", assertType, "number"],
      [false, "balance", assertCondition, greaterThanOrEqualTo(0)],
      [false, "state", assertType, "object"],
      [false, "state", assertCondition, isJsonSerializable],
      [false, "mostRecentAssociatedBlock", assertType, "object"],
    ]

    validateList.forEach(([isOptional, propName, assertFunc, assertArg]) => {
      if (!isOptional || sth[propName] !== undefined) {
        assertFunc(sth[propName], assertArg, EntityValueError, `AccountStateSnapshot.${propName}`)
      }
    })

    const newObj = new AccountStateSnapshot()
    Object.assign(newObj, sth)

    completeNormalizeOption(options)

    newObj.mostRecentAssociatedBlock = options.checkReations ? await Block.normalize(sth.mostRecentAssociatedBlock) : sth.mostRecentAssociatedBlock

    return newObj
  }

  public static async fromObject(obj: Partial<AccountStateSnapshot>): Promise<AccountStateSnapshot> {
    return await AccountStateSnapshot.normalize(obj)
  }

  public async hash() {
    const hasher = Multihashing.createHash("sha2-256")
    let tmpBuffer: Buffer
    hasher.update(Buffer.from(this.publicKey, "utf-8"))
    tmpBuffer = Buffer.alloc(8)
    tmpBuffer.writeBigInt64BE(BigInt(this.nonce))
    hasher.update(tmpBuffer)
    tmpBuffer.writeBigInt64BE(BigInt(this.balance))
    hasher.update(tmpBuffer)
  }
}
