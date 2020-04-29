import Ansi256Colors from "ansi-256-colors"
import __ from "underscore"
import { RuntimeLogicError } from "./errors"

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function colorForRgb(r: number, g: number, b: number): string {
  return Ansi256Colors.fg.getRgb(r, g, b).slice(7, -1)
}

export function defaultTo(defaultValue: any): (sth: any) => any {
  function partialDefaultTo(sth: any): any {
    if (sth === undefined || sth !== sth) {
      return defaultValue
    }
    return sth
  }

  return partialDefaultTo
}

export function doNotWait<T>(promise: Promise<T>): void {
  void(promise)
}

export function assignOptions(obj: any, options: any): void {
  for (const [k, v] of Object.entries(options)) {
    obj[k] = v
  }
}

export function assertType(sth: any, type: string, errorConstructor: { new(...args): Error }, sthStr: string): void {
  const sthType = typeof sth
  if (sthType !== type) {
    throw new errorConstructor(`typeof ${sthStr} is ${sthType} (should be ${type})`)
  }
}

export function assertInstanceOf(obj: any, clazz: any, errorConstructor: { new(...args): Error }, sthStr: string): void {
  if (!(obj instanceof clazz)) {
    throw new errorConstructor(`${sthStr} is not instanceof ${clazz.name} (it is a ${obj.constructor.name})`)
  }
}

export function assertCondition(obj: any, condition: (obj: any) => boolean, errorConstructor: { new(...args): Error }, sthStr: string): void
export function assertCondition(obj: any, conditionDisjunctiveNormal: ((obj: any) => boolean)[][], errorConstructor: { new(...args): Error }, sthStr: string): void
export function assertCondition(obj: any, conditionDisjunctive: ((obj: any) => boolean)[][], errorConstructor: { new(...args): Error }, sthStr: string): void

export function assertCondition(obj: any, conditionSth, errorConstructor: { new(...args): Error }, sthStr: string): void {
  let conditionDisjunctiveNormal: ((obj: any) => boolean)[][]
  if (typeof conditionSth === "function") {
    conditionDisjunctiveNormal = [[conditionSth]]
  } else if (conditionSth instanceof Array) {
    const conditionArray = conditionSth as any[]
    if (conditionArray.length === 0) {
      conditionDisjunctiveNormal = []
    } else {
      if (conditionArray.every(
        c => c instanceof Array && c.every(
          e => typeof e === "function"
        )
      )) {
        conditionDisjunctiveNormal = conditionArray
      } else {
        throw new RuntimeLogicError(`runtime logic error: conditionSth is none of {function[][],  function[], function}`)
      }
    }
  }

  const disjunctiveNormalRecords: [string, boolean][][] = []
  let disjunctiveNormalSatisfied = false
  for (const conjunction of conditionDisjunctiveNormal) {
    const conjunctionRecords: [string, boolean][] = []
    disjunctiveNormalRecords.push(conjunctionRecords)
    let conjunctionSatisfied = false
    for (const condition of conjunction) {
      if (condition(obj)) {
        conjunctionRecords.push([condition.name, true])
        if (!conjunctionSatisfied) {
          conjunctionSatisfied = true
        }
      } else {
        conjunctionRecords.push([condition.name, false])
        conjunctionSatisfied = false
        break
      }
    }

    if (conjunctionSatisfied) {
      disjunctiveNormalSatisfied = true
      break
    }
  }

  if (!disjunctiveNormalSatisfied) {
    const recordStrings: string[] = []
    let firstConjunctionRecords = true
    for (const conjunctionRecords of disjunctiveNormalRecords) {
      if (firstConjunctionRecords) {
        firstConjunctionRecords = false
      } else {
        recordStrings.push("∨")
      }
      recordStrings.push("[")
      let firstRecord = true
      for (const [conditionName, isSatisfied] of conjunctionRecords) {
        if (firstRecord) {
          firstRecord = false
        } else {
          recordStrings.push("∧")
        }
        recordStrings.push(`(${conditionName}: ${isSatisfied ? "T" : "F"})`)
      }
    }
      
    throw new errorConstructor(`${sthStr} does not satisfy the condition DNF: ${recordStrings.join("")}`)
  }
}

export function stringIsEmpty(s: string): boolean {
  return s === ""
}

export function stringIsNotEmpty(s: string): boolean {
  return s !== ""
}

export function greaterThan(num: number): (numArg: number) => boolean {
  return (numArg: number): boolean => numArg > num
}

export function lessThan(num: number): (numArg: number) => boolean {
  return (numArg: number): boolean => numArg < num
}

export function greaterThanOrEqualTo(num: number): (numArg: number) => boolean {
  return (numArg: number): boolean => numArg >= num
}

export function lessThanOrEqualTo(num: number): (numArg: number) => boolean {
  return (numArg: number): boolean => numArg <= num
}

export function isJsonPlain(sth: any): boolean {
  return (typeof sth === null || typeof sth === "string" || typeof sth === "boolean" || typeof sth === "number" || Array.isArray(sth) || sth.constructor === Object && sth.toString() === "[object Object]")
}

export function isJsonSerializable(sth: any): boolean {
  if (!isJsonPlain(sth)) {
    return false
  }

  if (sth === null) {
    return true
  }

  if (typeof sth !== "object") {
    return false
  }

  for (const property in sth) {
    if (Object.hasOwnProperty.call(sth, property)) {
      if (!isJsonPlain(sth[property])) {
        return false
      }
      if (typeof sth[property] === "object") {
        if (!isJsonSerializable(sth[property])) {
          return false
        }
      }
    }
  }

  return true
}

