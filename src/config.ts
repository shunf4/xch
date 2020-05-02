import PeerId from "peer-id"
import YAML from "yaml"
import Constants from "./constants"
import Debug from "debug-level"
import { KeyType } from "libp2p-crypto"
import { ConfigValueError, ConfigTypeError } from "./errors"
import { assertInstanceOf } from "./xchUtil"

const debug = Debug("xch:config")

interface IXchLibp2pConfig {
  overridingPublicAddressPrefixes: string[] | null,
  peerId: PeerId,
  transportModules: string[],
  connEncryptionModules: string[],
  streamMuxerModules: string[],
  peerDiscoveryModules: string[],
  dhtModule: string,
  pubsubModule: string,
  libp2pConfig: any,

  listenAddrs: string[],

  extraAccountPeerIds: PeerId[],
}


type DefaultGenerator<T> = {
  [P in keyof T]: () => Promise<T[P]>
}


type Normalizer<T> = {
  [P in keyof T]: (toBeNormalized: any) => Promise<T[P]>
}


const XchLibp2pConfigDefaultGenerator: DefaultGenerator<IXchLibp2pConfig> = {
  overridingPublicAddressPrefixes: async () => null,
  peerId: async () => {
    return await PeerId.create({keyType: Constants.DefaultPeerIdKeyType as KeyType})
  },
  transportModules: async () => {
    return Constants.DefaultTransportModules.slice()
  },
  connEncryptionModules: async () => {
    return Constants.DefaultConnEncryptionModules.slice()
  },
  streamMuxerModules: async () => {
    return Constants.DefaultStreamMuxerModules.slice()
  },
  peerDiscoveryModules: async () => {
    return Constants.DefaultPeerDiscoveryModules.slice()
  },
  dhtModule: async () => {
    return Constants.DefaultDhtModule
  },
  pubsubModule: async () => {
    return Constants.DefaultPubsubModule
  },
  libp2pConfig: async () => {
    return JSON.parse(JSON.stringify(Constants.DefaultLibp2pConfig))
  },
  listenAddrs: async () => {
    return Constants.DefaultListenAddrs.slice()
  },
  extraAccountPeerIds: async () => {
    return []
  }
}

const _stringArrayNormalizer = async (input: any): Promise<string[]> => {
  if (!(input instanceof Array) || !(input as any[]).every((v) => (typeof v) === "string")) {
    throw new ConfigTypeError("input is not string[]")
  }

  return input as string[]
}

const _stringNormalizer = async (input: any): Promise<string> => {
  if (!(typeof input === "string")) {
    throw new ConfigTypeError("input is not string")
  }

  return input as string
}

const XchLibp2pConfigNormalizer: Normalizer<IXchLibp2pConfig> = {
  overridingPublicAddressPrefixes: async (input: any) => {
    if (input === undefined) {
      throw new ConfigTypeError("input is undefined or null")
    }

    if (input === null) {
      return null
    }

    if (!(input instanceof Array) || !(input as any[]).every((v) => (typeof v) === "string")) {
      throw new ConfigTypeError("input is not string[]")
    }

    return input as string[]
  },

  peerId: async (input: any) => {
    if (input === null || input === undefined) {
      throw new ConfigTypeError("input is undefined or null")
    }

    const peerId = await PeerId.createFromJSON(input as PeerId.JSONPeerId)
    if (!peerId.isValid()) {
      throw new ConfigTypeError(`peerId invalid`)
    }
    
    return peerId
  },

  transportModules: _stringArrayNormalizer,
  connEncryptionModules: _stringArrayNormalizer,
  streamMuxerModules: _stringArrayNormalizer,
  peerDiscoveryModules: _stringArrayNormalizer,
  dhtModule: _stringNormalizer,
  pubsubModule: _stringNormalizer,
  libp2pConfig: async (input: any) => {
    if (input === null || input === undefined) {
      throw new ConfigTypeError("input is undefined or null")
    }
    return input
  },
  listenAddrs: _stringArrayNormalizer,
  extraAccountPeerIds: async (input: any) => {
    assertInstanceOf(input, Array, ConfigTypeError, "config.extraAccountPeerIds")
    
    const result: PeerId[] = []
    const inputArray = input as any[]
    for (const peerIdObj of inputArray) {
      const peerId = await PeerId.createFromJSON(peerIdObj as PeerId.JSONPeerId)
      if (!peerId.isValid()) {
        throw new ConfigTypeError(`peerId invalid: ${peerIdObj}`)
      }
      result.push(peerId)
    }

    return result
  },
}


export class XchLibp2pConfig implements IXchLibp2pConfig {
  overridingPublicAddressPrefixes: string[] | null
  peerId: PeerId
  transportModules: string[]
  connEncryptionModules: string[]
  streamMuxerModules: string[]
  peerDiscoveryModules: string[]
  dhtModule: string
  pubsubModule: string
  libp2pConfig: any
  listenAddrs: string[]
  extraAccountPeerIds: PeerId[]

  toString(): string {
    return YAML.stringify(this)
  }

  static async createFromStrings(strs: string[]):
    Promise<{ finalConfig: XchLibp2pConfig,
      createdDefaultConfig: Partial<XchLibp2pConfig>,
    }> {
    const config = new XchLibp2pConfig()
    const createdDefaultConfig = new XchLibp2pConfig()
    const loadedConfigs = strs.map((str) => {
      const result = YAML.parse(str)
      return result ? result : {}
    })

    for (const currConfig of loadedConfigs) {
      for (const [k, v] of Object.entries(currConfig)) {
        if (XchLibp2pConfigNormalizer[k] === undefined) {
          throw new ConfigTypeError(`invalid configuration key: ${k}`)
        }

        if (Object.prototype.hasOwnProperty.call(config, k)) {
          continue
        }

        try {
          config[k] = await XchLibp2pConfigNormalizer[k](v)
        } catch (err) {
          debug.error(`invalid value of config "${k}": ${err.message}`)
          throw err
        }
      }
    }

    for (const [k, defaultGenerator] of Object.entries(XchLibp2pConfigDefaultGenerator)) {
      if (Object.prototype.hasOwnProperty.call(config, k)) {
        continue
      }

      createdDefaultConfig[k] = await defaultGenerator()
    }

    Object.assign(config, createdDefaultConfig)
    return {
      finalConfig: config,
      createdDefaultConfig
    }
  }
}
