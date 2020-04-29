import { Entity, Column, PrimaryColumn, ManyToOne } from "typeorm"
import { Transaction } from "./Transaction"

@Entity()
export class AccountStateSnapshot {
  @PrimaryColumn()
  hash: string

  @Column()
  nonce: number

  @Column()
  publicKey: string  // same format as PeerId

  @Column("simple-json")
  state: any

  @ManyToOne(type => Transaction)
  transaction: Transaction
}
