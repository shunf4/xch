import PeerId from "peer-id"
import YAML from "yaml"
import Constant from "./constant"
import Debug from "debug"

const debug = Debug("xch:config")

class ConfigError extends Error {
  constructor(message?: string) {
    super(message)
  }
}


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
}


type DefaultGenerator<T> = {
  [P in keyof T]: () => Promise<T[P]>
}


type ValidatorTransformer<T> = {
  [P in keyof T]: (toBeValidated: any) => Promise<T[P]>
}


const XchLibp2pConfigDefaultGenerator: DefaultGenerator<IXchLibp2pConfig> = {
  overridingPublicAddressPrefixes: async () => null,
  peerId: async () => {
    return await PeerId.create({keyType: Constant.DefaultPeerIdKeyType})
  },
  transportModules: async () => {
    return Constant.DefaultTransportModules.slice()
  },
  connEncryptionModules: async () => {
    return Constant.DefaultConnEncryptionModules.slice()
  },
  streamMuxerModules: async () => {
    return Constant.DefaultStreamMuxerModules.slice()
  },
  peerDiscoveryModules: async () => {
    return Constant.DefaultPeerDiscoveryModules.slice()
  },
  dhtModule: async () => {
    return Constant.DefaultDhtModule
  },
  pubsubModule: async () => {
    return Constant.DefaultPubsubModule
  },
  libp2pConfig: async () => {
    return JSON.parse(JSON.stringify(Constant.DefaultLibp2pConfig))
  },
  listenAddrs: async () => {
    return Constant.DefaultListenAddrs.slice()
  },
}

const _stringArrayValidator = async (input: any) => {
  if (!(input instanceof Array) || !(input as any[]).every((v) => (typeof v) === "string")) {
    throw TypeError("input is not string[]")
  }

  return input as string[]
}

const _stringValidator = async (input: any) => {
  if (!(typeof input === "string")) {
    throw TypeError("input is not string")
  }

  return input as string
}

const XchLibp2pConfigValidatorTransformer: ValidatorTransformer<IXchLibp2pConfig> = {
  overridingPublicAddressPrefixes: async (input: any) => {
    if (input === undefined) {
      throw TypeError("input is undefined or null")
    }

    if (input === null) {
      return null
    }

    if (!(input instanceof Array) || !(input as any[]).every((v) => (typeof v) === "string")) {
      throw TypeError("input is not string[]")
    }

    return input as string[]
  },

  peerId: async (input: any) => {
    if (input === null || input === undefined) {
      throw TypeError("input is undefined or null")
    }

    const peerId = await PeerId.createFromJSON(input as PeerId.JSONPeerId)
    if (!peerId.isValid()) {
      throw new ConfigError(`peerId invalid`)
    }
    
    return peerId
  },

  transportModules: _stringArrayValidator,
  connEncryptionModules: _stringArrayValidator,
  streamMuxerModules: _stringArrayValidator,
  peerDiscoveryModules: _stringArrayValidator,
  dhtModule: _stringValidator,
  pubsubModule: _stringValidator,
  libp2pConfig: async (input: any) => {
    if (input === null || input === undefined) {
      throw TypeError("input is undefined or null")
    }
    return input
  },
  listenAddrs: _stringArrayValidator,
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

  toString(): string {
    return YAML.stringify(this)
  }

  static async createFromStrings(strs: string[]):
    Promise<{ finalConfig: XchLibp2pConfig,
      createdDefaultConfig: Partial<XchLibp2pConfig>,
    }> {
    const config = new XchLibp2pConfig()
    const createdDefaultConfig = new XchLibp2pConfig()
    const loadedConfigs = strs.map((str) => YAML.parse(str))

    for (const currConfig of loadedConfigs) {
      for (const [k, v] of Object.entries(currConfig)) {
        if (XchLibp2pConfigValidatorTransformer[k] === undefined) {
          throw new ConfigError(`invalid configuration key: ${k}`)
        }

        if (Object.prototype.hasOwnProperty.call(config, k)) {
          continue
        }

        try {
          config[k] = await XchLibp2pConfigValidatorTransformer[k](v)
        } catch (err) {
          debug(`invalid config "${k}": ${err.message}`)
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
