import { sleep } from "../xchUtil"

import { Telephone, ItUpstream, TelephoneListenerFunction, Handset } from "../telephone"
import { BaseTelephoner, answering } from "./baseTelephoner"

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
    await sleep(300)
    await handset.answer("hello!!")
    await handset.answer("hello!!")
  }

  async start(): Promise<void> {
    await super.start()

    await this.telephone.ask("meme", null)
  }
}