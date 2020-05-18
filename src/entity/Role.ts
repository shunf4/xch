import { Entity, Column, PrimaryColumn, ManyToMany, getConnection, SelectQueryBuilder } from "typeorm"
import { EntityNotFoundError } from "typeorm/error/EntityNotFoundError"
import { Block } from "./Block"
import { assertType, assertCondition, assertInstanceOf, stringIsNotEmpty, greaterThanOrEqualTo, assertTypeOrInstanceOf, passesAssertion, isJsonSerializable, isUndefinedOrNonEmptyString, TypelessPartial, fullObjectOutput, isNotNullNorUndefined } from "../xchUtil"
import { EntityValueError } from "../errors"
import { validateEntity, findOneWithAllRelationsOrFail } from "./common"
import multihashing from "multihashing"
import multihash from "multihashes"
import { AccountStateSnapshot } from "./AccountStateSnapshot"

const getCurrentEntityConstructor = () => Role
type CurrentEntityConstructor = (typeof getCurrentEntityConstructor) extends () => infer R ? R : any
type CurrentEntity = (typeof getCurrentEntityConstructor) extends () => { new (...args: any): infer R } ? R : any
let CurrentEntity: CurrentEntityConstructor
let CurrentEntityNameCamelCase: string
function initCurrentEntity(): void {
  CurrentEntity = getCurrentEntityConstructor()
  CurrentEntityNameCamelCase = CurrentEntity.name[0].toLowerCase() + CurrentEntity.name.slice(1)
}

@Entity()
export class Role {
  @PrimaryColumn()
  hash: string

  @Column()
  name: string

  @Column()
  score: number

  @ManyToMany(type => AccountStateSnapshot, account => account.roles)
  account: AccountStateSnapshot

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
        [false, "name", assertType, "string"],
        [false, "name", assertCondition, stringIsNotEmpty],
        [false, "score", assertType, "number"],
        [false, "score", assertCondition, Number.isInteger],
        [false, "score", assertCondition, greaterThanOrEqualTo(0)],
      ])
    }

    let newObj: CurrentEntity

    // reload entity with relations or normalize entity including all children
    if (shouldLoadRelationsIfUndefined && (
      false // no relations.
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

    return newObj
  }

  public async calcHash({
    encoding = "hex",
    shouldAssignHash = false,
    shouldUseExistingHash = false,
    shouldAssignExistingHash = false
  }): Promise<any> {
    const hasher = multihashing.createHash("sha2-256")
    hasher.update(Buffer.from(this.name, "utf-8"))

    const tempBuffer = Buffer.alloc(8)
    tempBuffer.writeBigInt64BE(BigInt(this.score))
    hasher.update(tempBuffer)

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