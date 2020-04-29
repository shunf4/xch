declare module 'peer-info' {
    import { Multiaddr } from "multiaddr";
    import PeerId, { PeerIdData } from "peer-id";
    export function create(id: PeerIdData | PeerId, callback: (err: Error, peerInfo: PeerInfo) => void): void

    type MultiaddrIsh = Multiaddr | string
    export class MutliAddrSet {
        public add(addr: Multiaddr | string): void
        public addSafe(addr: Multiaddr): boolean | undefined
        public toArray(): Multiaddr[]
        public forEach(cb: (addr: Multiaddr) => void): void
        public filterBy(regx: RegExp): Multiaddr[]
        public has(addr: Multiaddr): boolean
        public delete(addr: Multiaddr): boolean | undefined
        public replace(existing: MultiaddrIsh | MultiaddrIsh[], fresh: MultiaddrIsh | MultiaddrIsh[]): void
        public clear(): void
        public distinct(): Multiaddr[]
    }

    export default class PeerInfo {
        public constructor(id?: PeerId)
        public multiaddrs: MutliAddrSet
        public protocols: Set<string>
        public id: PeerId
    }
}