import { Entity, Column, PrimaryColumn, Index } from "typeorm"

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

  @Column()
  transactionsHash: string

  @Column()
  stateHash: string

  @Column()
  signature: string
}
