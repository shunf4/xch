import { EventEmitter } from "typeorm/platform/PlatformTools"
import { TelephoneBadPeerError, TelephoneBadTagError, RuntimeLogicError, TelephonePeerShutdownError } from "./errors";
import pDefer from "p-defer"
import pushable, { Pushable } from "it-pushable"
import Debug from "debug-level"

const debug = Debug("xch:telephone")

type DeferredPromise<T> = pDefer.DeferredPromise<T>
const createDeferredPromise = pDefer

export type TelephoneMessage = {
  type: "question" | "answer",
  tag: string,
  content: any,
}

export type ItUpstream = {
  sink: (source: AsyncIterable<any>) => Promise<any>,
  source: AsyncIterable<any>,
}


export class Handset {
  tag: string
  hasAnswered: boolean
  answerableDeferred: DeferredPromise<void>

  private telephone: Telephone

  constructor(tag: string, telephone: Telephone) {
    this.tag = tag
    this.hasAnswered = false
    this.telephone = telephone
    this.answerableDeferred = createDeferredPromise<void>()
  }

  public async answer(content: any): Promise<void> {
    this.telephone.resolveFirstAnswerableDeferred()
    await this.answerableDeferred.promise
    if (this.hasAnswered) {
      throw new RuntimeLogicError(`you can't answer twice or more`)
    }

    debug.debug(`${this.telephone.name}: answering "${this.tag}" using handset`)
    this.hasAnswered = true
    this.telephone.writer.push({
      type: "answer",
      tag: this.tag,
      content: content
    })
    this.telephone.doneAnswering(this)
  }
}

// Telephone protocol.
// The order of answer(response) is acknowledged from the order of request(ask).
// Every question listened from Telephone must be answered before doing next thing with Telephone.
export class Telephone {
  public name: string
  private eventEmitter: EventEmitter
  private waitForAnswerQueue: { tag: string, defer: DeferredPromise<any> }[]
  private toAnswerQueue: Handset[]
  private hasHangedUp: boolean
  private hasPeerHangedUp: boolean
  private hasReceivedHangUpAck: boolean
  private hasAckedPeerHangUp: boolean
  private hasShutdown: boolean
  private hasPeerShutdown: boolean
  private hasEndedWrite: boolean
  private hasEndedRead: boolean
  public writer: Pushable<TelephoneMessage>

  public source: AsyncIterable<TelephoneMessage>

  constructor({ name }: { name?: string }) {
    this.name = name ? name : "(unnamed)"
    this.eventEmitter = new EventEmitter()
    this.waitForAnswerQueue = []
    this.toAnswerQueue = []
    this.hasHangedUp = false
    this.hasPeerHangedUp = false
    this.hasReceivedHangUpAck = false
    this.hasAckedPeerHangUp = false
    this.hasShutdown = false
    this.hasPeerShutdown = false
    this.hasEndedWrite = false
    this.hasEndedRead = false
    this.writer = pushable<TelephoneMessage>()
    this.source = this.writer

    this.answeringWorker("end", async (content: any, handset: Handset): Promise<void> => {
      debug.debug(`${this.name}: "end" received, peer is hanging up`)
      this.hasPeerHangedUp = true
      this.checkEnd()
      await handset.answer(null)
      this.hasAckedPeerHangUp = true
      this.checkEnd()
    })
  }

  public resolveFirstAnswerableDeferred(): void {
    if (this.toAnswerQueue.length) {
      this.toAnswerQueue[0].answerableDeferred.resolve()
    } else {
      debug.warn(`${this.name}: resolveFirstAnswerableDeferred: queue is empty`)
    }
  }

  public doneAnswering(handset: Handset): void {
    if (this.toAnswerQueue.length) {
      if (handset !== this.toAnswerQueue.shift()) {
        debug.warn(`${this.name}: doneAnswering: handset not matching`)
      } else {
        if (this.toAnswerQueue.length) {
          this.toAnswerQueue[0].answerableDeferred.resolve()
        } else {
          this.checkEnd()
        }
      }
    } else {
      debug.warn(`${this.name}: doneAnswering: queue is empty`)
      this.checkEnd()
    }
  }

  public forciblyEndWrite(): void {
    if (!this.hasEndedWrite) {
      this.hasEndedWrite = true
      this.writer.end()
    }
  }

  public forciblyEndRead(): void {
    if (!this.hasEndedRead) {
      this.hasEndedRead = true
      this.eventEmitter.removeAllListeners()
    }
  }

  private checkEnd(): void {
    let hasEndedWrite = false
    let hasEndedRead = false
    if (this.hasHangedUp && this.hasAckedPeerHangUp) {
      hasEndedWrite = true
    } else if (this.hasPeerShutdown && this.toAnswerQueue.length === 0) {
      debug.warn(`${this.name}: because of unexpected peer shutdown and all question having been answered, ending writing on this side`)
      hasEndedWrite = true
    }

    if (this.hasPeerHangedUp && this.hasReceivedHangUpAck) {
      hasEndedRead = true
    } else if (this.hasPeerShutdown) {
      debug.warn(`${this.name}: because of unexpected peer shutdown without hanging up and acking hangup from this side, ending reading on this side`)
      hasEndedRead = true
    }

    if (hasEndedWrite && !this.hasEndedWrite) {
      debug.debug(`${this.name}: end writing`)
      this.hasEndedWrite = hasEndedWrite
      this.writer.end()
    }

    if (hasEndedRead && !this.hasEndedRead) {
      debug.debug(`${this.name}: end reading`)
      this.hasEndedRead = hasEndedRead
      this.eventEmitter.removeAllListeners()
    }
  }

