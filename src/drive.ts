import dotenv from "dotenv"
dotenv.config()

const Libp2p = require("libp2p")
const { IdentifyService, multicodecs: IDENTIFY_PROTOCOLS } = require("libp2p/src/identify")
const PeerInfo = require("peer-info")
const PeerId = require("peer-id")

import multiaddr from "multiaddr"

import { ProfileManager } from "./profileManager"
import { sleep } from "./xchUtil"
import Debug from "debug"

const debug = Debug("xch:main")
const eventsDebug = Debug("xch:events")

async function main(): Promise<void> {
  try {
    // ProfileManager.create({ profileDir: path.join(os.homedir(), ".xch") })
    const profileManager = await ProfileManager.create({ profileDir: "./.xch" })
    const config = profileManager.config

    const node = await Libp2p.create({
      modules: {
        transport: config.transportModules.map((moduleName) => require(moduleName)),
        connEncryption: config.connEncryptionModules.map((moduleName) => require(moduleName)),
        streamMuxer: config.streamMuxerModules.map((moduleName) => require(moduleName)),
        peerDiscovery: config.peerDiscoveryModules.map((moduleName) => require(moduleName)),
        dht: require(config.dhtModule),
        pubsub: require(config.pubsubModule),
      },
      config: config.libp2pConfig,
      peerInfo: new PeerInfo(config.peerId)
    })

    node.on("peer:discovery", (peer) => {
      eventsDebug("Discovered %s", peer.id.toB58String())
    })

    node.on("peer:connect", (peer) => {
      eventsDebug("Connected to %s", peer.id.toB58String())
    })

    // Replace peerInfo in identifyService

    if (node.identifyService) {
      const publicPeerInfo = new PeerInfo(config.peerId)
      publicPeerInfo.id = node.peerInfo.id
      publicPeerInfo.multiaddrs = config.overridingPublicAddressPrefixes ? config.overridingPublicAddressPrefixes.map((addrStr) => multiaddr(addrStr)) : node.peerInfo.multiaddrs
      publicPeerInfo.protocols = node.peerInfo.protocols

      node.identifyService = new IdentifyService({
        registrar: node.registrar,
        peerInfo: publicPeerInfo,
        protocols: node.upgrader.protocols
      })

      node.handle(Object.values(IDENTIFY_PROTOCOLS), node.identifyService.handleMessage)
    }

    // Add listenAddrs
    config.listenAddrs.forEach((addrStr) => {
      node.peerInfo.multiaddrs.add(multiaddr(addrStr))
    })

    // start
    await node.start()
    debug("libp2p has started!")

    const addresses = node.peerInfo.multiaddrs.toArray()
    let listenDescStr = "listening on addresses:"
    addresses.forEach(addr => {
      listenDescStr += `\n  ${addr.toString()}/p2p/${node.peerInfo.id.toB58String()}`
    })
    debug(listenDescStr)

    const knownFunc = () => async (): Promise<void> => {
      let knownAddrsStr = "known addresses:"
      for (const [peerId, peerInfo] of node.peerStore.peers.entries()) {
        knownAddrsStr += `\n  ${peerId}:`
  
        peerInfo.multiaddrs.toArray().forEach(addr => {
          knownAddrsStr += `\n    ${addr.toString()}`
        })
      }
      debug(knownAddrsStr)
    }

    setInterval(knownFunc(), 3000)
    knownFunc()

  } catch (e) {
    if (e.stack) {
      debug(`Stack(${e.constructor.name}): ${e.stack}`)
    } else {
      debug(`${e.constructor.name}: ${e.message}`)
    }
  }
}

/* eslint @typescript-eslint/no-floating-promises: "off" */ 
main()
