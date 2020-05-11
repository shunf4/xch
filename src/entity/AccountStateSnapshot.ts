import { Entity, Column, PrimaryColumn, ManyToOne, OneToMany, SelectQueryBuilder, getConnection, ManyToMany, JoinTable } from "typeorm"
import { EntityNotFoundError } from "typeorm/error/EntityNotFoundError"
import { Transaction } from "./Transaction"
import { Block } from "./Block"
import { Role } from "./Role"
import { assertType, assertCondition, assertInstanceOf, stringIsNotEmpty, greaterThanOrEqualTo, assertTypeOrInstanceOf, passesAssertion, isJsonSerializable, isUndefinedOrNonEmptyString, TypelessPartial, NonFunctionProperties } from "../xchUtil"
import { EntityValueError } from "../errors"
import { validateEntity } from "./common"
import multihash from "multihashes"
import multihashing from "multihashing"
import objectHash from "object-hash"

const getCurrentEntityConstructor = () => AccountStateSnapshot
type CurrentEntityConstructor = (typeof getCurrentEntityConstructor) extends () => infer R ? R : any
type CurrentEntity = (typeof getCurrentEntityConstructor) extends () => { new (...args: any): infer R } ? R : any
let CurrentEntity: CurrentEntityConstructor
let CurrentEntityNameCamelCase: string
function initCurrentEntity(): void {
  CurrentEntity = getCurrentEntityConstructor()
  CurrentEntityNameCamelCase = CurrentEntity.name[0].toLowerCase() + CurrentEntity.name.slice(1)
}

@Entity()
export class AccountStateSnapshot {
  @PrimaryColumn()
  hash: string

  @Column()
  pubKey: string  // PeerId's pubKey

  @Column()
  nonce: number

  @Column()
  balance: number

  @Column("simple-json")
  state: any

  @ManyToMany(type => Block, block => block.mostRecentAssociatedAccountStateSnapshots)
  mostRecentAssociatedBlock: Block

  @ManyToMany(type => Role, role => role.account, { cascade: true })
  @JoinTable()
  roles: Role[]

  public static addLeftJoinAndSelect<ET>(qb: SelectQueryBuilder<ET>): SelectQueryBuilder<ET> {
    let currentJoined = qb
      .leftJoinAndSelect("accountStateSnapshot.roles", "role")

    currentJoined = Role.addLeftJoinAndSelect<ET>(currentJoined)

    return currentJoined
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
      shouldUseExistingHash?: boolean,
      shouldAssignExistingHash?: boolean,
    },
  } = {}): Promise<CurrentEntity> {
    if (shouldValidate) {
      validateEntity(getCurrentEntityConstructor, sth, [
        [false, "hash", assertCondition, isUndefinedOrNonEmptyString],
        [false, "pubKey", assertType, "string"],
        [false, "pubKey", assertCondition, stringIsNotEmpty],
        [false, "nonce", assertType, "number"],
        [false, "nonce", assertCondition, greaterThanOrEqualTo(0)],
        [false, "balance", assertType, "number"],
        [false, "balance", assertCondition, greaterThanOrEqualTo(0)],
        [false, "state", assertType, "object"],
        [false, "state", assertCondition, isJsonSerializable],
        [false, "mostRecentAssociatedBlock", assertType, ["undefined", "object"]],

        [false, "roles", assertTypeOrInstanceOf, ["undefined", Array]],
      ])
    }

    let newObj: CurrentEntity

    // reload entity with relations or normalize entity including all children
    if (shouldLoadRelationsIfUndefined && (
      sth.roles === undefined
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
        if (sth.roles !== undefined) {
          newObj.roles = []
          for (const role of sth.roles) {
            newObj.roles.push(await Role.normalize(role, arguments[1]))
          }
        }
      }
    }

    // do other necessary normalization

    if (shouldCalcAndAssignHash) {
      await newObj.calcHash(calcHashArgs)
    }
    return newObj
  }

  public async calcHash({
    encoding = "hex",
    shouldAssignHash = false,
    shouldUseExistingHash = true,
    shouldAssignExistingHash = false
  }): Promise<any> {
    let obj: AccountStateSnapshot = this

    const hasher = multihashing.createHash("sha2-256")
    hasher.update(Buffer.from(obj.pubKey, "utf-8"))

    const tmpBuffer = Buffer.alloc(8)
    tmpBuffer.writeBigInt64BE(BigInt(obj.nonce))
    hasher.update(tmpBuffer)
    tmpBuffer.writeBigInt64BE(BigInt(obj.balance))
    hasher.update(tmpBuffer)
    hasher.update(objectHash(obj.state, { algorithm: "sha256", encoding: "buffer" }))

    const rolesHasher = multihashing.createHash("sha2-256")

    if (obj.roles === undefined) {
      obj = await AccountStateSnapshot.normalize(obj, {
        shouldLoadRelationsIfUndefined: true
      })
    }
    
    for (const role of this.roles) {
      if (shouldUseExistingHash) {
        rolesHasher.update(Buffer.from(role.hash, "hex"))
      } else {
        rolesHasher.update(await role.calcHash({
          encoding: "buffer",
          shouldAssignHash: shouldAssignExistingHash,
          shouldAssignExistingHash: shouldAssignExistingHash,
          shouldUseExistingHash: shouldUseExistingHash,
        }))
      }
    }
    hasher.update(multihash.encode(rolesHasher.digest(), "sha2-256"))

    const resultBuffer: Buffer = multihash.encode(hasher.digest(), "sha2-256")

    if (shouldAssignHash) {
      this.hash = resultBuffer.toString("hex")
      return encoding === "buffer" ? resultBuffer : encoding === "hex" ? this.hash : resultBuffer.toString(encoding)
    } else {
      return encoding === "buffer" ? resultBuffer : resultBuffer.toString(encoding)
    }
  }

  public async reorder({ reverse } = { reverse: false }): Promise<AccountStateSnapshot> {
    this.roles?.sort((ra, rb) => (+(ra.name > rb.name) - +(ra.name < rb.name)))

    if (reverse) {
      this.roles?.reverse()
    }
    
    return this
  }
}

initCurrentEntity()