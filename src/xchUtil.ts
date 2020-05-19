import Ansi256Colors from "ansi-256-colors"
import __ from "underscore"
import { RuntimeLogicError, TimeoutError } from "./errors"
import { Arguments } from "yargs"
import { TelephoneMessage } from "./telephone"
import util from "util"
import Constants from "./constants"

export type NonFunctionProperties<T> = {
  [P in keyof T]?: T[P] extends Function ? never : P
}[keyof T]

export type TypelessPartial<T> = {
  [P in NonFunctionProperties<T>]?: any
}


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

export function assertType(sth: any, type: string, errorConstructor: { new(...args): Error }, sthStr: string): void
export function assertType(sth: any, types: string[], errorConstructor: { new(...args): Error }, sthStr: string): void
export function assertType(sth: any, typeSth: string | string[], errorConstructor: { new(...args): Error }, sthStr: string): void {
  const sthType = typeof sth
  let types: string[]
  if (typeof typeSth === "string") {
    types = [typeSth]
  } else {
    types = typeSth
  }

  if (!(types.includes(sthType))) {
    throw new errorConstructor(`typeof ${sthStr} is ${sthType} (should be one of type(s): ${types.join(", ")})`)
  }
}

export function assertInstanceOf(obj: any, clazz: any, errorConstructor: { new(...args): Error }, sthStr: string): void
export function assertInstanceOf(obj: any, clazzes: any[], errorConstructor: { new(...args): Error }, sthStr: string): void
export function assertInstanceOf(obj: any, clazzSth: any, errorConstructor: { new(...args): Error }, sthStr: string): void {
  let clazzes: any[]
  if (Array.isArray(clazzSth)) {
    clazzes = clazzSth
  } else {
    clazzes = [clazzSth]
  }

  let match = false
  for (const clazz of clazzes) {
    if ((obj instanceof clazz) || (clazz === Array && Array.isArray(obj))) {
      match = true
      break
    }
  }

  if (!match) {
    throw new errorConstructor(`${sthStr} is not instanceof one of class(es): ${clazzes.map(clazz => clazz.name).map(clazzName => clazzName ? clazzName : "<empty>").join(", ")} (it is a ${obj?.constructor?.name})`)
  }
}

export function assertTypeOrInstanceOf(sth: any, typeOrClass: any, errorConstructor: { new(...args): Error }, sthStr: string): void {
  let typeOrClassArray: any[]
  if (Array.isArray(typeOrClass)) {
    typeOrClassArray = typeOrClass
  } else {
    typeOrClassArray = [typeOrClass]
  }

  const types = typeOrClassArray.filter(typeOrClass => typeof typeOrClass === "string")
  const clazzes = typeOrClassArray.filter(typeOrClass => typeof typeOrClass !== "string")

  try {
    assertType(sth, types, errorConstructor, sthStr)
  } catch (err) {
    if (!(err instanceof errorConstructor)) {
      throw err
    } else {
      assertInstanceOf(sth, clazzes, errorConstructor, sthStr + `(also none of type(s): ${types.join(", ")})`)
    }
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
      recordStrings.push("]")
    }
      
    throw new errorConstructor(`${sthStr} does not satisfy the condition DNF: ${recordStrings.join("")}`)
  }
}

export function wrapAsNamedFunction<FunctionType extends Function>(func: FunctionType, name: string, args: any[] = []): FunctionType {
  return Object.defineProperty(func, "name", {
    value: `${name}(${args.map(arg => arg.toString()).join(", ")})`,
    writable: false
  })
}

export function passesAssertion(func, ...args): boolean {
  try {
    func(...args)
  } catch (err) {
    return false
  }
  return true
}

export function isUndefinedOrNonEmptyString(s: string | undefined): boolean {
  return s !== "" || s === undefined
}

export function stringIsEmpty(s: string): boolean {
  return s === ""
}

export function stringIsNotEmpty(s: string): boolean {
  return s !== ""
}

export function equalTo(arg: any): (sth: any) => boolean {
  return wrapAsNamedFunction(
    (sth: any): boolean => sth === arg,
    arguments.callee.name,
    Array.from(arguments)
  )
}

