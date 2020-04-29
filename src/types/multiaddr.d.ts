declare module "multiaddr" {
    export interface Proto {
        code: number
        name: string
        size: number
    }

    export interface NodeAddr {
        family: string
        port: number
        address: string
    }
    export class Multiaddr {
        public constructor(addr: string | Buffer | Multiaddr)
        public buffer: Buffer
        public toString(): string
        public protos(): Proto[]
        public nodeAddress(): NodeAddr
        public encapsulate(addr: Multiaddr | string): Multiaddr
        public decapsulate(addr: Multiaddr | string): Multiaddr
        public protoCodes(): number[]
        public protoNames(): string[]
        public tuples(): [number, Buffer][]
        public stringTuples(): [number, string][]
        public getPeerId(): string | undefined
    }

    export default function (addr: string | Buffer | Multiaddr): Multiaddr

}