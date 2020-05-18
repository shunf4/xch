import Debug from "debug-level"
import itPipe from "it-pipe"
import itLengthPrefixed from "it-length-prefixed"
import { itJson } from "../xchUtil"
import { RuntimeLogicError } from "../errors"

import { Telephone, ItUpstream, TelephoneListenerFunction } from "../telephone"

export const debug = Debug("xch:telephone")

export function answering() {
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

export class BaseTelephoner {
  public static listeners: [string, TelephoneListenerFunction][] = []
  name: string
  telephone: Telephone
  wire: ItUpstream

  constructor({ name, telephone, wire }:
    { name?: string,
      telephone: Telephone,
      wire: ItUpstream,
    }) {
    this.name = name ? name : "(unnamed)"
    this.telephone = telephone
    this.wire = wire
  }

  async start(): Promise<void> {
    itPipe(
      this.wire,
      itLengthPrefixed.decode({ maxDataLength: 10000 }),
      itJson.decoder,
      this.telephone,
      itJson.encoder,
      itLengthPrefixed.encode({ maxDataLength: 10000 }),
      this.wire
    )
    
    for (const [tag, func] of (this.constructor as any).listeners) {
      this.telephone.answering(tag, func)
    }
  }
}