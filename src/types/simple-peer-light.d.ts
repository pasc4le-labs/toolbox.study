declare module "simple-peer-light" {
  import { EventEmitter } from "events";

  export interface SimplePeerInstance extends EventEmitter {
    connected: boolean;
    destroyed: boolean;
    send(data: string | Uint8Array | ArrayBuffer): void;
    signal(data: unknown): void;
    destroy(): void;

    on(event: "signal", listener: (data: unknown) => void): this;
    on(event: "connect", listener: () => void): this;
    on(event: "data", listener: (data: Uint8Array | string) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "close", listener: () => void): this;
  }

  export interface SimplePeerOpts {
    initiator?: boolean;
    trickle?: boolean;
    config?: {
      iceServers?: Array<{ urls: string }>;
    };
    stream?: MediaStream;
    channelConfig?: RTCDataChannelInit;
    channelName?: string;
  }

  const Peer: {
    new (opts?: SimplePeerOpts): SimplePeerInstance;
  };

  export default Peer;
}
