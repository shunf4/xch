import { Entity, Index, Column, PrimaryColumn, ManyToOne, SelectQueryBuilder, getConnection } from "typeorm"
import { EntityNotFoundError } from "typeorm/error/EntityNotFoundError"
import { Block } from "./Block"
import { assertType, assertCondition, stringIsNotEmpty, greaterThanOrEqualTo, assertInstanceOf, isJsonSerializable, isNotNullNorUndefined, assertTypeOrInstanceOf, isUndefinedOrNonEmptyString, TypelessPartial } from "../xchUtil"
import { EntityValueError } from "../errors"
import { validateEntity } from "./common"
import multihashing from "multihashing"
import multihash from "multihashes"
import objectHash from "object-hash"

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

  public static addLeftJoinAndSelect<ET>(qb: SelectQueryBuilder<ET>): SelectQueryBuilder<ET> {
    return qb
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
      let allRelationsSqb = getConnection()
        .createQueryBuilder(CurrentEntity, CurrentEntityNameCamelCase)
        .where(`${CurrentEntityNameCamelCase}.hash = :hash`, sth)

      allRelationsSqb = CurrentEntity.addLeftJoinAndSelect(allRelationsSqb)

      newObj = await allRelationsSqb.getOne()

      if (newObj === undefined) {
        throw new EntityNotFoundError(CurrentEntity, `hash: ${sth.hash}`)
      }
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

  public async calcHash({
    encoding = "hex",
    shouldAssignHash = false,
    shouldUseExistingHash = true,
    shouldAssignExistingHash = false,
    shouldUseExistingAssHash = true,
  }): Promise<any> {
    const obj: Transaction = this

    const hasher = multihashing.createHash("sha2-256")

    const tmpBuffer = Buffer.alloc(8)
    tmpBuffer.writeBigInt64BE(BigInt(obj.seqInBlock))
    hasher.update(tmpBuffer)
    hasher.update(Buffer.from(obj.type, "utf-8"))
    tmpBuffer.writeBigInt64BE(BigInt(obj.nonce))
    hasher.update(tmpBuffer)
    tmpBuffer.writeBigInt64BE(BigInt(obj.amount))
    hasher.update(tmpBuffer)
    tmpBuffer.writeBigInt64BE(BigInt(obj.fee))
    hasher.update(tmpBuffer)
    tmpBuffer.writeBigInt64BE(BigInt(obj.timestamp.getTime()))
    hasher.update(tmpBuffer)
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

  public async apply({
    currentBlock,
    nextBlock,
  }: {
    currentBlock: Block,
    nextBlock: Block,
  }): Promise<void> {
    if (this.type === "transfer") {
      const sender = await currentBlock.getFirstSpecificState
    }
  }
}

initCurrentEntity()
