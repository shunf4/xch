import { Entity, Column, PrimaryColumn } from "typeorm"

@Entity()
export class Transaction {
  @PrimaryColumn()
  blockHash: string

  @PrimaryColumn()
  id: number

  @Column()
  type: number

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
}
