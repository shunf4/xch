import { Entity, Column, PrimaryColumn, Index, OneToMany } from "typeorm"
import { Transaction } from "./Transaction"

@Entity()
export class Block {

  @PrimaryColumn()
  @Index({ unique: true })
  hash: string

  @Column()
  version: number

  @Column()
  timestamp: Date

  @Column()
  height: number

  @Column()
  prevHash: string

  @Column()
  mineReward: number

  @Column()
  generator: string // pubkey multihash

  @OneToMany(type => Transaction, transaction => transaction.blockHash, { cascade: true })
  transactions: Transaction[]

  @Column()
  transactionsHash: string

  @Column()
  stateHash: string

  @Column()
  signature: string
}
