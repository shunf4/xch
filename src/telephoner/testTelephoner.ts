import Debug from "debug-level"
import itPipe from "it-pipe"
import itLengthPrefixed from "it-length-prefixed"
import { itJson, sleep } from "../xchUtil"

import { Telephone, ItUpstream, TelephoneListenerFunction, Handset } from "../telephone"
import { BaseTelephoner } from "./telephoner"
import { RuntimeLogicError } from "../errors"

const debug = Debug("xch:telephone")

function answering() {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
    if (!(propertyKey.startsWith("on"))) {
      throw new RuntimeLogicError(`${propertyKey} telephoner listener: not starting with "on"`)
    }

    let prototypeWithListeners: any = target
    while (prototypeWithListeners.constructor.listeners === undefined) {
      prototypeWithListeners = Object.getPrototypeOf(prototypeWithListeners)
    }

    let tag = propertyKey.slice(2)
    tag = tag[0].toLowerCase() + tag.slice(1)
    const telephonerConstructor: typeof BaseTelephoner = prototypeWithListeners.constructor
    telephonerConstructor.listeners.push([
      tag,
      target[propertyKey]
    ])
  }
}

export class TestTelephoner extends BaseTelephoner {
  public static listeners: [string, TelephoneListenerFunction][] = []
  constructor(options:
    { name?: string,
      telephone: Telephone,
      wire: ItUpstream,
    }) {
    super(options)
  }

  @answering()
  async onHello(questionContent: any, handset: Handset): Promise<void> {
    console.log(`c2s: hello`)
    await sleep(5000)
    await handset.answer("hello!!")
  }

  async start(): Promise<void> {
    await super.start()

    await this.telephone.ask("meme", null)
  }
}