  async sink(source: AsyncIterable<TelephoneMessage>): Promise<void> {
    for await (const message of source) {
      if (message.type === "question") {
        debug.debug(`${this.name}: incoming question: "${message.tag}"`)

        const tag = message.tag ? message.tag : ""
        const handset = new Handset(tag, this)
        this.toAnswerQueue.push(handset)

        if (this.eventEmitter.listeners(tag).length === 0) {
          debug.warn(`${this.name}: not handled question tag: "${tag}"`)
          await handset.answer(null)
        } else {
          this.eventEmitter.emit(tag, message.content, handset)
        }
      } else if (message.type === "answer") {
        debug.debug(`${this.name}: incoming answer: "${message.tag}"`)
        if (this.waitForAnswerQueue.length === 0) {
          throw new TelephoneBadPeerError(`peer: unexpected answer to "${message.tag}" (wait-for-response queue is empty)`)
        }

        if (this.waitForAnswerQueue[0].tag !== message.tag) {
          throw new TelephoneBadPeerError(`peer: unexpected answer to "${message.tag}" (should be "${this.waitForAnswerQueue[0].tag}")`)
        }

        this.waitForAnswerQueue.shift().defer.resolve(message.content)
      } else {
        throw new TelephoneBadPeerError(`peer: message.type === "${message.type}"`)
      }
    }

    debug.debug(`${this.name}: the other side stopped transmitting`)
    this.hasPeerShutdown = true
    while (this.waitForAnswerQueue.length) {
      this.waitForAnswerQueue.shift().defer.reject(new TelephonePeerShutdownError(`telephone peer shutdown`))
    }

    this.checkEnd()
  }

  private answeringWorker(questionTag: string, listener: (questionContent: any, handset: Handset) => Promise<any>): void {
    this.eventEmitter.on(questionTag, async (questionContent: any, handset: Handset): Promise<void> => {
      if (this.hasEndedRead) {
        debug.warn(`${this.name}: unexpected: peer sent ${questionContent} after we ended reading`)
        return
      }

      if (this.hasEndedWrite) {
        debug.warn(`${this.name}: unexpected: peer sent ${questionContent} after we ended writing`)
        return
      }

      if (this.hasPeerHangedUp) {
        debug.warn(`${this.name}: unexpected: telephone peer sent ${questionContent} after they hanged up`)
        return
      }

      if (this.hasPeerShutdown) {
        debug.warn(`${this.name}: unexpected: telephone peer sent ${questionContent} after they shutdown`)
        return
      }

      if (this.hasShutdown) {
        debug.warn(`${this.name}: unexpected: telephone peer sent ${questionContent} after we shutdown`)
        return
      }

      try {
        await listener(questionContent, handset)
        
        if (!handset.hasAnswered) {
          debug.warn(`${this.name}: not answering when handling tag "${questionTag}"`)
        }
      } catch (err) {
        if (err.stack) {
          debug.error(`Exception occurred when answering telephone ${this.name} (${err.constructor.name}). Stack: ${err.stack}`)
        } else {
          debug.error(`${err.constructor.name}: ${err.message}`)
        }
      }
    })
  }

  answering(questionTag: string, listener: (questionContent: any, handset: Handset) => Promise<any>): this {
    if (questionTag === "end") {
      throw new TelephoneBadTagError(`"end" is not allowed as a tag`)
    }
    
    if (this.hasEndedRead) {
      throw new RuntimeLogicError(`telephone setting answer function after ending reading`)
    }

    this.answeringWorker(questionTag, listener)

    return this
  }

  private askWorker(questionTag: string, content: any): Promise<any> {
    debug.debug(`${this.name}: asking "${questionTag}"`)
    const newDeferred = createDeferredPromise()
    this.waitForAnswerQueue.push({
      tag: questionTag,
      defer: newDeferred
    })

    this.writer.push({
      type: "question",
      tag: questionTag,
      content: content,
    })

    return newDeferred.promise
  }

  ask(questionTag: string, content: any): Promise<any> {
    if (questionTag === "end") {
      throw new TelephoneBadTagError(`"end" is not allowed as a tag`)
    }

    if (this.hasEndedRead) {
      throw new RuntimeLogicError(`telephone ask after we ended reading`)
    }

    if (this.hasEndedWrite) {
      throw new RuntimeLogicError(`telephone ask after we ended writing`)
    }

    if (this.hasHangedUp) {
      throw new RuntimeLogicError(`ask after hanging up telephone`)
    }

    if (this.hasPeerShutdown) {
      throw new RuntimeLogicError(`ask after peer shutting down telephone`)
    }

    if (this.hasShutdown) {
      throw new RuntimeLogicError(`ask after shutting down telephone`)
    }

    return this.askWorker(questionTag, content)
  }

  shutdown(): void {
    this.hasShutdown = true
    this.checkEnd()
  }
  
  async hangUp(): Promise<void> {
    debug.debug(`${this.name}: hanging up`)
    this.hasHangedUp = true
    const askPromise = this.askWorker("end", null)
    this.checkEnd()
    await askPromise
    this.hasReceivedHangUpAck = true
    this.checkEnd()
  }
}