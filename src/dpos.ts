import Debug from "debug-level"

import { AccountStateSnapshot } from "./entity/AccountStateSnapshot"
import { createQueryBuilder } from "typeorm"
import { Block } from "./entity/Block"
import Constants from "./constants"

const debug = Debug("xch:dpos")

export class Dpos {

  public static getEpochAndSlot(time: Date | string): {
    epoch: number,
    slot: number,
    accumulatedSlot: number,
  } {
    if (typeof time === "string") {
      time = new Date(time)
    }
    const timeDelta = time.getTime() - Constants.DposBeginningTime.getTime()
    const accumulatedSlot = timeDelta / Constants.DposSlotDurationMillisec
    const epoch = accumulatedSlot / Constants.DposWitnessNumber
    const slot = accumulatedSlot % Constants.DposWitnessNumber
    return {
      epoch,
      slot,
      accumulatedSlot,
    }
  }

  public static async * getWitnesses({
    maxBlockHeight = undefined as undefined | number,
    shouldIncludeTemporary = false,
  } = {}): AsyncGenerator<AccountStateSnapshot, void, undefined> {
    const pageSize = 30
    let currentOffset = 0
    while (true) {
      const qb = createQueryBuilder()
        .select("ass")
        .from(AccountStateSnapshot, "ass")
        .innerJoin(qb =>
          qb
            .select("ass.hash", "hash")
            .addSelect("MIN(role.score)", "roleScore") // "MIN" has no meaning here
            .from(AccountStateSnapshot, "ass")
            .innerJoin(Block.getAssPubKeysAndHashesSqlSubquerFunction({
              maxBlockHeight,
              maxPriority: shouldIncludeTemporary ? Constants.BlockPriorityTemporary : Constants.BlockPriorityCommon,
            }), "currState", "ass.hash = currState.hash")
            .innerJoin("ass.roles", "role", "role.name = :roleName", { roleName: "witness" })
            .groupBy("ass.hash")
            .orderBy("roleScore", "DESC")
            .offset(currentOffset)
            .limit(pageSize)
        , "witnessAss", "ass.hash = witnessAss.hash")
        .leftJoinAndSelect("ass.roles", "role")
      
      debug.debug(`executing sql in Block.getWitnesses: ${qb.getQueryAndParameters()}`)
      const currentWitnesses = await qb.getMany()
      debug.debug(`done executing sql in Block.getWitnesses, currentAsses.length === ${currentWitnesses.length}`)

      if (currentWitnesses.length === 0) {
        return
      }

      for (const witness of currentWitnesses) {
        yield witness
      }
      currentOffset += pageSize
    }
  }

  public static async getWorkingWitnesses(options: {
    maxBlockHeight?: number,
    shouldIncludeTemporary?: boolean,
  } = {}): Promise<AccountStateSnapshot[]> {
    const witnesses: AccountStateSnapshot[] = []
    const generator = Dpos.getWitnesses(options)
      
    for (let i = 0; i < Constants.DposWitnessNumber; i++) {
      const itResult = await generator.next()
      if (itResult.done) {
        throw new DposInsufficientWitnessError(`fetching working witnesses ${i}: got done, insufficient witnesses`)
      }
      witnesses.push(itResult.value as AccountStateSnapshot)
    }

    return witnesses
  }

  public static async verifyWitness({
    block,
  }: {
    block: Block,
  }): Promise<void> {
    if (block.height === 0) {
      return
    }

    const blockEpochAndSlot = Dpos.getEpochAndSlot(block.timestamp)
    const workingWitnesses = await Dpos.getWorkingWitnesses({
      maxBlockHeight: block.height - 1,
      shouldIncludeTemporary: false,
    })

    if (workingWitnesses[blockEpochAndSlot.slot].pubKey !== block.generator) {
      throw new DposInvalidWitnessError(`generator of the block is invalid to DPos consensus (is ${block.generator}, expecting ${workingWitnesses[blockEpochAndSlot.slot]})`)
    }
  }

}