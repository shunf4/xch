declare module "object-hash" {
  interface IStream {
    update?(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void;
    write?(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void;
  }

  export interface IOptions {
    algorithm?: string;
    encoding?: string;
    excludeValues?: boolean;
    ignoreUnknown?: boolean;
    replacer?: (value: any) => any;
    respectFunctionProperties?: boolean;
        respectFunctionNames?: boolean;
        respectType?: boolean;
    unorderedArrays?: boolean;
        unorderedSets?: boolean;
        unorderedObjects?: boolean;
    excludeKeys?: (key: string) => boolean;
  }

  export interface Hash {
    (object: any, options?: IOptions & {
      encoding: "buffer" 
    }): Buffer;
    (object: any, options?: IOptions): string;
    sha1(object: any): string;
    keys(object: any): string;
    MD5(object: any): string;
    keysMD5(object: any): string;
    writeToStream(value: any, stream: IStream): void;
    writeToStream(value: any, options: IOptions, stream: IStream): void;
  }

  const HashStatic: Hash;
  export default HashStatic;
}