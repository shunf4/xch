import { Entity, Column, ManyToOne, PrimaryGeneratedColumn, ManyToMany } from "typeorm"
import { PeerInfoEntity } from "./PeerInfoEntity"

@Entity()
export class MultiaddrEntity {
  @PrimaryGeneratedColumn()
  id: number

  @ManyToOne(type => PeerInfoEntity, peerInfoEntity => peerInfoEntity.multiaddrs, { onDelete: "CASCADE" })
  peerInfoId: string

  @Column()
  addrString: string

  private constructor() {
  }

  public static async fromObject({ peerInfoId, multiaddrString }: { peerInfoId: string, multiaddrString: string }): Promise<MultiaddrEntity> {
    const newObject = new MultiaddrEntity()
    newObject.peerInfoId = peerInfoId
    newObject.addrString = multiaddrString
    return newObject
  }
}
