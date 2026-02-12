import "socket.io";

declare module "socket.io" {
  interface SocketData {
    auth?: {
      tenantId: string;
      userId: string;
      role: string;
    };
  }
}
