import { Entity, Column, OneToMany, BaseEntity, PrimaryColumn } from "typeorm"
import { MultiaddrEntity } from "./MultiaddrEntity"
import PeerInfo from "peer-info"
import PeerId from "peer-id"
import { EntityValueError } from "../errors"
import { assertType, assertInstanceOf, assertCondition, stringIsNotEmpty } from "../xchUtil"
import Multiaddr from "multiaddr"

@Entity()
export class PeerInfoEntity extends BaseEntity {
  @PrimaryColumn()
  id: string

  @Column()
  pubKey: string

  @OneToMany(type => MultiaddrEntity, multiaddrEntity => multiaddrEntity.peerInfoId, { cascade: true })
  multiaddrs: MultiaddrEntity[]

  public static async normalize(sth: any): Promise<PeerInfoEntity> {
    const validateList: [boolean, string, Function, string | any][] = [
      [false, "id", assertType, "string"],
      [false, "id", assertCondition, stringIsNotEmpty],
      [false, "pubKey", assertType, "string"],
      [false, "pubKey", assertCondition, stringIsNotEmpty],
      [true, "multiaddrs", assertInstanceOf, Array],
    ]

    validateList.forEach(([isOptional, propName, assertFunc, assertArg]) => {
      if (!isOptional || sth[propName] !== undefined) {
        assertFunc(sth[propName], assertArg, EntityValueError, `PeerInfoEntity.${propName}`)
      }
    })

    const newObject = new PeerInfoEntity()
    Object.assign(newObject, sth)

    if (sth.multiaddrs !== undefined) {
      const normalizedMultiaddrs = []
      for (const element of (sth.multiaddrs as any[])) {
        assertType(element, "string", EntityValueError, "PeerInfoEntity.multiaddrs[]")
        const multiaddrString: string = element

        normalizedMultiaddrs.push(await MultiaddrEntity.fromObject({
          peerInfoId: sth.id,
          multiaddrString: multiaddrString
        }))
      }

      newObject.multiaddrs = normalizedMultiaddrs
    }

    return newObject
  }

  public static async fromPeerInfo(peerInfo: PeerInfo): Promise<PeerInfoEntity> {
    const pureObject: any = peerInfo.id.toJSON()
    delete pureObject.privKey

    pureObject.multiaddrs = peerInfo.multiaddrs.toArray().map(multiaddr => multiaddr.toString())
    
    const result = await PeerInfoEntity.normalize(pureObject)
    return result
  }

  public async toPeerInfo(): Promise<PeerInfo> {
    const newObject = await PeerInfo.create(await PeerId.createFromJSON(this as any))
    if (this.multiaddrs) {
      for (const multiaddr of this.multiaddrs) {
        newObject.multiaddrs.add(new Multiaddr(multiaddr.addrString))
      }
    }
    return newObject
  }
}
