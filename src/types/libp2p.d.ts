declare module "libp2p" {
  import { EventEmitter } from "events"
  import PeerId from "peer-id";
  import PeerInfo from "peer-info";
  import { Multiaddr } from "multiaddr";

  interface ContentRouting {
    provide(key: Buffer, callback: () => any): void
    findProviders(key: Buffer, opts: {maxTimeout: number, maxNumProviders: number}, callback: () => any): void
  }

  interface Connection {
    getPeerInfo(cb: (err: Error, peer: PeerInfo) => void): void
    setPeerInfo(peer: PeerInfo): void
    getObservedAddrs(cb: (err: Error, multiaddr: string[]) => void): void
  }
  
  interface PeerBook {
    has(peerInfo: PeerInfo | PeerId | string): boolean
    put(peerInfo: PeerInfo, replace: boolean): void
    getAllArray(): PeerInfo[]
    getAll(): {[bs58: string]: PeerInfo}
    get(peer: PeerInfo | PeerId | string): PeerInfo
    remove(peer: PeerInfo | PeerId | string): void
    getMultiaddrs(peer: PeerInfo | PeerId | string): string[]
  }

  type msg = {from: string, seqno: Buffer, data: Buffer, topicIDs: string[] }
  // https://github.com/ipfs/interface-js-ipfs-core/blob/master/SPEC/PUBSUB.md
  interface PubSub {
    subscribe(topic: string, options: {discover?: boolean}, handler: (message: msg) => void, callback: (err?: Error) => void): Promise<void> | void
    unsubscribe(topic: string, handler: (message: msg) => void, callback: (err?: Error) => void): Promise<void> | void
    publish(topic: string, data: Buffer, callback: (err?: Error) => void): Promise<void> | void
    ls(callback: (err: Error | null, ls: string[]) => void): Promise<void> | void
    peers(topic: string | ((err: Error | null, ls: string[]) => void), callback?: (err: Error | null, ls: string[]) => void): Promise<void> | void
  }

  /**
   * @fires Node#error Emitted when an error occurs
   * @fires Node#peer:connect Emitted when a peer is connected to this node
   * @fires Node#peer:disconnect Emitted when a peer disconnects from this node
   * @fires Node#peer:discovery Emitted when a peer is discovered
   * @fires Node#start Emitted when the node and its services has started
   * @fires Node#stop Emitted when the node and its services has stopped
   */
  export default class Node extends EventEmitter {
    /**
     *
     * @param _options
     */
    public constructor (_options: {peerInfo: PeerInfo, [key: string]: any})
    public peerInfo: PeerInfo
    public isStarted(): boolean
    public pubsub: PubSub
    public peerBook: PeerBook
    public contentRouting: ContentRouting

    /**
     * Overrides EventEmitter.emit to conditionally emit errors
     * if there is a handler. If not, errors will be logged.
     * @param {string} eventName
     * @param  {...any} args
     * @returns {void}
     * @param eventName
     * @param ...args
     * @return
     */
    public emit(eventName: string, ...args: any): any

    /**
     * Starts the libp2p node and all sub services
     *
     * @param {function(Error)} callback
     * @returns {void}
     * @param callback
     * @return
     */
    public start(callback: (err: Error) => void): any

    /**
     * Stop the libp2p node by closing its listeners and open connections
     *
     * @param {function(Error)} callback
     * @returns {void}
     * @param callback
     * @return
     */
    public stop(callback: (err: Error) => void): any

    /**
     * Dials to the provided peer. If successful, the `PeerInfo` of the
     * peer will be added to the nodes `PeerBook`
     *
     * @param {PeerInfo|PeerId|Multiaddr|string} peer The peer to dial
     * @param {function(Error)} callback
     * @returns {void}
     * @param peer
     * @param callback
     * @return
     */
    public dial(peer: Multiaddr | PeerId | PeerInfo | string, callback: (err: Error) => void): void

    /**
     * Dials to the provided peer and handshakes with the given protocol.
     * If successful, the `PeerInfo` of the peer will be added to the nodes `PeerBook`,
     * and the `Connection` will be sent in the callback
     *
     * @param {PeerInfo|PeerId|Multiaddr|string} peer The peer to dial
     * @param {string} protocol
     * @param {function(Error, Connection)} callback
     * @returns {void}
     * @param peer
     * @param protocol
     * @param callback
     */
    public dialProtocol(peer: Multiaddr | PeerId | PeerInfo | string, protocol: string, callback: (err: Error, conn: Connection) => void): void

    /**
     * Similar to `dial` and `dialProtocol`, but the callback will contain a
     * Connection State Machine.
     *
     * @param {PeerInfo|PeerId|Multiaddr|string} peer The peer to dial
     * @param {string} protocol
     * @param {function(Error, ConnectionFSM)} callback
     * @returns {void}
     * @param peer
     * @param protocol
     * @param callback
     * @return
     */
    public dialFSM(peer: Multiaddr | PeerId | PeerInfo | string, protocol: string, callback: (err: Error, conn: any) => void): void

    /**
     *
     * @param peer
     * @param callback
     */
    public hangUp(peer: Multiaddr | PeerId | PeerInfo | string, callback: (err: Error) => void): void

    /**
     *
     * @param peer
     * @param callback
     */
    public ping(peer: Multiaddr | PeerId | PeerInfo | string, callback: (err: Error)  => void): void

    /**
     *
     * @param protocol
     * @param handlerFunc
     * @param matchFunc
     */
    public handle(protocol: string, handlerFunc: (protocol: string, conn: Connection) => void, matchFunc?: any): void

    /**
     *
     * @param protocol
     */
    public unhandle(protocol: string): void

    public _onStarting(): void
    public _onStopping(): void
  }
}
