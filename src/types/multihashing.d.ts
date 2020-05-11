declare module "multihashing" {
    export interface Hasher {
        update(data: Buffer): void,
        digest(): Buffer,
    }

    export function createHash(func: string): Hasher
}