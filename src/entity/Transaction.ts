import { Entity, Index, Column, PrimaryColumn, ManyToOne, SelectQueryBuilder, getConnection } from "typeorm"
import { EntityNotFoundError } from "typeorm/error/EntityNotFoundError"
import { Block } from "./Block"
import { assertType, assertCondition, stringIsNotEmpty, greaterThanOrEqualTo, assertInstanceOf, isJsonSerializable, isNotNullNorUndefined, assertTypeOrInstanceOf, isUndefinedOrNonEmptyString, TypelessPartial, fullObjectOutput } from "../xchUtil"
import { EntityValueError } from "../errors"
import { validateEntity, findOneWithAllRelationsOrFail } from "./common"
import multihashing from "multihashing"
import multihash from "multihashes"
import objectHash from "object-hash"
import { BaseTransactionHandler, ITransactionVerifyOptions } from "../transactonHandlers/base"
import { Transfer } from "../transactonHandlers/transfer"

const getCurrentEntityConstructor = () => Transaction
type CurrentEntityConstructor = (typeof getCurrentEntityConstructor) extends () => infer R ? R : any
type CurrentEntity = (typeof getCurrentEntityConstructor) extends () => { new (...args: any): infer R } ? R : any
let CurrentEntity: CurrentEntityConstructor
let CurrentEntityNameCamelCase: string
function initCurrentEntity(): void {
  CurrentEntity = getCurrentEntityConstructor()
  CurrentEntityNameCamelCase = CurrentEntity.name[0].toLowerCase() + CurrentEntity.name.slice(1)
}

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
  nonce: number

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

  private static handlers: Record<string, BaseTransactionHandler> = {
    "transfer": new Transfer(),
  }

  public static addLeftJoinAndSelect<ET>(qb: SelectQueryBuilder<ET>): SelectQueryBuilder<ET> {
    return qb
  }

  public static async findOneWithAllRelationsOrFail(condition: TypelessPartial<CurrentEntity>): Promise<CurrentEntity> {
    return await findOneWithAllRelationsOrFail(getCurrentEntityConstructor, CurrentEntityNameCamelCase, condition)
  }

  public static async normalize(sth: TypelessPartial<CurrentEntity>, {
    shouldCheckRelations = false,
    shouldLoadRelationsIfUndefined = false,
    shouldValidate = true,
  } = {}): Promise<CurrentEntity> {
    if (shouldValidate) {
      validateEntity(getCurrentEntityConstructor, sth, [
        [false, "hash", assertCondition, isUndefinedOrNonEmptyString],
        [false, "seqInBlock", assertType, "number"],
        [false, "seqInBlock", assertCondition, Number.isInteger],
        [false, "seqInBlock", assertCondition, [[greaterThanOrEqualTo(0)]]],
        [false, "type", assertType, "string"],
        [false, "type", assertCondition, stringIsNotEmpty],
        [false, "nonce", assertType, "number"],
        [false, "nonce", assertCondition, greaterThanOrEqualTo(0)],
        [false, "nonce", assertCondition, Number.isInteger],
        [false, "amount", assertType, "number"],
        [false, "amount", assertCondition, Number.isInteger],
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
      ])
    }

    let newObj: CurrentEntity

    // reload entity with relations or normalize entity including all children
    if (shouldLoadRelationsIfUndefined && (
      false // no relations
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
        void 0
      }
    }

    // do other necessary normalization

    if (typeof sth.timestamp === "string") {
      newObj.timestamp = new Date(newObj.timestamp)
      if (isNaN(newObj.timestamp.getTime())) {
        throw new EntityValueError(`Transaction.timestamp cannot be formatted to a Date: ${sth.timestamp}`)
      }
    }

    return newObj
  }

  public async calcHash(options: {
    encoding: "hex",
    shouldAssignHash: boolean,
  }): Promise<string> 
  public async calcHash(options: {
    encoding: "buffer",
    shouldAssignHash: boolean,
  }): Promise<Buffer> 
  public async calcHash({
    encoding = "hex",
    shouldAssignHash = false,
  }): Promise<any> {
    const obj: Transaction = this

    const hasher = multihashing.createHash("sha2-256")

    const tempBuffer = Buffer.alloc(8)
    tempBuffer.writeBigInt64BE(BigInt(obj.seqInBlock))
    hasher.update(tempBuffer)
    hasher.update(Buffer.from(obj.type, "utf-8"))
    tempBuffer.writeBigInt64BE(BigInt(obj.nonce))
    hasher.update(tempBuffer)
    tempBuffer.writeBigInt64BE(BigInt(obj.amount))
    hasher.update(tempBuffer)
    tempBuffer.writeBigInt64BE(BigInt(obj.fee))
    hasher.update(tempBuffer)
    tempBuffer.writeBigInt64BE(BigInt(obj.timestamp.getTime()))
    hasher.update(tempBuffer)
    hasher.update(Buffer.from(obj.sender, "utf-8"))
    hasher.update(Buffer.from(obj.recipient, "utf-8"))
    hasher.update(objectHash(obj.extraData, { algorithm: "sha256", encoding: "buffer" }))

    const resultBuffer: Buffer = multihash.encode(hasher.digest(), "sha2-256")

    if (shouldAssignHash) {
      this.hash = resultBuffer.toString("hex")
      return encoding === "buffer" ? resultBuffer : encoding === "hex" ? this.hash : resultBuffer.toString(encoding)
    } else {
      return encoding === "buffer" ? resultBuffer : resultBuffer.toString(encoding)
    }
  }

  public async apply(options: {
    baseBlock: Block,
    targetBlock: Block,
  }): Promise<void> {
    await Transaction.handlers[this.type].apply({
      ...options,
      transaction: this,
    })
  }

  public async verify(options: Omit<ITransactionVerifyOptions, "transaction">): Promise<void> {
    await Transaction.handlers[this.type].verify({
      ...options,
      transaction: this,
    })
  }
}

initCurrentEntity()
