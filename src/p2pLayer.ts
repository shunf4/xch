const Libp2p = require("libp2p")
const { IdentifyService, multicodecs: IDENTIFY_PROTOCOLS } = require("libp2p/src/identify")

import { EventEmitter } from "events"

import PeerInfo from "peer-info"
import PeerId from "peer-id"
import Multiaddr, { protocols } from "multiaddr"

import { Profile } from "./profile"
import { sleep, colorForRgb, assignOptions, itJson, camelCaseToWords, addConsoleFunctions } from "./xchUtil"
import Debug from "debug-level"
import chalk from "chalk"
import { XchLibp2pConfig } from "./config"

import itPipe from "it-pipe"
import itLengthPrefixed from "it-length-prefixed"

import { TaskManagerCombination } from "./taskManagerCombination"
import { Task } from "./taskManager"
import { PeerInfoEntity } from "./entity/PeerInfoEntity"
import { getConnection } from "typeorm"
import { MultiaddrEntity } from "./entity/MultiaddrEntity"
import { Telephone, TelephoneMessage } from "./telephone"

const debug = Debug("xch:p2p:main")
debug.color = chalk.hex("#006600")
const eventsDebug = Debug("xch:p2p:events")
eventsDebug.color = chalk.hex("#AA22DD")
const verboseDebug = Debug("xch:p2p:verbose")
verboseDebug.color = chalk.hex("#444444")

export enum PubsubTopicDataType {
  Raw,
  String,
  Json
}

export class P2pLayer extends EventEmitter {
  topics: [string, PubsubTopicDataType][] = []
  protocols: string[] = []
  node: any // Libp2p
  profile: Profile
  config: XchLibp2pConfig
  taskManagers: TaskManagerCombination

  private constructor() {
    super()
  }

  public static async create(options: { profile: Profile, taskManagers: TaskManagerCombination }): Promise<P2pLayer> {
    const newP2pLayer = new P2pLayer()
    assignOptions(newP2pLayer, options)

    return newP2pLayer
  }

  public addConsoleFunctions(argMap: Map<string, (args: string[]) => Promise<any>>): void {
    addConsoleFunctions(debug, this, argMap, [])
  }

  private async substitutePublicAddress(): Promise<void> {
    // Replace peerInfo in identifyService to set a different publicly available address
    if (this.node.identifyService) {
      const publicPeerInfo = new PeerInfo(this.config.peerId)
      publicPeerInfo.id = this.node.peerInfo.id
      publicPeerInfo.multiaddrs = this.config.overridingPublicAddressPrefixes ? this.config.overridingPublicAddressPrefixes.map((addrStr) => Multiaddr(addrStr)) : this.node.peerInfo.multiaddrs
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
    for (const [topic, dataType] of this.topics) {
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

  private async pingAllPeers(): Promise<void> {
    const pingPromises = Array.from(this.node.peerStore.peers.entries()).map(([peerId, peerInfo]: [PeerId, PeerInfo]) => this.node.ping(peerInfo))

    await Promise.all(pingPromises)
    debug.info(`scheduled pinged ${pingPromises.length} peers`)
  }

  public getRandomPeer(): PeerInfo {
    const peers: [PeerId, PeerInfo][] = Array.from(this.node.peerStore.peers.entries())
    const randomPeer = peers[Math.floor(Math.random() * peers.length)][1]
    return randomPeer
  }

  private async saveAllPeers(): Promise<void> {
    await getConnection()
      .createQueryBuilder()
      .delete()
      .from(PeerInfoEntity)
      .execute()

    await getConnection()
      .createQueryBuilder()
      .delete()
      .from(MultiaddrEntity)
      .execute()

    debug.info(`scheduled cleared old peers`)

    const savePeerPromises = Array.from(this.node.peerStore.peers.values()).map(
      (peerInfo: PeerInfo) => (async (): Promise<void> => {
        const peerInfoEntity = await PeerInfoEntity.fromPeerInfo(peerInfo)
        await peerInfoEntity.save()
      })()
    )

    await Promise.all(savePeerPromises)
    debug.info(`scheduled saved ${savePeerPromises.length} peers`)
  }

  private async loadAllPeersFromDb(): Promise<void> {
    const peerInfoEntities = await PeerInfoEntity.find({
      relations: ["multiaddrs"]
    })

    const peerInfos = await Promise.all(peerInfoEntities.map(peerInfoEntity => peerInfoEntity.toPeerInfo()))

    peerInfos.forEach(peerInfo => {
      this.node.peerStore.put(peerInfo)
    })
  }

  public async call(peer: PeerInfo, protocols: string[]): Promise<Telephone> {
    const { stream } = await this.node.dialProtocol(peer, protocols)
    const telephone = new Telephone({ name: `${peer.id.toB58String()}: ${protocols.join(",")}` })
    itPipe(
      stream,
      itLengthPrefixed.decode(),
      itJson.decoder,
      telephone,
      itJson.encoder,
      itLengthPrefixed.encode(),
      stream
    )

    return telephone
  }

  public async start(): Promise<void> {
    if (!this.profile) {
      throw Error("profile not assigned")
    }

    this.config = this.config ? this.config : this.profile.config

    this.node = this.node ? this.node : await Libp2p.create({
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
    })

    await this.substitutePublicAddress()

    // Add listenAddrs
    this.config.listenAddrs.forEach((addrStr) => {
      this.node.peerInfo.multiaddrs.add(Multiaddr(addrStr))
    })

    // Add saved peers
    await this.loadAllPeersFromDb()

    // Add protocol handlers
    this.node.handle("/test", ({ stream }) => {
      const telephone = new Telephone()
      itPipe(
        stream,
        itLengthPrefixed.decode(),
        itJson.decoder,
        telephone,
        itJson.encoder,
        itLengthPrefixed.encode(),
        stream
      )
    })

    for (const protocol of this.protocols) {
      this.node.handle(protocol, ({ connection, stream }) => {
        const telephone = new Telephone({ name: `${connection.remoteAddr.toString()}, ${protocol}` })
        itPipe(
          stream,
          itLengthPrefixed.decode(),
          itJson.decoder,
          telephone,
          itJson.encoder,
          itLengthPrefixed.encode(),
          stream
        )

        this.emit(protocol, telephone)
      })
    }

    // start
    await this.node.start()
    await this.printListeningAddrs()

    await this.listenForEvents()
    await this.subscribeForPubSub()

    this.taskManagers.scheduledParallelism?.register(this.printKnownAddrs.bind(this))
    this.taskManagers.scheduledParallelism?.register(this.pingAllPeers.bind(this))
    this.taskManagers.scheduledParallelism?.register(this.saveAllPeers.bind(this))

    this.taskManagers.scheduledParallelism?.register(new Task({
      func: this.broadcastTest.bind(this),
      description: "broadcastTest",
      args: []
    }))
  }
}

