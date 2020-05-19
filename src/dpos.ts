import Debug from "debug-level"

import { AccountStateSnapshot } from "./entity/AccountStateSnapshot"
import { createQueryBuilder } from "typeorm"
import { Block } from "./entity/Block"
import Constants from "./constants"
import { DposInsufficientWitnessError, DposInvalidWitnessError, EntityValueError, DposDataInvalidError } from "./errors"
import { assertType, assertCondition, assertInstanceOf } from "./xchUtil"
import { Role } from "./entity/Role"

const debug = Debug("xch:dpos")

export type WitnessExtendedAss = AccountStateSnapshot & {
  witnessRole: Role,
}

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

  // if overridingBlock specified, returned asses is not sorted; else they are ordered ASC by pubKey.
  public static async * getWitnesses({
    maxBlockHeight = undefined as undefined | number,
    shouldIncludeTemporary = false,
    overridingBlock = undefined as Block,
  } = {}): AsyncGenerator<AccountStateSnapshot, void, undefined> {
    const pageSize = 30
    let currentOffset = 0
    const assesInOverridingBlock = overridingBlock ? [...overridingBlock.mostRecentAssociatedAccountStateSnapshots] : []
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
        break
      }

      for (const witness of currentWitnesses) {
        const assIndexInOverridingBlock = assesInOverridingBlock.findIndex(assInOverridingBlock => assInOverridingBlock.pubKey === witness.pubKey)
        if (assIndexInOverridingBlock !== -1) {
          const overriddenWitness = assesInOverridingBlock[assIndexInOverridingBlock]
          if (overriddenWitness.roles.find(role => role.name === "witness")) {
            yield overriddenWitness
          }
          assesInOverridingBlock[assIndexInOverridingBlock] = null
        } else {
          yield witness
        }
      }
      currentOffset += pageSize
    }

    for (const ass of assesInOverridingBlock) {
      if (ass !== null && ass.roles.find(role => role.name === "witness")) {
        yield ass
      }
    }
  }

  public static async getFirstWitnesses(options: {
    maxBlockHeight?: number,
    shouldIncludeTemporary?: boolean,
  } = {}): Promise<AccountStateSnapshot[]> {
    const witnesses: AccountStateSnapshot[] = []
    const generator = Dpos.getWitnesses(options)
      
    for (let i = 0; i < Constants.DposWitnessNumber; i++) {
      const itResult = await generator.next()
      if (itResult.done) {
        throw new DposInsufficientWitnessError(`fetching first witnesses ${i}: got done, insufficient witnesses`)
      }
      witnesses.push(itResult.value as AccountStateSnapshot)
    }

    return witnesses
  }

  public static async getWorkingWitnessPubKeys(options: {
    maxBlockHeight?: number,
    shouldIncludeTemporary?: boolean,
  } = {}): Promise<string[]> {
    const {
      maxBlockHeight = undefined as number,
      shouldIncludeTemporary = false,
    } = options

    const dposData = (await Block.getFirstSpecificState({
      maxBlockHeight,
      shouldIncludeTemporary,
      shouldCreateIfNotFound: false,
      specificPubKey: "DPOS",
    })).state


    assertInstanceOf(dposData.workingWitnesses, Array, DposDataInvalidError, "dposAss.state.workingWitnesses")

    if (dposData.workingWitnesses.length !== Constants.DposWitnessNumber) {
      throw new DposInsufficientWitnessError(`fetching working witnesses: invalid number: ${dposData.workingWitnesses.length}(should be ${Constants.DposWitnessNumber})`)
    }

    for (const pubKey of dposData.workingWitnesses) {
      assertType(pubKey, "string", DposDataInvalidError, "dposAss.state.workingWitnesses[]")
    }

    return dposData.workingWitnesses

    // const workingWitnesses = []
    // for (const witnessPubKey of dposData.workingWitnesses) {
    //   assertType(witnessPubKey, "string", DposDataInvalidError, "dposAss.state.workingWitnesses[]")
    //   workingWitnesses.push(await Block.getFirstSpecificState({
    //     maxBlockHeight,
    //     shouldIncludeTemporary,
    //     shouldCreateIfNotFound: false,
    //     specificPubKey: witnessPubKey,
    //   }))
    // }

    // if (workingWitnesses.length !== Constants.DposWitnessNumber) {
    //   throw new DposInsufficientWitnessError(`fetching working witnesses: invalid number: ${workingWitnesses.length}(should be ${Constants.DposWitnessNumber})`)
    // }

    // return workingWitnesses
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
    const workingWitnessPubKeys = await Dpos.getWorkingWitnessPubKeys({
      maxBlockHeight: block.height - 1,
      shouldIncludeTemporary: false,
    })

    if (workingWitnessPubKeys[blockEpochAndSlot.slot] !== block.generator) {
      throw new DposInvalidWitnessError(`generator of the block is invalid to DPos consensus (is ${block.generator}, expecting ${workingWitnessPubKeys[blockEpochAndSlot.slot]})`)
    }
  }

}