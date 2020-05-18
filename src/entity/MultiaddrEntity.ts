import { Entity, Column, ManyToOne, PrimaryGeneratedColumn, ManyToMany, SelectQueryBuilder } from "typeorm"
import { PeerInfoEntity } from "./PeerInfoEntity"
import { TypelessPartial } from "../xchUtil"

const getCurrentEntityConstructor = () => MultiaddrEntity
type CurrentEntityConstructor = (typeof getCurrentEntityConstructor) extends () => infer R ? R : any
type CurrentEntity = (typeof getCurrentEntityConstructor) extends () => { new (...args: any): infer R } ? R : any
let CurrentEntity: CurrentEntityConstructor
let CurrentEntityNameCamelCase: string
function initCurrentEntity(): void {
  CurrentEntity = getCurrentEntityConstructor()
  CurrentEntityNameCamelCase = CurrentEntity.name[0].toLowerCase() + CurrentEntity.name.slice(1)
}

@Entity()
export class MultiaddrEntity {
  @PrimaryGeneratedColumn()
  id: number

  @ManyToOne(type => PeerInfoEntity, peerInfoEntity => peerInfoEntity.multiaddrs, { onDelete: "CASCADE" })
  peerInfoId: string

  @Column()
  addrString: string

  public static addLeftJoinAndSelect<ET>(qb: SelectQueryBuilder<ET>): SelectQueryBuilder<ET> {
    return qb
  }

  public static async normalize(sth: TypelessPartial<CurrentEntity>, {
    shouldCheckRelations = false,
    shouldLoadRelationsIfUndefined = false
  } = {}): Promise<CurrentEntity> {
    const newObj = new MultiaddrEntity()
    newObj.peerInfoId = sth.peerInfoId
    newObj.addrString = sth.addrString
    return newObj
  }
}

initCurrentEntity()