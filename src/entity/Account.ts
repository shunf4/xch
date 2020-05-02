import { Entity, Column, PrimaryColumn, ManyToMany } from "typeorm"
import { Transaction } from "./Transaction"
import { Block } from "./Block"
import { assertType, assertCondition, assertInstanceOf, stringIsNotEmpty, greaterThanOrEqualTo, assertTypeOrInstanceOf, passesAssertion, isJsonSerializable } from "../xchUtil"
import { EntityValueError } from "../errors"
import { CommonNormalizeOption, completeNormalizeOption } from "./common"

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

  @ManyToMany(type => Block, block => block.accountStateSnapshots)
  blocks: Block[]

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
      [false, "blocks", assertInstanceOf, Array],
    ]

    validateList.forEach(([isOptional, propName, assertFunc, assertArg]) => {
      if (!isOptional || sth[propName] !== undefined) {
        assertFunc(sth[propName], assertArg, EntityValueError, `AccountStateSnapshot.${propName}`)
      }
    })

    const newObj = new AccountStateSnapshot()
    Object.assign(newObj, sth)

    completeNormalizeOption(options)

    newObj.blocks = []
    for (const block of sth.blocks) {
      newObj.blocks.push(options.checkReations ? await Block.normalize(block) : block)
    }

    return newObj
  }

  public static async fromObject(obj: Partial<AccountStateSnapshot>): Promise<AccountStateSnapshot> {
    return await AccountStateSnapshot.normalize(obj)
  }
}
