import { EventEmitter } from "typeorm/platform/PlatformTools"
import { TelephoneBadPeerError, TelephoneBadTagError, RuntimeLogicError, TelephonePeerEndedWriteError as TelephonePeerEndedWriteError, TimeoutError } from "./errors";
import pDefer from "p-defer"
import pushable, { Pushable } from "it-pushable"
import Debug from "debug-level"
import { runInNewContext } from "vm";
import { createTimingOutSource, printException } from "./xchUtil";
import Constants from "./constants";

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

export type TelephoneListenerFunction = (questionContent: any, handset: Handset) => Promise<any>

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
    if (this.hasAnswered) {
      throw new RuntimeLogicError(`you can't answer twice or more`)
    }
    this.telephone.resolveFirstAnswerableDeferred()
    await this.answerableDeferred.promise

    if (this.telephone.hasEndedWrite) {
      debug.warn(`${this.telephone.name}.handset[${this.tag}]: you can't answer with a telephone that stopped writing`)
      return
    }

    debug.debug(`${this.telephone.name}.handset[${this.tag}]: answering`)
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
  private _hasHangedUp: boolean
  private newAskDeferred: DeferredPromise<void>

  public get hasHangedUp(): boolean { return this._hasHangedUp }
  private _hasPeerHangedUp: boolean
  public get hasPeerHangedUp(): boolean { return this._hasPeerHangedUp }
  private _hasReceivedHangUpAck: boolean
  public get hasReceivedHangUpAck(): boolean { return this._hasReceivedHangUpAck }
  private _hasAckedPeerHangUp: boolean
  public get hasAckedPeerHangUp(): boolean { return this._hasAckedPeerHangUp }
  private _hasPeerEndedWrite: boolean
  public get hasPeerEndedWrite(): boolean { return this._hasPeerEndedWrite }
  private _hasEndedWrite: boolean
  public get hasEndedWrite(): boolean { return this._hasEndedWrite }
  private _hasEndedRead: boolean
  public get hasEndedRead(): boolean { return this._hasEndedRead }
  public writer: Pushable<TelephoneMessage>

  public source: AsyncIterable<TelephoneMessage>

  constructor({ name }: { name?: string } = {}) {
    this.name = name ? name : "(unnamed)"
    this.eventEmitter = new EventEmitter()
    this.waitForAnswerQueue = []
    this.toAnswerQueue = []
    this.newAskDeferred = null
    this._hasHangedUp = false
    this._hasPeerHangedUp = false
    this._hasReceivedHangUpAck = false
    this._hasAckedPeerHangUp = false
    this._hasPeerEndedWrite = false
    this._hasEndedWrite = false
    this._hasEndedRead = false
    this.writer = pushable<TelephoneMessage>()
    this.source = this.writer

    this.answeringWorker("end", async (content: any, handset: Handset): Promise<void> => {
      debug.debug(`${this.name}: "end" received, peer is hanging up`)
      this._hasPeerHangedUp = true
      this.checkEnd()
      await handset.answer(null)
      this._hasAckedPeerHangUp = true
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
    if (!this._hasEndedWrite) {
      debug.debug(`${this.name}: forcibly ending writing`)
      this._hasEndedWrite = true
      this.writer.end()
    }
  }

  public forciblyEndRead(): void {
    if (!this._hasEndedRead) {
      debug.debug(`${this.name}: forcibly ending reading`)
      this._hasEndedRead = true
      this.eventEmitter.removeAllListeners()
    }
  }

  public forciblyEnd(): void {
    this.forciblyEndWrite()
    this.forciblyEndRead()
  }

  private checkEnd(): void {
    let hasEndedWrite = false
    let hasEndedRead = false
    if (this._hasHangedUp && this._hasAckedPeerHangUp) {
      hasEndedWrite = true
    } else if (this._hasPeerEndedWrite && this.toAnswerQueue.length === 0) {
      debug.warn(`${this.name}: because of unexpected peer ending writing and all question having been answered, ending writing on this side`)
      hasEndedWrite = true
    }

    if (this._hasPeerHangedUp && this._hasReceivedHangUpAck) {
      hasEndedRead = true
    } else if (this._hasPeerEndedWrite) {
      debug.warn(`${this.name}: because of unexpected peer ending writing without hanging up and acking hangup from this side, ending reading on this side`)
      hasEndedRead = true
    }

    if (hasEndedWrite && !this._hasEndedWrite) {
      debug.debug(`${this.name}: end writing`)
      this._hasEndedWrite = hasEndedWrite
      this.writer.end()
    }

    if (hasEndedRead && !this._hasEndedRead) {
      debug.debug(`${this.name}: end reading`)
      this._hasEndedRead = hasEndedRead
      this.eventEmitter.removeAllListeners()
    }
  }

  async sink(source: AsyncIterable<TelephoneMessage>): Promise<void> {

    let itResult: IteratorResult<TelephoneMessage, any>
    const it = createTimingOutSource<TelephoneMessage>(
      source,
      this.createNewAskPromise.bind(this),
      Constants.TelephoneTimeout,
      "telephone reading timeout"
    )[Symbol.asyncIterator]()

    while (true) {
      try {
        while (itResult = await it.next(), !itResult.done) {
          const message = itResult.value
          debug.debug(`${this.name}: got message`)
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
        break
      } catch (err) {
        if (err instanceof TimeoutError) {
          if (this.waitForAnswerQueue.length === 0 && Constants.WillTelephoneIgnoreTimeoutWhenNotWaitingForAnswer) {
            debug.debug(`${this.name}: timeout, but we are not waiting for answer. ignoring`)
            continue
          } else {
            debug.error(`${this.name}: timeout. ending`)
            while (this.waitForAnswerQueue.length) {
              const queueItem = this.waitForAnswerQueue.shift()
              debug.debug(`${this.name}: rejecting "${queueItem.tag}" with reason: peer timeout`)
              queueItem.defer.reject(new TimeoutError(`telephone peer timeout`))
            }
            this.forciblyEnd()
            this.checkEnd()
            return
          }
        } else {
          throw err
        }
      }
    }

    debug.debug(`${this.name}: the other side stopped writing`)
    this._hasPeerEndedWrite = true
    while (this.waitForAnswerQueue.length) {
      const queueItem = this.waitForAnswerQueue.shift()
      debug.debug(`${this.name}: rejecting "${queueItem.tag}" with reason: peer ended writing`)
      queueItem.defer.reject(new TelephonePeerEndedWriteError(`telephone peer ended writing`))
    }

    this.checkEnd()
  }

  private answeringWorker(questionTag: string, listener: TelephoneListenerFunction): void {
    this.eventEmitter.on(questionTag, async (questionContent: any, handset: Handset): Promise<void> => {
      if (this._hasEndedRead) {
        debug.warn(`${this.name}: unexpected: peer sent ${questionContent} after we ended reading`)
        return
      }

      if (this._hasEndedWrite) {
        debug.warn(`${this.name}: unexpected: peer sent ${questionContent} after we ended writing`)
        return
      }

      if (this._hasPeerHangedUp) {
        debug.warn(`${this.name}: unexpected: telephone peer sent ${questionContent} after they hanged up`)
        return
      }

      if (this._hasPeerEndedWrite) {
        debug.warn(`${this.name}: unexpected: telephone peer sent ${questionContent} after they ended writing`)
        return
      }

      try {
        await listener(questionContent, handset)
        
        if (!handset.hasAnswered) {
          debug.warn(`${this.name}: not answering when handling tag "${questionTag}"`)
        }
      } catch (err) {
        printException(debug, err, {
          prefix: `During answering telephone ${this.name}: `,
        })
      }
    })
  }

  answering(questionTag: string, listener: TelephoneListenerFunction): this {
    if (questionTag === "end") {
      throw new TelephoneBadTagError(`"end" is not allowed as a tag`)
    }
    
    if (this._hasEndedRead) {
      throw new RuntimeLogicError(`telephone setting answer function after ending reading`)
    }

    this.answeringWorker(questionTag, listener)

    return this
  }

  private createNewAskPromise(): Promise<void> {
    this.newAskDeferred = createDeferredPromise()
    return this.newAskDeferred.promise
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

    if (this.newAskDeferred) {
      this.newAskDeferred.resolve()
    }

    return newDeferred.promise
  }

  ask(questionTag: string, content: any): Promise<any> {
    if (questionTag === "end") {
      throw new TelephoneBadTagError(`"end" is not allowed as a tag`)
    }

    if (this._hasEndedRead) {
      throw new RuntimeLogicError(`telephone ask after we ended reading`)
    }

    if (this._hasEndedWrite) {
      throw new RuntimeLogicError(`telephone ask after we ended writing`)
    }

    if (this._hasHangedUp) {
      throw new RuntimeLogicError(`ask after hanging up telephone`)
    }

    if (this._hasPeerEndedWrite) {
      throw new RuntimeLogicError(`ask after peer shutting down telephone`)
    }

    return this.askWorker(questionTag, content)
  }
  
  async hangUp(): Promise<void> {
    debug.debug(`${this.name}: hanging up`)
    this._hasHangedUp = true
    const askPromise = this.askWorker("end", null)
    this.checkEnd()
    await askPromise
    this._hasReceivedHangUpAck = true
    this.checkEnd()
  }
}