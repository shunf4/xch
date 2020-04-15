import Libp2pCrypto from "libp2p-crypto"

const Constant: {
  DefaultPeerIdKeyType: Libp2pCrypto.KeyType,
  DefaultTransportModules: string[],
  DefaultConnEncryptionModules: string[],
  DefaultStreamMuxerModules: string[],
  DefaultPeerDiscoveryModules: string[],
  DefaultDhtModule: string,
  DefaultPubsubModule: string,
  DefaultLibp2pConfig: any,

  DefaultListenAddrs: string[],
} = {
  DefaultPeerIdKeyType: "Ed25519",
  DefaultTransportModules: ["libp2p-tcp"],
  DefaultConnEncryptionModules: ["libp2p-secio"],
  DefaultStreamMuxerModules: ["libp2p-mplex"],
  DefaultPeerDiscoveryModules: ["libp2p-bootstrap", "libp2p-mdns"],
  DefaultDhtModule: "libp2p-kad-dht",
  DefaultPubsubModule: "libp2p-gossipsub",
  DefaultLibp2pConfig: {
    peerDiscovery: {
      autoDial: true,
      ["bootstrap"]: {
        enabled: true,
        list: ["/dns4/sirius.moeloli.ltd/tcp/31789/p2p/12D3KooWDvYwEFqaYdq4f9S5AtavQ9E5KB8DHQVodjUD3x4k1THH"]
      },
      ["mdns"]: {
        interval: 20e3,
        enabled: true
      }
    },
    dht: {
      enabled: true,
      randomWalk: {
        enabled: true,
        interval: 10e3,
        timeout: 10e3
      }
    },
  },

  DefaultListenAddrs: ["/ip4/0.0.0.0/tcp/31789"]
}

export default Constant

