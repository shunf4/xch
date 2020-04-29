declare module "libp2p-crypto" {
    export function randomBytes(bytes: number): Buffer
    export class RsaPublicKey {
        public constructor(key: object)
        public verify(data: Buffer, sig: Buffer, callback: any): void
        public marshal(): any
        public bytes(): Buffer
        public encrypt(bytes: Buffer): Buffer
        public equals(key: RsaPublicKey): boolean
        public hash(callback: any): void
    }

    export class RsaPrivateKey {
        // key       - Object of the jwk format
        // publicKey - Buffer of the spki format
        public constructor(key: object, publicKey: Buffer)
        public genSecret(): Buffer

        public sign(message: string | Buffer, callback: any): void

        public public(): RsaPublicKey

        public decrypt(msg: string | Buffer, callback: any): void

        public marshal(): any

        public bytes(): Buffer

        public equals(key: any): boolean

        public hash(callback: any): void

        /**
         * Gets the ID of the key.
         *
         * The key id is the base58 encoding of the SHA-256 multihash of its public key.
         * The public key is a protobuf encoding containing a type and the DER encoding
         * of the PKCS SubjectPublicKeyInfo.
         *
         * @param {function(Error, id)} callback
         * @returns {undefined}
         */
        public id(callback: (err: Error, id: any) => void): void

        /**
         * Exports the key into a password protected PEM format
         *
         * @param {string} [format] - Defaults to 'pkcs-8'.
         * @param {string} password - The password to read the encrypted PEM
         * @param {function(Error, KeyInfo)} callback
         * @returns {undefined}
         */
        public export(format: string, password: string, callback: (err: Error, key: any) => void): void
    }
    export let keys: any
}