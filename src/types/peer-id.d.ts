declare module 'peer-id' {
    import { RsaPrivateKey, RsaPublicKey } from "libp2p-crypto";
    export interface PeerIdData {
        id: string,
        privKey: string,
        pubKey: string
    }

    export default class PeerId {
        public constructor(id: Buffer, privKey?: RsaPrivateKey, pubKey?: RsaPublicKey)
        
        public toHexString(): string
        public toBytes(): Buffer
        public toB58String(): string
        public toJSON(): PeerIdData
        public toPrint(): string
        public isEqual(id: PeerId | Buffer): boolean

        public static create(opts: {bits: number}, callback: (err: Error, id: PeerId) => void): void
        public static createFromHexString(str: string): PeerId
        public static createFromBytes(buf: Buffer): PeerId
        public static createFromB58String(str: string): PeerId
        public static createFromPubKey(pubKey: Buffer): PeerId
        public static createFromPrivKey(privKey: Buffer): PeerId
        public static createFromJSON(obj: PeerIdData): PeerId
    }
}