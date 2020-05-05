import Debug from "debug-level"
import itPipe from "it-pipe"
import itLengthPrefixed from "it-length-prefixed"
import { itJson } from "../xchUtil"

import { Telephone, ItUpstream, TelephoneListenerFunction } from "../telephone"

import AbortController from "abort-controller"
import abortable from "abortable-iterator"

const debug = Debug("xch:telephone")

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