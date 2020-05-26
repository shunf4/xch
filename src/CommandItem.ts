import { TaskManagerCombination } from "./taskManagerCombination"
import { P2pLayer } from "./p2pLayer"
import { Blockchain } from "./blockchain"
import { Profile } from "./profile"
import { assignOptions, printException, assertInstanceOf, assertType, addConsoleFunctions, camelCaseToWords } from "./xchUtil"

import Debug from "debug"
import { RuntimeLogicError, ConsoleMoreArgsNeededError, ConsoleArgsError } from "./errors"

const debug = Debug("xch:api")

export class CommandItem {
  subItemMap: Map<string, CommandItem>
  shorthandMap: Map<string, string>
  doHandle: (args: string[]) => Promise<any>

  private constructor() {
    this.subItemMap = new Map<string, CommandItem>()
  }

  public subItemMapKeysSorted() {
    return Array.from(this.subItemMap.keys()).sort()
  }

  public addConsoleFunctions(argMap: Map<string, (args: string[]) => Promise<any>>): void {
    addConsoleFunctions(debug, this, argMap, [
      this.apiGetLatestBlock,
    ])
  }

  public buildSubItemNameIndex() {
    const subItemNames = Array.from(this.subItemMap.keys())
    const subItemWordsArray = subItemNames.map(n => camelCaseToWords(n))
    const namePrefixMaps: Record<string, {
      extension: Set<string>,
      uniqueCompletion: string,
    }>[] = []

    for (const subItemWords of subItemWordsArray) {
      for (const [i, word] of subItemWords.entries()) {
        if (namePrefixMaps[i] === undefined) {
          namePrefixMaps[i] = {}
        }

        for (let prefixLength = 1; ; prefixLength++) {
          const prefix = word.slice(0, prefixLength)

          if (namePrefixMaps[i][prefix] === undefined) {
            namePrefixMaps[i][prefix] = {
              extension: new Set(),
              uniqueCompletion: word,
            }
            break
          } else {
            if (namePrefixMaps[i][prefix].extension.size === 0) {
              if (word !== namePrefixMaps[i][prefix].uniqueCompletion) {
                // split
                const existingWord = namePrefixMaps[i][prefix].uniqueCompletion
                namePrefixMaps[i][prefix].uniqueCompletion = undefined
                if (existingWord.length <= prefixLength || word.length <= prefixLength) {
                  throw new RuntimeLogicError(`cannot distinguish: ${existingWord} and ${word}`)
                }

                const wordNextPrefix = word.slice(0, prefixLength + 1)
                const existingWordNextPrefix = existingWord.slice(0, prefixLength + 1)
                namePrefixMaps[i][prefix].extension.add(wordNextPrefix)
                namePrefixMaps[i][prefix].extension.add(existingWordNextPrefix)
                namePrefixMaps[i][wordNextPrefix] = {
                  extension: new Set(),
                  uniqueCompletion: word,
                }
                namePrefixMaps[i][existingWordNextPrefix] = {
                  extension: new Set(),
                  uniqueCompletion: existingWord,
                }
              } else {
                break
              }
            }
          }
        }
      }
    }

    const wordToShorthandsMaps: Record<string, string[]>[] = []
    for (let wordI = 0; wordI < namePrefixMaps.length; wordI++) {
      const map = namePrefixMaps[wordI]
      wordToShorthandsMaps[wordI] = {}
      const queue: [string, typeof map["someKey"]][] = []
      for (const [k, v] of Object.entries(map)) {
        queue.push([k, v])
      }

      while (queue.length) {
        const [k, v] = queue.shift()
        if (v.extension.size === 0 && v.uniqueCompletion) {
          const currentShorthands = []
          wordToShorthandsMaps[wordI][v.uniqueCompletion] = currentShorthands
          for (let prefixLength = k.length; prefixLength <= v.uniqueCompletion.length; prefixLength++) {
            currentShorthands.push(v.uniqueCompletion.slice(0, prefixLength))
          }
          continue
        }

        if (v.extension.size) {
          for (const newK of v.extension.keys()) {
            queue.push([newK, map[newK]])
          }
        }
      }
    }

    this.shorthandMap = new Map()

    for (const [i, subItemWords] of subItemWordsArray.entries()) {
      let currentAllShorthandPrefixes = [""]
      for (let wordI = 0; wordI < subItemWords.length; wordI++) {
        currentAllShorthandPrefixes = currentAllShorthandPrefixes.flatMap(prefix =>
          wordToShorthandsMaps[wordI][subItemWords[wordI]].map(currentWordShorthand => prefix + currentWordShorthand)
        )
      }
      for (const shorthand of currentAllShorthandPrefixes) {
        this.shorthandMap.set(shorthand, subItemNames[i])
      }
    }
  }

  public async handle(args: string[]): Promise<any> {
    let result = {}
    if (this.subItemMap && this.subItemMap.size) {
      if (args.length === 0) {
        throw new ConsoleMoreArgsNeededError(`Select one category or operation you want`, {
          subItems: this.subItemMapKeysSorted(),
        })
      }
      const subItemKey = this.shorthandMap.get(args[0].toLowerCase())
      const subItem = this.subItemMap.get(subItemKey)
      if (subItem === undefined) {
        throw new ConsoleArgsError(`subItem not found or possibly ambiguous: ${args[0]}`, {
          subItems: this.subItemMapKeysSorted(),
        })
      }
      
      result = await subItem.handle(args.slice(1))
    } else {
      if (this.doHandle) {
        result = await this.doHandle(args)
      }
    }
    return result
  }
}