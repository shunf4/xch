import { Entity, Column, OneToMany, BaseEntity, PrimaryColumn, getConnection, SelectQueryBuilder } from "typeorm"
import { MultiaddrEntity } from "./MultiaddrEntity"
import PeerInfo from "peer-info"
import PeerId from "peer-id"
import { EntityValueError } from "../errors"
import { assertType, assertInstanceOf, assertCondition, stringIsNotEmpty, assertTypeOrInstanceOf, TypelessPartial } from "../xchUtil"
import Multiaddr from "multiaddr"
import { validateEntity } from "./common"

const getCurrentEntityConstructor = () => PeerInfoEntity
type CurrentEntityConstructor = (typeof getCurrentEntityConstructor) extends () => infer R ? R : any
type CurrentEntity = (typeof getCurrentEntityConstructor) extends () => { new (...args: any): infer R } ? R : any
let CurrentEntity: CurrentEntityConstructor
let CurrentEntityNameCamelCase: string
function initCurrentEntity(): void {
  CurrentEntity = getCurrentEntityConstructor()
  CurrentEntityNameCamelCase = CurrentEntity.name[0].toLowerCase() + CurrentEntity.name.slice(1)
}

@Entity()
export class PeerInfoEntity extends BaseEntity {
  @PrimaryColumn()
  id: string

  @Column()
  pubKey: string

  @OneToMany(type => MultiaddrEntity, multiaddrEntity => multiaddrEntity.peerInfoId, { cascade: true })
  multiaddrs: MultiaddrEntity[]

  public static addLeftJoinAndSelect<ET>(qb: SelectQueryBuilder<ET>): SelectQueryBuilder<ET> {
    let currentJoined = qb
      .leftJoinAndSelect("peerInfoEntity.multiaddrs", "multiaddrEntity")

    currentJoined = MultiaddrEntity.addLeftJoinAndSelect<ET>(currentJoined)

    return currentJoined
  }

  public static async normalize(sth: TypelessPartial<CurrentEntity>, {
    shouldCheckRelations = false,
    shouldLoadRelationsIfUndefined = false
  } = {}): Promise<CurrentEntity> {
    validateEntity(getCurrentEntityConstructor, sth, [
      [false, "id", assertType, "string"],
      [false, "id", assertCondition, stringIsNotEmpty],
      [false, "pubKey", assertType, "string"],
      [false, "pubKey", assertCondition, stringIsNotEmpty],

      [true, "multiaddrs", assertTypeOrInstanceOf, ["undefined", Array]],
    ])

    let newObj: CurrentEntity

    // reload entity with relations or normalize entity including all children
    if (shouldLoadRelationsIfUndefined && (
      sth.multiaddrs === undefined
    )) {
      // reload entity with relations
      let allRelationsSqb = getConnection()
        .createQueryBuilder(CurrentEntity, CurrentEntityNameCamelCase)
        .where(`${CurrentEntityNameCamelCase}.id = :id`, sth)

      allRelationsSqb = CurrentEntity.addLeftJoinAndSelect(allRelationsSqb)

      newObj = await allRelationsSqb.getOne()
    } else {
      // normalize entity and all children
      newObj = new CurrentEntity()
      Object.assign(newObj, sth)

      if (shouldCheckRelations) {
        if (sth.multiaddrs !== undefined) {
          newObj.multiaddrs = []

          for (const element of (sth.multiaddrs as any[])) {
            if (typeof element === "string") {
              const multiaddrString: string = element

              newObj.multiaddrs.push(await MultiaddrEntity.normalize({
                peerInfoId: sth.id,
                addrString: multiaddrString
              }))
            } else {
              newObj.multiaddrs.push(await MultiaddrEntity.normalize(element))
            }
          }
        }
      }
    }

    // do other necessary normalization

    return newObj
  }

  public static async fromPeerInfo(peerInfo: PeerInfo): Promise<PeerInfoEntity> {
    const pureObject: any = peerInfo.id.toJSON()
    delete pureObject.privKey

    pureObject.multiaddrs = peerInfo.multiaddrs.toArray().map(multiaddr => multiaddr.toString())
    
    const result = await PeerInfoEntity.normalize(pureObject)
    return result
  }

  public async toPeerInfo(): Promise<PeerInfo> {
    const newObj = await PeerInfo.create(await PeerId.createFromJSON(this as any))
    if (this.multiaddrs) {
      for (const multiaddr of this.multiaddrs) {
        newObj.multiaddrs.add(new Multiaddr(multiaddr.addrString))
      }
    }
    return newObj
  }
}

initCurrentEntity()
