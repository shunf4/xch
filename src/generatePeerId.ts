import PeerId from "peer-id"
import constants from "./constants"
import { KeyType } from "libp2p-crypto"
import { doNotWait } from "./xchUtil"

async function main(): Promise<void> {
  process.stdout.write(JSON.stringify(await (await PeerId.create({keyType: constants.DefaultPeerIdKeyType as KeyType})).toJSON()))
  process.stdout.write("\n")
}

doNotWait(main())
