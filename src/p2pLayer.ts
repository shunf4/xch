const Libp2p = require("libp2p")
const { IdentifyService, multicodecs: IDENTIFY_PROTOCOLS } = require("libp2p/src/identify")

import { EventEmitter } from "events"

import PeerInfo from "peer-info"
import PeerId from "peer-id"
import multiaddr from "multiaddr"

import { Profile } from "./profile"
import { sleep, colorForRgb, defaultTo } from "./xchUtil"
import Debug from "debug-level"
import Chalk from "chalk"
import { XchLibp2pConfig } from "./config"

import Pipe from "it-pipe"
import ItLengthPrefixed from "it-length-prefixed"

const debug = Debug("xch:p2p:main")
debug.color = Chalk.hex("#006600")
const eventsDebug = Debug("xch:p2p:events")
eventsDebug.color = Chalk.hex("#AA22DD")
const verboseDebug = Debug("xch:p2p:verbose")
verboseDebug.color = Chalk.hex("#444444")

enum PubsubTopicDataType {
  Raw,
  String,
  Json
}

export class P2pLayer extends EventEmitter {
  node: any // Libp2p
  profile: Profile
  config: XchLibp2pConfig

  public static async create(options: { profile: Profile, db: any, taskQueue: any }): Promise<P2pLayer> {
    const newP2pLayer = new P2pLayer()
    for (const [k, v] of Object.entries(options)) {
      newP2pLayer[k] = v
    }

    return newP2pLayer
  }

  private static Topics: [string, PubsubTopicDataType][] = [["xch:chatty", PubsubTopicDataType.String], ["xch:blockchain", PubsubTopicDataType.Json]]

  private constructor() {
    super()
  }

  private async substitutePublicAddress(): Promise<void> {
    // Replace peerInfo in identifyService to set a different publicly available address
    if (this.node.identifyService) {
      const publicPeerInfo = new PeerInfo(this.config.peerId)
      publicPeerInfo.id = this.node.peerInfo.id
      publicPeerInfo.multiaddrs = this.config.overridingPublicAddressPrefixes ? this.config.overridingPublicAddressPrefixes.map((addrStr) => multiaddr(addrStr)) : this.node.peerInfo.multiaddrs
      publicPeerInfo.protocols = this.node.peerInfo.protocols

      this.node.identifyService = new IdentifyService({
        registrar: this.node.registrar,
        peerInfo: publicPeerInfo,
        protocols: this.node.upgrader.protocols
      })

      this.node.handle(Object.values(IDENTIFY_PROTOCOLS), this.node.identifyService.handleMessage)
    }
  }


  private async listenForEvents(): Promise<void> {
    this.node.on("peer:discovery", (peer) => {
      eventsDebug.info("Discovered %s", peer.id.toB58String())
    })

    this.node.on("peer:connect", (peer) => {
      eventsDebug.info("Connected to %s", peer.id.toB58String())
    })
  }


  private async subscribeForPubSub(): Promise<void> {
    for (const [topic, dataType] of P2pLayer.Topics) {
      await this.node.pubsub.subscribe(topic, (msg) => {
        let upperLevelData: any
        if (dataType === PubsubTopicDataType.Raw) {
          verboseDebug.info(`Received from ${topic}: <hex data>`)
          upperLevelData = msg.data
        } else {
          const dataString = msg.data.toString("utf-8")
          verboseDebug.info(`Received from ${topic}: ${dataString}`)
          if (dataType === PubsubTopicDataType.String) {
            upperLevelData = dataString
          } else {
            upperLevelData = JSON.parse(dataString)
          }
        }
        this.emit(topic, upperLevelData)
      })
    }
  }

  private async printListeningAddrs(): Promise<void> {
    debug.info("libp2p has started!")
    const addresses = this.node.peerInfo.multiaddrs.toArray()
    let listenDescStr = "listening on addresses:"
    addresses.forEach(addr => {
      listenDescStr += `\n  ${addr.toString()}/p2p/${this.node.peerInfo.id.toB58String()}`
    })
    debug.info(listenDescStr)
  }

  private async printKnownAddrs(): Promise<void> {
    let knownAddrsStr = "known addresses:"
    for (const [peerId, peerInfo] of this.node.peerStore.peers.entries()) {
      knownAddrsStr += `\n  ${peerId}:`

      peerInfo.multiaddrs.toArray().forEach(addr => {
        knownAddrsStr += `\n    ${addr.toString()}`
      })
    }
    verboseDebug.info(knownAddrsStr)
  }

  private async broadcastTest(): Promise<void> {
    this.node.pubsub.publish("xch:chatty", Buffer.from(`${this.config.peerId.toB58String().substr(-5)}: broadcast genesis block { timestamp: 2020/04/15T10:00:00, height: 0, hash: 000... }`))
  }

  private async invokeIntervalTask({ func, that = this, intervalMillisec, now = true }: { func: (...args: any[]) => void, that?: any, intervalMillisec: number, now?: boolean }): Promise<void> {
    setInterval(func.bind(that), intervalMillisec)
    if (now) {
      void(func.bind(that)())
    }
  }

  private async invokeTimeoutTask({ func, that = this, timeoutMillisec }: { func: (...args: any[]) => void, that: any, timeoutMillisec: number }): Promise<void> {
    setTimeout(func.bind(that), timeoutMillisec)
  }

  private async invokeTimeoutTasks(): Promise<void> {
    // setTimeout(this.broadcastTest.bind(this), 3000)
  }

  public async start(): Promise<void> {
    if (!this.profile) {
      throw Error("profile not assigned")
    }

    this.config = defaultTo(this.profile.config)(this.config)

    this.node = defaultTo(await Libp2p.create({
      modules: {
        transport: this.config.transportModules.map((moduleName) => require(moduleName)),
        connEncryption: this.config.connEncryptionModules.map((moduleName) => require(moduleName)),
        streamMuxer: this.config.streamMuxerModules.map((moduleName) => require(moduleName)),
        peerDiscovery: this.config.peerDiscoveryModules.map((moduleName) => require(moduleName)),
        dht: require(this.config.dhtModule),
        pubsub: require(this.config.pubsubModule),
      },
      config: this.config.libp2pConfig,
      peerInfo: new PeerInfo(this.config.peerId)
    }))(this.node)

    await this.substitutePublicAddress()

    // Add listenAddrs
    this.config.listenAddrs.forEach((addrStr) => {
      this.node.peerInfo.multiaddrs.add(multiaddr(addrStr))
    })

    // Add protocol handlers
    await this.node.handle("/test", ({ stream }) => {
      Pipe(
        stream,
      )
    })

    // start
    await this.node.start()
    await this.printListeningAddrs()

    await this.listenForEvents()
    await this.subscribeForPubSub()

    await this.invokeIntervalTask({ func: this.printKnownAddrs, intervalMillisec: 3000 })
    await this.invokeIntervalTask({ func: this.broadcastTest, intervalMillisec: 3000 })
  }
}