export function greaterThan(num: number): (numArg: number) => boolean {
  return wrapAsNamedFunction(
    (numArg: number): boolean => numArg > num,
    arguments.callee.name,
    Array.from(arguments)
  )
}

export function lessThan(num: number): (numArg: number) => boolean {
  return wrapAsNamedFunction(
    (numArg: number): boolean => numArg < num,
    arguments.callee.name,
    Array.from(arguments)
  )
}

export function greaterThanOrEqualTo(num: number): (numArg: number) => boolean {
  return wrapAsNamedFunction(
    (numArg: number): boolean => numArg >= num,
    arguments.callee.name,
    Array.from(arguments)
  )
}

export function lessThanOrEqualTo(num: number): (numArg: number) => boolean {
  return wrapAsNamedFunction(
    (numArg: number): boolean => numArg <= num,
    arguments.callee.name,
    Array.from(arguments)
  )
}

export function isJsonPlain(sth: any): boolean {
  return (sth === null || typeof sth === "string" || typeof sth === "boolean" || typeof sth === "number" || Array.isArray(sth) || sth.constructor === Object && sth.toString() === "[object Object]")
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

export function isNotNullNorUndefined(sth: any): boolean {
  return sth !== null && sth !== undefined
}

export const itJson = {
  decoder: (source: AsyncIterable<Buffer>): AsyncGenerator<any> => (async function * (): any {
    for await (const messageRaw of source) {
      yield JSON.parse(messageRaw.toString("utf-8"))
    }
  })(),

  encoder: (source: AsyncIterable<any>): AsyncGenerator<Buffer> => (async function * (): any {
    for await (const objRaw of source) {
      yield Buffer.from(JSON.stringify(objRaw), "utf-8")
    }
  })(),
}

export function createTimingOutSource<T> (
  source: AsyncIterable<T>,
  createResetSignalPromise: () => Promise<void>,
  timeoutMillisec: number,
  timeoutErrorMessage: string
): AsyncIterable<T> & AsyncIterator<T> {
  const timingOutSource: {
    missed: Promise<IteratorResult<T, any>>,
    sourceIt: AsyncIterator<T>,
  } & AsyncIterable<T> & AsyncIterator<T> = {
    missed: null,
    sourceIt: source[Symbol.asyncIterator](),

    [Symbol.asyncIterator]() {
      return this
    },

    async next() {
      const that = timingOutSource // this

      while (true) {
        let isTimeout = false
        let isReset = false
        const timeoutPromise = sleep(timeoutMillisec)
        const resetPromise = createResetSignalPromise()

        let valuePromise: Promise<IteratorResult<T, any>>
        if (that.missed) {
          valuePromise = that.missed
        } else {
          valuePromise = that.sourceIt.next()
          that.missed = valuePromise
        }

        doNotWait(timeoutPromise.then(() => {
          isTimeout = true
        }))

        doNotWait(resetPromise.then(() => {
          isReset = true
        }))

        const raceResult = await Promise.race([timeoutPromise, valuePromise, resetPromise])
        if (isTimeout) {
          throw new TimeoutError(timeoutErrorMessage)
        }

        if (isReset) {
          continue
        }

        const valueResult = raceResult as IteratorResult<T>
        that.missed = null
        return valueResult
      }
    }
  }

  return timingOutSource
}

export function fullObjectOutput(obj: any): string {
  return util.inspect(obj, {
    colors: false,
    depth: null
  })
}

export function coloredFullObjectOutput(obj: any): string {
  return util.inspect(obj, {
    colors: true,
    depth: null
  })
}

export function printObject(...objs: any[]): void {
  console.log(...objs.map(obj => coloredFullObjectOutput(obj)))
}

export function printException(debug: any, err: Error, {
  prefix = "",
  printStack = "full",
}: {
  prefix?: string,
  printStack?: "full" | "oneLine" | "off",
} = {}): void {
  if (err.stack) {
    let stackString = ""
    if (printStack === "full") {
      stackString = `Stack: ${err.stack}`
    } else if (printStack === "oneLine") {
      stackString = `Stack: ${[...err.stack.split("\n"), "(no information)"][0]}`
    }
    debug.error(`${prefix}Exception occurred(${err.constructor.name}). ${stackString}`)
  } else {
    debug.error(`${prefix}Exception occurred(${err.constructor.name}): ${err.message}`)
  }
}