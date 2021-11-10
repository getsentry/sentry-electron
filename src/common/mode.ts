/** Ways to communicate between the renderer and main process  */
export enum IPCMode {
  /** Configures Electron IPC to receive messages from renderers */
  Classic = 1,
  /** Configures Electron protocol module to receive messages from renderers */
  Protocol = 2,
  /**
   * Configures both methods for best compatibility.
   *
   * Renderers favour IPC but fall back to protocol if IPC has not
   * been configured in a preload script
   */
  Both = 3,
}
