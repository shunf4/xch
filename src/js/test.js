const Libp2p = require("libp2p")
const TCP = require("libp2p-tcp")
const SECIO = require("libp2p-secio")
const MPLEX = require("libp2p-mplex")
const KadDHT = require("libp2p-kad-dht")
const multiaddr = require("multiaddr")
const Bootstrap = require("libp2p-bootstrap")
const Gossipsub = require("libp2p-gossipsub")
const PeerInfo = require("peer-info")
const PeerId = require("peer-id")
const fs = require("fs")
const YAML = require("yaml")

const sleep = async (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms)
})

const main = async () => {
  const confFileName = "./config.yaml"
  let confFileHandle = null
  let config = {}
  let peerId = null

  try {
    confFileHandle = await fs.promises.open(confFileName, "r")

    let configJSON = await confFileHandle.readFile({encoding: "utf8"})
    await confFileHandle.close()
    config = YAML.parse(configJSON)

    if (config === null) {
      config = {}
    }

    peerId = await PeerId.createFromJSON(config.peerId)
    
    if (!(config.bootstrapMultiaddrs instanceof Array)) {
      config.bootstrapMultiaddrs = null
      throw Error;
    }
  }
  catch (e) {
    console.log(`${confFileName} not exists or wrong peerId format. Creating one...`)
    confFileHandle = await fs.promises.open(confFileName, "w")

    if (peerId === null) {
      peerId = await PeerId.create({keyType: "Ed25519"})
      config = Object.assign(config, { peerId: peerId.toJSON() })
    }

    if (config.bootstrapMultiaddrs == null) {
      config = Object.assign(config, { bootstrapMultiaddrs: ["/dns4/sirius.moeloli.ltd/tcp/31789/p2p/12D3KooWDvYwEFqaYdq4f9S5AtavQ9E5KB8DHQVodjUD3x4k1THH"] })
    }

    await confFileHandle.write(YAML.stringify(config), 0, "utf8")
    await confFileHandle.close()
    console.log(`Created ${confFileName}.`)
  }
  
	const node = await Libp2p.create({
		modules: {
			transport: [TCP],
      connEncryption: [SECIO],
      streamMuxer: [MPLEX],
      peerDiscovery: [Bootstrap],
      dht: KadDHT,
      pubsub: Gossipsub
		},
    config: {
      peerDiscovery: {
        autoDial: true,
        [Bootstrap.tag]: {
          enabled: true,
          list: config.bootstrapMultiaddrs
        }
      },
      dht: {
        enabled: false
      }
    },
    peerInfo: new PeerInfo(peerId)
  })

  node.on("peer:discovery", (peer) => {
    console.log("Discovered %s", peer.id.toB58String())
  })

  node.on("peer:connect", (peer) => {
    console.log("Connected to %s", peer.id.toB58String())
  })
  
  const listenAddress = multiaddr(`/ip4/0.0.0.0/tcp/31789`)
  node.peerInfo.multiaddrs.add(listenAddress)

  try {
    await node._onStarting()
    if (config.externalAddressPrefixes) {
      node.peerInfo.multiaddrs.clear()
      config.externalAddressPrefixes.forEach((prefix) => {
        const externalAddress = multiaddr(`${prefix}/tcp/31789`)
        node.peerInfo.multiaddrs.add(externalAddress)
      })
    }
    await node._onDidStart()
  } catch (err) {
    node.emit('error', err)
    await node.stop()
    throw err
  }
  console.log("libp2p has started!")

  const addresses = node.peerInfo.multiaddrs.toArray()
  console.log("listening on addresses:")
  addresses.forEach(addr => {
    console.log(`${addr.toString()}/p2p/${node.peerInfo.id.toB58String()}`)
  })

  await node.pubsub.subscribe("blockchain", (msg) => {
    console.log(`Received from topic blockchain: ${msg.data.toString()}`)
  })

  if (peerId.toB58String() === "12D3KooWJngbJna5eGdmFWYYv5zZYcceKU798Fh4pWGhfFJ2BToR") {
    (async () => {
      await sleep(1000)
      node.pubsub.publish("blockchain", Buffer.from("bird bird bird, bird is the word!"))
    })()
  }

  const stop = async () => {
    await node.stop()
    console.log("libp2p has stopped")
    process.exit(0)
  }

  let nowPinging = {}
  const pingFunc = (theOneToPing) => async () => {
    if (nowPinging[theOneToPing]) return
    nowPinging[theOneToPing] = true

    console.log(`Pinging ${theOneToPing}...`)
    let latencyMillisec
    try {
      latencyMillisec = await node.ping(theOneToPing)
    } catch (e) {
      console.error(`Pinging error: ${e}`)
      latencyMillisec = -1
    }
    console.log(`Ping ${theOneToPing}: ${latencyMillisec}ms.`)
    nowPinging[theOneToPing] = false
  }

  const knownFunc = () => async () => {
    await sleep(3000)

    console.log("known addresses:")
    for (const [peerId, peerInfo] of node.peerStore.peers.entries()) {
      console.log(`${peerId}:`)

      peerInfo.multiaddrs.toArray().forEach(addr => {
        console.log(`  ${addr.toString()}`)
      })
    }

    // let testFindPeer
    // console.log("Finding peer 12D3KooWQJdRARCwhgShzxAY7G4qngKYPcZgjm8e87teqc3UQqQd...")
    // try {
    //   testFindPeer = await node.peerRouting.findPeer(PeerId.createFromB58String("12D3KooWQJdRARCwhgShzxAY7G4qngKYPcZgjm8e87teqc3UQqQd"))
    //   testFindPeer.multiaddrs.forEach((ma) => console.log(`  ${ma.toString()}`))
    // } catch (e) {
    //   console.error(`Finding peer error: ${e}`)
    // }

    // console.log("known addresses:")
    // for (const [peerId, peerInfo] of node.peerStore.peers.entries()) {
    //   console.log(`${peerId}:`)

    //   peerInfo.multiaddrs.toArray().forEach(addr => {
    //     console.log(`  ${addr.toString()}`)
    //   })
    // }
  }

  // setInterval(pingFunc(PeerId.createFromB58String("12D3KooWQJdRARCwhgShzxAY7G4qngKYPcZgjm8e87teqc3UQqQd")), 3000)
  setInterval(knownFunc(), 3000)
  knownFunc()

  //while (true) ;
  //process.on("SIGTERM", stop)
  //process.on("SIGINT", stop)

}

main()
